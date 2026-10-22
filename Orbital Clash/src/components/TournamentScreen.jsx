import { Component, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { audioManager } from "../engine/audio/AudioManager";
import {
  MATCH_CLOCK_SECONDS,
  ROUND_LABELS,
  TOTAL_MATCHES,
  TOURNAMENT_ARENA_SIZE,
  applyMatchResult,
  createTournamentBout,
  nextPendingMatch,
  saveActiveTournament,
  tournamentProgress,
  validateTournament
} from "../engine/tournament";
import { FIGHTER_CLASSES } from "../engine/fighterDefinitions";
import { drawBattleFrame } from "../engine/systems/BattleSimulation";
import { getSettings } from "../engine/settings";
import TournamentBracket from "./TournamentBracket";
import StatsPanel from "./StatsPanel";

const SPEEDS = [1, 2, 4, 8];
// How long the result card stays up between matches. Short on purpose: watching
// 24 bouts should not drag, but a winner needs a beat to register.
const RESULT_HOLD_MS = 2600;
// How long the arena keeps the deciding frame on screen before the result card
// covers it, so the killing explosion is actually seen (the arena's own beat).
const AFTERGLOW_MS = 1100;
// A browser tab that was hidden can hand back a huge delta; clamp it so one
// frame can never fast-forward (or skip) a fight.
const MAX_FRAME_SECONDS = 0.1;

// Wall-clock time in milliseconds. The tournament engine no longer monkey-patches
// `performance.now` (doing so stalled the browser's animation-frame scheduler and
// froze the watched match), so the plain global is the right thing to read here.
const realNow = () => performance.now();

// Colours and HUD panels are read from the roster by name. A name the roster no
// longer has (a restored bracket from an older roster) must degrade to a neutral
// entry instead of crashing the screen, so every lookup goes through here.
//
// A roster entry is the class DEFINITION (health, damage, bodySize...), not a live
// fighter: `StatsPanel` reads `maxHealth`, so the preview panels must be given a
// shaped fighter rather than the raw definition - which is what made the HUD read
// "HEALTH 90 / NaN" before the fight started.
function fighterFor(name) {
  const definition = (typeof name === "string" && FIGHTER_CLASSES[name]) || null;
  if (!definition) return { name: name || "?", color: "#8fa6bd", health: 0, maxHealth: 0, damage: 0, speed: 0, radius: 0, attackType: "—" };
  const maxHealth = definition.health;
  return {
    ...definition,
    maxHealth,
    health: maxHealth,
    radius: definition.bodySize / 2,
    totalDamageDealt: 0
  };
}

function formatClock(seconds) {
  const clamped = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(clamped / 60)}:${String(clamped % 60).padStart(2, "0")}`;
}

// The stack of fighter HUD panels on one side of the arena stage. A duel has one
// panel each, so both fit without shrinking the canvas the fight is drawn on.
function HudColumn({ fighters, side, clock, suddenDeath }) {
  return (
    <div className={`tournament-hud tournament-hud-${side}${fighters.length ? "" : " tournament-hud-empty"}`}>
      {fighters.map(({ fighter, index }) => (
        <StatsPanel key={index} fighter={fighter} index={index} battleTime={clock} suddenDeath={suddenDeath} />
      ))}
    </div>
  );
}

function TournamentScreenView({
  tournament: initialTournament,
  onTournamentChange,
  onComplete,
  onExit
}) {
  const [tournament, setTournament] = useState(initialTournament);
  // bracket    - between matches: the upcoming bout stands on the stage
  // intro      - "A VS B" card over the arena
  // countdown  - 3, 2, 1, GO, exactly like the arena
  // fighting   - the real bout is being simulated and drawn on the canvas
  // result     - winner card over the deciding frame
  // error      - the match could not be resolved
  const [phase, setPhase] = useState("bracket");
  const [countdown, setCountdown] = useState(3);
  const [matchResult, setMatchResult] = useState(null);
  const [activeMatch, setActiveMatch] = useState(null);
  // The live bout's fighter instances, paired with their seats. A duel is always
  // seat 0 (left) vs seat 1 (right), so this splits cleanly into the two HUDs.
  const [hudFighters, setHudFighters] = useState([]);
  // Mirrors the bout's own simulated clock (seconds left of the five-minute bout).
  const [matchClock, setMatchClock] = useState(MATCH_CLOCK_SECONDS);
  const [suddenDeath, setSuddenDeath] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [isPaused, setIsPaused] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [isBracketMinimized, setIsBracketMinimized] = useState(false);
  const [isArenaFullscreen, setIsArenaFullscreen] = useState(false);

  // Refs mirror the state the async match runner reads, so a run in flight never
  // sees a stale closure. This is what keeps "pause", "speed" and "next match"
  // from double-applying an update.
  const runTokenRef = useRef(0);
  const pausedRef = useRef(false);
  const speedRef = useRef(1);
  const skipRef = useRef(false);
  const mountedRef = useRef(true);
  // The live bout being watched, and the canvas it paints into.
  const boutRef = useRef(null);
  const canvasRef = useRef(null);
  const arenaWrapRef = useRef(null);

  useEffect(() => { pausedRef.current = isPaused; }, [isPaused]);
  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => {
    const syncFullscreen = () => setIsArenaFullscreen(document.fullscreenElement === arenaWrapRef.current);
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);
  // StrictMode mounts, unmounts and remounts this screen once in development.
  // The mounted flag has to be re-armed on mount (leaving it false made every
  // wait() bail out instantly after the remount).
  //
  // The cleanup deliberately does NOT bump `runTokenRef`. It used to, and the
  // StrictMode remount then aborted the match that the first mount had just
  // started: playMatch() was already waiting on its intro, the token changed
  // underneath it, the wait resolved false and the bout was never built - which
  // is exactly why the arena sat empty on the intro card. Abandoning a run is
  // now only done by exit/retry, which bump the token themselves; a match that
  // outlives a remount simply continues on the remounted screen.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Pausing freezes the soundtrack with the fight, exactly like the arena does.
  useEffect(() => {
    if (phase !== "fighting") return;
    if (isPaused) audioManager.pauseMusic();
    else audioManager.resumeMusic();
  }, [isPaused, phase]);

  // The next bout to fight: the live one while it runs, otherwise the next one
  // the bracket still has pending. One value for the stage, the HUD and the
  // toolbar, so they can never disagree about which match is on screen.
  const pending = useMemo(() => activeMatch || nextPendingMatch(tournament), [activeMatch, tournament]);
  const progress = useMemo(() => tournamentProgress(tournament), [tournament]);

  // --- Hooks must all run on every render ---------------------------------
  // Every `useEffect` below is declared BEFORE the first early `return` for a
  // finished tournament. Declaring one after it (as an older version did with
  // the hand-off effect) changes the hook count between renders, which React
  // rejects by unmounting the whole tree - a blank screen the moment the final
  // is won. Nothing here may return early until the last effect is declared.
  const currentMatchId = pending?.id ?? null;
  // The bout on the stage: the one being fought, or the next one waiting.
  const stageMatch = activeMatch || pending;
  const roundLabel = stageMatch ? (ROUND_LABELS[stageMatch.round] ?? stageMatch.round) : "";

  // The fighter panels: the live bout's own instances while it runs, otherwise
  // the two classes about to walk into the arena (name + colour is all the HUD
  // needs before they exist).
  const stageFighters = useMemo(() => {
    if (hudFighters.length) return hudFighters;
    if (!stageMatch) return [];
    return [
      { fighter: fighterFor(stageMatch.first), index: 0 },
      { fighter: fighterFor(stageMatch.second), index: 1 }
    ];
  }, [hudFighters, stageMatch]);

  // Persist every bracket change so closing the game mid-tournament resumes it.
  useEffect(() => {
    saveActiveTournament(tournament);
    onTournamentChange?.(tournament);
  }, [tournament, onTournamentChange]);

  const wait = (ms, token) => new Promise(resolve => {
    const started = realNow();
    const tick = () => {
      if (!mountedRef.current || token !== runTokenRef.current) return resolve(false);
      const remaining = ms - (realNow() - started);
      if (remaining <= 0) return resolve(true);
      // A "next match" skip collapses the waiting beats too, so skipping never
      // leaves the screen stuck on an intro card.
      if (skipRef.current) { skipRef.current = false; return resolve(true); }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  // Runs ONE real match, exactly like a normal battle: the two classes are built,
  // the countdown plays, then the bout is simulated frame by frame *on screen*
  // (see the animation loop below) until one of them is eliminated. Every guard
  // here exists to resolve the match exactly once, even if controls are mashed.
  // Returns the live bout once it is under way, null when it never started.
  const playMatch = useCallback(async (match, token) => {
    setActiveMatch(match);
    setMatchResult(null);
    setPhase("intro");
    setCountdown(3);

    // Intro beat, then the real 3-2-1-GO countdown, matching the arena's timing.
    if (!(await wait(1400, token))) return;

    // Build the bout after the intro so its fighters are fresh when the bell
    // rings - the same way the arena creates them on mount.
    const bout = createTournamentBout(match.first, match.second, {
      arenaSize: TOURNAMENT_ARENA_SIZE,
      performanceMode: getSettings().performanceMode
    });
    if (!bout) {
      setErrorMessage(`"${match.first}" vs "${match.second}" could not be set up.`);
      setPhase("error");
      return null;
    }
    if (token !== runTokenRef.current) { bout.destroy(); return null; }

    setHudFighters(bout.fighters.map((fighter, index) => ({ fighter, index })));
    setMatchClock(bout.remainingSeconds);

    setPhase("countdown");
    for (const step of [3, 2, 1]) {
      if (token !== runTokenRef.current) { bout.destroy(); return null; }
      setCountdown(step);
      audioManager.playCountdownBeep(step);
      if (!(await wait(1000 / speedRef.current, token))) { bout.destroy(); return null; }
    }
    setCountdown("GO");
    audioManager.playCountdownBeep("go");
    if (!(await wait(300 / speedRef.current, token))) { bout.destroy(); return null; }

    setCountdown(null);
    return bout;
  }, []);

  // The bout's animation loop - the tournament's version of the arena's game
  // loop. It advances the simulation by however much wall time passed times the
  // chosen speed, then paints the result, so a 2x bout is the same fight twice as
  // fast (never a different one).
  useEffect(() => {
    if (phase !== "fighting") return undefined;
    const bout = boutRef.current;
    if (!bout) return undefined;
    const token = runTokenRef.current;
    // Music starts with the fight and must not outlive it.
    audioManager.playBattleMusic();
    const ctx = canvasRef.current?.getContext("2d") || null;
    let frameId = 0;
    // `lastTime` starts null and is seeded from the FIRST animation-frame
    // timestamp. Seeding it from performance.now() compares two clocks with
    // different origins: a value ahead of the first rAF timestamp makes the first
    // delta negative (clamped to 0), and a value behind it makes it huge; either
    // way the fight clock appeared frozen at 5:00. Both readings here now come
    // from the same source - the rAF timestamp itself.
    let lastTime = null;
    let uiAccumulator = 0;
    let lastClock = -1;

    const loop = time => {
      if (!mountedRef.current || token !== runTokenRef.current || boutRef.current !== bout) return;
      if (lastTime === null) lastTime = time;
      const dt = Math.min(Math.max((time - lastTime) / 1000, 0), MAX_FRAME_SECONDS);
      lastTime = time;

      if (!pausedRef.current) {
        if (skipRef.current === "next") {
          // Skip still runs the real bout - to its actual end - it just does not
          // wait for the clock to get there.
          skipRef.current = false;
          bout.step(MATCH_CLOCK_SECONDS + 60);
        } else {
          bout.step(dt * speedRef.current);
        }
      }

      if (ctx) {
        drawBattleFrame(ctx, {
          fighters: bout.fighters,
          particles: bout.particles,
          arenaSize: bout.arenaSize,
          // Draw with the BOUT's simulated time, not the wall clock. The fighters
          // animate off the time they are handed, so wall time left every weapon
          // trail, slash and cooldown ring frozen while the bodies slid around.
          // Simulated time is also what makes playback speed honest: at 2x the
          // effects play twice as fast with the fight.
          time: bout.elapsedSeconds,
          suddenDeath: bout.suddenDeath,
          onFighterError: (fighter, error) => console.error(`Draw failed for ${fighter.name}`, error)
        });
      }

      uiAccumulator += dt;
      if (uiAccumulator >= 0.1 || bout.finished) {
        uiAccumulator = 0;
        // The fighters are live objects the engine mutates in place, so a fresh
        // shallow copy is enough to refresh HP, cooldowns and status effects.
        setHudFighters(bout.fighters.map((fighter, index) => ({ fighter, index })));
        setSuddenDeath(bout.suddenDeath);
        const clock = Math.ceil(bout.remainingSeconds);
        if (clock !== lastClock) { lastClock = clock; setMatchClock(bout.remainingSeconds); }
      }

      if (bout.finished) {
        // Same rule as the arena: once the fight is decided, keep painting the
        // deciding explosion for a short beat instead of freezing on the last
        // frame. The finish watcher hands over to the result card afterwards and
        // stops the loop, so this only runs for the afterglow itself.
        bout.stepAfterglow(dt);
        frameId = requestAnimationFrame(loop);
        return;
      }
      frameId = requestAnimationFrame(loop);
    };

    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, activeMatch]);

  // Once the deciding blow lands, keep the arena (and its explosion) on screen
  // for a short beat, then fold the result into the bracket.
  useEffect(() => {
    if (phase !== "fighting") return undefined;
    const token = runTokenRef.current;
    const poll = setInterval(() => {
      const bout = boutRef.current;
      if (!bout?.finished || token !== runTokenRef.current) return;
      clearInterval(poll);

      const result = bout.result;
      if (!result || !result.winner || !result.loser) {
        // No valid winner: surface it instead of advancing a broken bracket. The
        // match stays pending so the player can retry it.
        bout.destroy();
        boutRef.current = null;
        audioManager.stopMusic();
        setErrorMessage(
          result?.error === "no-decisive-winner"
            ? "Neither fighter could be eliminated, so this match has no valid winner."
            : "The match could not produce a valid winner."
        );
        setPhase("error");
        return;
      }

      audioManager.stopMusic();
      audioManager.playVictorySound();
      // Keep only what the result card and the bracket need - the raw fighter
      // instances and particles are dropped with the bout below.
      setMatchResult({
        winner: result.winner,
        loser: result.loser,
        durationSeconds: result.durationSeconds,
        combatants: result.combatants || [],
        peakLiveFighters: result.peakLiveFighters,
        // Snap the deciding frame before the result card covers the arena.
        frameStill: snapshotCanvas(canvasRef.current)
      });
      setTimeout(() => {
        if (!mountedRef.current || token !== runTokenRef.current) return;
        bout.destroy();
        boutRef.current = null;
        setPhase("result");
      }, AFTERGLOW_MS / speedRef.current);
    }, 120);
    return () => clearInterval(poll);
  }, [phase, activeMatch]);

  // Drives the whole tournament: play the next pending match, apply it, repeat.
  //
  // This effect must NOT depend on `phase`. playMatch() starts by setting phase to
  // "intro", which would re-run this effect and fire its cleanup; the cleanup used
  // to bump `cancelled`, so the intro wait aborted instantly and the match was never
  // built - the arena sat empty on the bracket screen forever. The run therefore owns
  // a plain cancellation flag (cleared only on unmount / exit) and the effect is keyed
  // on the bracket identity alone. The bracket only changes once a match has been
  // applied, so each bracket state starts exactly one run.
  const drivenMatchRef = useRef(null);
  useEffect(() => {
    if (phase === "error") return undefined;
    if (tournament.status === "complete") return undefined;
    const next = nextPendingMatch(tournament);
    // Already running this match (e.g. a re-render from a bracket save): never
    // stack a second simulation on top of the live one.
    if (!next || drivenMatchRef.current === next.id) return undefined;
    drivenMatchRef.current = next.id;

    const token = ++runTokenRef.current;

    const run = async () => {
      const bout = await playMatch(next, token);
      // Abandonment is decided by the TOKEN alone, never by this effect's cleanup.
      // React StrictMode runs mount -> cleanup -> mount once in development, and a
      // cleanup flag would therefore mark every first run as cancelled after the
      // countdown had already produced a perfectly good bout - the arena then went
      // back to the bracket and the match never started. The token only changes when
      // something genuinely supersedes the run (exit, retry, a new match).
      if (bout && token === runTokenRef.current && mountedRef.current) {
        // Hand the running bout to the two effects above: the animation loop
        // paints it and the finish watcher ends it.
        boutRef.current = bout;
        setPhase("fighting");
      }
      // One match per pass; the effect re-runs when the bracket updates.
    };
    run();
    return undefined;
    // Keyed on the bracket only: re-running on every render would relaunch the battle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournament.currentMatchId, tournament.resolvedMatchIds.length]);

  // When a match result is ready, wait for the player to acknowledge it (or the
  // hold timer to expire), then fold it into the bracket exactly once.
  useEffect(() => {
    if (phase !== "result" || !matchResult || !activeMatch) return undefined;
    const token = runTokenRef.current;
    let done = false;

    const commit = () => {
      if (done || !mountedRef.current || token !== runTokenRef.current) return;
      done = true;
      setMatchResult(null);
      setTournament(prev => {
        const { tournament: next, applied } = applyMatchResult(prev, activeMatch, matchResult);
        if (!applied) return prev; // already resolved - never double-count
        return next;
      });
      setActiveMatch(null);
      // Allow the next bracket to start its own run.
      drivenMatchRef.current = null;
      // Drop the finished bout's instances so the stage shows the next pairing.
      setHudFighters([]);
      setMatchClock(MATCH_CLOCK_SECONDS);
      setSuddenDeath(false);
      setPhase("bracket");
    };

    const timer = setTimeout(commit, RESULT_HOLD_MS / Math.max(1, speedRef.current));
    // "Next match" skips the hold and commits immediately.
    const poll = setInterval(() => {
      if (skipRef.current === "next") { skipRef.current = false; clearInterval(poll); clearTimeout(timer); commit(); }
    }, 120);

    return () => { clearTimeout(timer); clearInterval(poll); };
  }, [phase, matchResult, activeMatch]);

  // Hand off to the champion screen the moment the final resolves.
  useEffect(() => {
    if (tournament.status !== "complete" || !tournament.champion) return;
    // Only once the final's result card (and its hold) is over.
    if (phase !== "bracket") return;
    const problems = validateTournament(tournament, { requireComplete: true });
    if (problems.length > 0) {
      setErrorMessage(problems[0]);
      setPhase("error");
      return;
    }
    onComplete?.(tournament);
  }, [tournament, phase, onComplete]);

  const handleTogglePause = () => {
    audioManager.playUiClick();
    // Pause belongs to the fight; between bouts there is nothing to pause.
    if (phase !== "fighting") return;
    setIsPaused(v => !v);
  };

  const handleSpeed = () => {
    audioManager.playUiClick();
    setSpeed(prev => SPEEDS[(SPEEDS.indexOf(prev) + 1) % SPEEDS.length]);
  };

  const handleNextMatch = () => {
    audioManager.playUiClick();
    // Finish the CURRENT match through its real simulation: the bout is stepped
    // straight to its conclusion, so "skip" only collapses the wait - the winner
    // is still whatever the combat produced.
    skipRef.current = "next";
  };

  const handleToggleFullscreen = () => {
    audioManager.playUiClick();
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
      return;
    }
    arenaWrapRef.current?.requestFullscreen?.().catch(() => {});
  };

  const handleToggleBracket = () => {
    audioManager.playUiClick();
    setIsBracketMinimized(v => !v);
  };

  const handleExit = () => {
    audioManager.playUiClick();
    setShowExitConfirm(true);
  };

  const confirmExit = () => {
    audioManager.playUiClick();
    setShowExitConfirm(false);
    runTokenRef.current += 1;
    // Tear down the watched bout first: it owns the simulated clock.
    boutRef.current?.destroy();
    boutRef.current = null;
    audioManager.stopMusic();
    saveActiveTournament(tournament);
    onExit?.();
  };

  const handleRetry = () => {
    audioManager.playUiClick();
    setErrorMessage(null);
    setMatchResult(null);
    setActiveMatch(null);
    drivenMatchRef.current = null;
    setHudFighters([]);
    setPhase("bracket");
  };

  const inFight = phase === "fighting" || phase === "result" || phase === "countdown";
  const clockLabel = formatClock(inFight ? matchClock : MATCH_CLOCK_SECONDS);
  // The header counts decided matches; the result card already shows its winner,
  // so it is included the moment the fight ends.
  const resolvedCount = Math.min(progress.resolved + (phase === "result" ? 1 : 0), TOTAL_MATCHES);
  const progressLabel = `${resolvedCount}/${TOTAL_MATCHES}`;
  const leftFighters = stageFighters.filter(item => item.index % 2 === 0);
  const rightFighters = stageFighters.filter(item => item.index % 2 === 1);

  return (
    <main className="tournament-screen">
      <div className="tournament-toolbar">
        <div className="tournament-toolbar-title">
          <span className="tournament-badge">TOURNAMENT</span>
          <strong>{roundLabel}</strong>
          <span className="tournament-progress">{progressLabel} MATCHES</span>
        </div>
        <div className="tournament-controls">
          <button className="tournament-control" onClick={handleTogglePause} aria-pressed={isPaused} disabled={phase !== "fighting"}>
            {isPaused ? "▶ RESUME" : "⏸ PAUSE"}
          </button>
          <button className="tournament-control" onClick={handleSpeed}>
            ⏩ {speed}x
          </button>
          <button className="tournament-control" onClick={handleNextMatch} disabled={!pending}>
            ⏭ NEXT MATCH
          </button>
          <button className="tournament-control tournament-control-exit" onClick={handleExit}>
            ✕ EXIT
          </button>
        </div>
      </div>

      <div className={`tournament-body${isBracketMinimized ? " tournament-body-minimized" : ""}`}>
        <div className="tournament-stage">
          {phase === "error" ? (
            <div className="tournament-error" role="alert">
              <h2>MATCH NOT RESOLVED</h2>
              <p>{errorMessage}</p>
              <div className="tournament-error-actions">
                <button className="tournament-control" onClick={handleRetry}>RETRY MATCH</button>
                <button className="tournament-control" onClick={confirmExit}>EXIT TOURNAMENT</button>
              </div>
            </div>
          ) : (
            <div className={`tournament-arena tournament-arena-live${suddenDeath ? " tournament-arena-sudden" : ""}`} ref={arenaWrapRef}>
              <HudColumn fighters={leftFighters} side="left" clock={clockLabel} suddenDeath={suddenDeath} />

              <div className="tournament-canvas-wrap">
                <canvas
                  ref={canvasRef}
                  width={TOURNAMENT_ARENA_SIZE}
                  height={TOURNAMENT_ARENA_SIZE}
                  className="tournament-canvas"
                  aria-label={stageMatch ? `${stageMatch.first} versus ${stageMatch.second}` : "Tournament arena"}
                />

                <button className="tournament-arena-fullscreen" onClick={handleToggleFullscreen} aria-pressed={isArenaFullscreen}>
                  {isArenaFullscreen ? "EXIT FULLSCREEN" : "FULLSCREEN"}
                </button>

                <div className="tournament-vs-strip">
                  <span style={{ color: fighterFor(stageMatch?.first).color }}>{stageMatch?.first ?? "—"}</span>
                  <b>{clockLabel}{suddenDeath ? " · SUDDEN DEATH" : ""}</b>
                  <span style={{ color: fighterFor(stageMatch?.second).color }}>{stageMatch?.second ?? "—"}</span>
                </div>

                {phase === "bracket" && (
                  <div className="tournament-announce tournament-announce-compact">
                    <div className="tournament-announce-eyebrow">{roundLabel}</div>
                    <h2 className="tournament-announce-title">
                      <span style={{ color: fighterFor(stageMatch?.first).color }}>{stageMatch?.first}</span>
                      <em>VS</em>
                      <span style={{ color: fighterFor(stageMatch?.second).color }}>{stageMatch?.second}</span>
                    </h2>
                    <p className="tournament-announce-sub">{pending ? "HERE WE GO" : "TOURNAMENT COMPLETE"}</p>
                  </div>
                )}
                {phase === "intro" && (
                  <div className="tournament-announce">
                    <div className="tournament-announce-eyebrow">{roundLabel}</div>
                    <h2 className="tournament-announce-title">
                      <span style={{ color: fighterFor(stageMatch?.first).color }}>{stageMatch?.first}</span>
                      <em>VS</em>
                      <span style={{ color: fighterFor(stageMatch?.second).color }}>{stageMatch?.second}</span>
                    </h2>
                    <p className="tournament-announce-sub">FIGHT</p>
                  </div>
                )}
                {phase === "countdown" && countdown !== null && (
                  <div className="countdown-overlay tournament-countdown" aria-live="polite">
                    <span className="countdown-number">{countdown}</span>
                  </div>
                )}
                {isPaused && phase === "fighting" && (
                  <div className="countdown-overlay pause-overlay" aria-live="polite">
                    <span className="countdown-number pause-label">PAUSED</span>
                  </div>
                )}
                {phase === "result" && matchResult && (
                  <div className="tournament-result-card">
                    {matchResult.frameStill && (
                      <img className="tournament-result-still" src={matchResult.frameStill} alt="Deciding moment of the match" />
                    )}
                    <div className="tournament-result-body">
                      <div className="tournament-result-eyebrow">{roundLabel} · {stageMatch?.id?.toUpperCase()}</div>
                      <h2 className="tournament-result-title">
                        WINNER <span style={{ color: fighterFor(matchResult.winner.name).color }}>{matchResult.winner.name}</span>
                      </h2>
                      <div className="tournament-result-grid">
                        <div><span>DURATION</span><b>{formatClock(matchResult.durationSeconds)}</b></div>
                        <div><span>ELIMINATED</span><b>{matchResult.loser.name}</b></div>
                        <div><span>HP LEFT</span><b>{Math.round(matchResult.winner.health)}</b></div>
                        <div><span>DAMAGE DEALT</span><b>{matchResult.winner.damageDealt}</b></div>
                      </div>
                      <p className="tournament-result-next">
                        {resolvedCount >= TOTAL_MATCHES ? "TOURNAMENT COMPLETE" : "ADVANCING…"}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <HudColumn fighters={rightFighters} side="right" clock={clockLabel} suddenDeath={suddenDeath} />
            </div>
          )}
        </div>

        <aside className={`tournament-side${isBracketMinimized ? " tournament-side-minimized" : ""}`}>
          <div className="tournament-side-head">
            <h2>BRACKET</h2>
            <div className="tournament-side-actions">
              <span>{tournament.eliminated?.length || 0} ELIMINATED</span>
              <button className="tournament-side-toggle" onClick={handleToggleBracket} aria-expanded={!isBracketMinimized}>
                {isBracketMinimized ? "SHOW" : "HIDE"}
              </button>
            </div>
          </div>
          {!isBracketMinimized && (
            <TournamentBracket
              tournament={tournament}
              currentMatchId={currentMatchId}
              onSelectFighter={() => { }}
              compact
            />
          )}
        </aside>
      </div>

      {showExitConfirm && (
        <div className="tournament-confirm-overlay" role="dialog" aria-label="Exit tournament">
          <div className="tournament-confirm">
            <h3>EXIT TOURNAMENT?</h3>
            <p>Your bracket is saved. You can resume it later from the main menu.</p>
            <div className="tournament-confirm-actions">
              <button className="tournament-control" onClick={() => setShowExitConfirm(false)}>CANCEL</button>
              <button className="tournament-control tournament-control-exit" onClick={confirmExit}>EXIT</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

// Snap the deciding frame before the result card covers the arena, so the
// winner card shows the moment the match was actually won.
function snapshotCanvas(canvas) {
  try {
    return canvas ? canvas.toDataURL("image/webp", 0.6) : null;
  } catch {
    return null;
  }
}

// --- Error boundary ---------------------------------------------------------
// A throw anywhere in the bracket, the arena or a match result would
// otherwise unmount the whole game and leave a blank page. This boundary keeps
// the failure on the tournament screen and says something readable. The bracket
// itself is already saved, so nothing is lost by leaving.
export class TournamentErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // The full component stack goes to the console for debugging only; the player
    // gets the short message plus the one thing that matters to them - the bracket
    // is still saved, so nothing is lost by leaving.
    console.error("Tournament screen failed:", error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="tournament-screen">
        <div className="tournament-error" role="alert">
          <h2>TOURNAMENT SCREEN FAILED</h2>
          <p>{String(this.state.error?.message || this.state.error)}</p>
          <p className="tournament-error-note">
            Your bracket is still saved. Return to the menu and continue it from TOURNAMENT MODE.
          </p>
          <div className="tournament-error-actions">
            <button className="tournament-control" onClick={() => this.setState({ error: null })}>
              TRY AGAIN
            </button>
            <button className="tournament-control tournament-control-exit" onClick={() => this.props.onExit?.()}>
              BACK TO MENU
            </button>
          </div>
        </div>
      </main>
    );
  }
}

export default function TournamentScreen(props) {
  return (
    <TournamentErrorBoundary onExit={props.onExit}>
      <TournamentScreenView {...props} />
    </TournamentErrorBoundary>
  );
}
