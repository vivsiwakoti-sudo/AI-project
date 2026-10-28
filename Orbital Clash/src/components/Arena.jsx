import { useEffect, useRef, useState } from "react";
import { FighterFactory } from "../engine/FighterFactory";
import { ParticleSystem } from "../engine/systems/ParticleSystem";
import { squashTransform } from "../engine/systems/Fx";
import { audioManager } from "../engine/audio/AudioManager";
import StatsPanel from "./StatsPanel";
import { spawnPositionFor, launchDirectionFor } from "../engine/systems/SpawnSystem";
import { MAX_FIGHTERS, MIN_FIGHTERS } from "../engine/config";
import { getSettings } from "../engine/settings";
import { countAlive, decayScreenShake, drawGridLines, stepBattle } from "../engine/systems/BattleSimulation";

// Turns every shadowBlur write into a no-op, removing glow from all draw code at once.
function disableGlow(ctx) {
  Object.defineProperty(ctx, "shadowBlur", { get: () => 0, set: () => {} });
}

// Distributes the fighter HUD panels across the two sides of the arena.
//
// The panels always stay in the left and right columns - never stacked under or
// over the canvas - so the arena keeps its full width at every player count.
// Within a column the panels sit SIDE BY SIDE, and the column narrows itself as
// the fighter count rises so everything still fits beside the arena.
//
//   2 fighters: [0]       | [1]          panels full width, one per side
//   3 fighters: [0, 2] skinny | [1]      the two-panel side goes skinny so the
//                                        single panel on the other side keeps its
//                                        full size
//   4 fighters: [0, 2] skinny | [1, 3] skinny
//
// `skinny` on a side means "this column holds more than one panel, so it must
// share its width between them". `count` drives the CSS column width.
function planSides(count) {
  const left = [];
  const right = [];
  for (let i = 0; i < count; i++) {
    (i % 2 === 0 ? left : right).push(i);
  }

  // Any column carrying two panels is the one that narrows. With 2 fighters
  // neither column is skinny; with 3 only the two-panel side is; with 4 both are.
  const leftSkinny = left.length > 1;
  const rightSkinny = right.length > 1;

  return {
    count,
    left,
    right,
    leftSkinny,
    rightSkinny,
    // Retained for the class names already emitted by the layout.
    skinnySide: leftSkinny && rightSkinny ? "both" : leftSkinny ? "left" : rightSkinny ? "right" : null,
  };
}

// Targeting (chooseTarget / canBeVictim / countAlive) and the per-frame combat
// pass (stepBattle) live in engine/systems/BattleSimulation so the live arena and
// tournament battles run the exact same simulation. This file keeps only the
// battle screen: countdown, HUD, replay capture, rendering and the hand-off.

// Clock zero for one battle, in performance.now() milliseconds.
//
// Every survival time and battle duration is measured from this instant: the
// moment the countdown finishes and the fight actually starts. It is a module
// level ref because killFighter() and finishBattle() both need the same origin,
// and it deliberately replaces the old per-fighter `battleStartedAt`, which was
// stamped in createFighters() - i.e. several seconds EARLY, during the pre-fight
// countdown - so the first fighter to fall could end up with a longer survival
// time than the last one standing.
const battleStartAt = { current: null };

// How long the arena keeps simulating AFTER the battle is decided, so the killing
// explosion (particles, expanding rings, drifting bodies) finishes on screen
// instead of being frozen the frame it is spawned. This is also the delay before
// the results screen appears, so the two can never disagree.
const RESOLUTION_GRACE_SECONDS = 1;

// Marks a fighter as eliminated and clears it from everyone's targeting.
//
// This is the ONE place a fighter transitions to dead during the battle, so the
// death effect, elimination timestamp, survival time and target cleanup can never
// drift apart or run twice. Damage lands from several places in a frame (class
// attacks, body collisions, sudden death, damage-over-time), so death is resolved
// in a single sweep after all of them rather than inside any one of them.
function killFighter(fighter, fighters, particles) {
  if (!fighter) return false;
  // Note: DamageSystem already calls victim.die() and sets isDead on a lethal
  // hit, so by the time this runs the fighter is usually ALREADY dead. Guarding
  // on isDead here would skip the timestamp entirely and every fighter would
  // fall back to the same value, making the elimination order meaningless. So the
  // guard is on eliminatedAt (have we already recorded this death?), not isDead.
  if (fighter.eliminatedAt) return false;

  // Stamp the moment of death ONCE, relative to the clock zeroed at "GO".
  //
  // `eliminatedAt` is the authoritative survival timestamp and it is taken here,
  // before the collision pass, rather than from performance.now() later. The
  // fighter is already out of the fight at this instant (the death effect plays
  // at their position and they stop colliding), so ranking by this value always
  // agrees with what the player just watched. Ordering by a timestamp sampled
  // during the NEXT frame is what let fighters come back out of the order they
  // were knocked out in, which showed up as placements like 1, 4, 3, 2.
  fighter.health = Math.min(fighter.health, 0);
  // Only fire the death effect if nobody has yet (DamageSystem may have).
  if (!fighter.isDead) fighter.die(particles);
  fighter.isDead = true;
  fighter.eliminatedAt = (performance.now() - (battleStartAt.current ?? performance.now())) / 1000;
  fighter.survivalTime = fighter.eliminatedAt;
  // Nobody may keep attacking a corpse, and it must stop being a collision body.
  // BOTH the committed target and the per-frame `opponent` reference are cleared:
  // `chooseTarget` only consults `target`, but a class that stores the opponent it
  // was handed (Ghost's `groundTarget`, Assassin's `wallRedirectTarget`) would go
  // on aiming at the corpse forever, and `chooseTarget` hands the SAME object back
  // every frame for the rest of the match. That resurrects exactly the deadlock
  // Mahoraga's swing re-arm was hardened against, so clear it for everyone here.
  fighters.forEach(other => {
    if (!other) return;
    if (other.target === fighter) other.target = null;
    if (other.opponent === fighter) other.opponent = null;
  });
  return true;
}

// Resolves every death that happened during this frame, in a stable order.
// Returns true if anything died, so the caller can react (end-of-battle check).
function resolveDeaths(fighters, particles) {
  let died = false;
  for (const f of fighters) {
    // Any fighter that is dead or out of HP but has no elimination timestamp yet
    // still needs one: DamageSystem marks death, but the ordering data for
    // placements is recorded here.
    if (f && !f.eliminatedAt && (f.isDead || f.health <= 0)) {
      died = killFighter(f, fighters, particles) || died;
    }
  }
  return died;
}

// Stamps the end-of-battle statistics onto every fighter for the results screen.
//
// Placement is LONGEST SURVIVAL = 1st, which for a fight with a single survivor
// is the same thing as the order of elimination: the fighter knocked out first
// takes last, the last one standing takes 1st. Elimination is a strict sequence,
// so a battle always produces exactly one 1st, 2nd, 3rd and 4th - no ties and no
// gaps.
function finishBattle(fighters) {
  const endedAt = performance.now();
  const endSeconds = (endedAt - (battleStartAt.current ?? endedAt)) / 1000;

  // Any fighter still standing when the whistle goes survived the whole battle.
  // Stamping that BEFORE ranking keeps the standings, the table and the arena's
  // own placement stamp all reading the same number.
  fighters.forEach(f => {
    // battleDuration is the length of the whole battle, used for the "fight
    // length" readout. survivalTime is per fighter and was stamped at the moment
    // they died, so it is deliberately NOT overwritten here - a fighter knocked
    // out early should not report the full battle length.
    f.battleDuration = endSeconds;
    if (f.survivalTime == null) f.survivalTime = f.battleDuration;
  });

  // Rank by survival time, descending. A tie (two fighters on the same measured
  // second, or an arena handed over without timestamps) keeps the arena's own
  // seat order, which is stable across engines - Array.sort is not guaranteed to
  // be, so the index is compared explicitly rather than trusted to be stable.
  const standings = [...fighters].sort((a, b) => {
    const bySurvival = (b.survivalTime ?? 0) - (a.survivalTime ?? 0);
    if (bySurvival !== 0) return bySurvival;
    return fighters.indexOf(a) - fighters.indexOf(b);
  });

  standings.forEach((f, i) => {
    f.placement = i + 1;
  });
}

// Builds the live fighter instances for one battle. Called from the state
// initializer, so a throw here would unmount the whole app and leave a blank
// page rather than a readable error. Every failure mode is therefore converted
// into a real Error carrying the offending class name, and the caller renders
// that instead of letting it escape during render.
function createFighters(fighters, arenaSize) {
  const list = Array.isArray(fighters) ? fighters : [];
  if (list.length < MIN_FIGHTERS) {
    throw new Error(`A battle needs at least ${MIN_FIGHTERS} fighters, but received ${list.length}.`);
  }
  if (list.length > MAX_FIGHTERS) {
    throw new Error(`A battle supports at most ${MAX_FIGHTERS} fighters, but received ${list.length}.`);
  }

  return list.map((selection, i) => {
    const name = selection?.name;
    if (!name) {
      throw new Error(`Fighter ${i + 1} has no name, so no class could be loaded.`);
    }

    // Each fighter is placed on its own seat (left/right, plus bottom for a
    // 3rd and top for a 4th) and launched inward on its own random heading.
    const { x, y } = spawnPositionFor(i, arenaSize);

    let fighter;
    try {
      fighter = FighterFactory.createFighter(name, x, y);
    } catch (cause) {
      throw new Error(`Could not build "${name}": ${cause.message}`, { cause });
    }

    if (!fighter || typeof fighter.update !== "function" || typeof fighter.draw !== "function") {
      throw new Error(`"${name}" did not produce a usable fighter instance.`);
    }

    // Normalized direction only! Speed is handled in FighterBase.update
    const { vx, vy } = launchDirectionFor(i);
    fighter.vx = vx;
    fighter.vy = vy;
    fighter.teamIndex = i;
    fighter.arenaSize = arenaSize;

    // Per-fighter battle state. Every fighter owns its own copy, so nothing is
    // shared between fighters: each has its own target, HP, cooldowns, status
    // effects and statistics. `target` is the committed opponent chosen by
    // chooseTarget() and starts empty until the first AI pass picks one.
    fighter.target = null;
    fighter.eliminatedAt = null;
    // Left null until either the fighter dies (stamped with their survival time)
    // or the battle ends (stamped with the full length). Initialising this to 0
    // would make the winner, who never dies, report 0s survived.
    fighter.survivalTime = null;
    fighter.placement = null;
    // The end screen reads battleDuration; nothing was setting it, so it always
    // reported 1s. The clock zero is stamped when the countdown ends, so every
    // fighter here shares one origin (see battleStartAt).
    return fighter;
  });
}


const ZOOM_MIN = 10;
const ZOOM_MAX = 200;
const ZOOM_STEP = 10;
const ZOOM_DEFAULT = 100;
const ZOOM_OPTIONS = Array.from({ length: (ZOOM_MAX - ZOOM_MIN) / ZOOM_STEP + 1 }, (_, i) => ZOOM_MIN + i * ZOOM_STEP);

export default function Arena({ fighters, arenaSize = 800, onFinish }) {
  const canvasRef = useRef(null);
  const ARENA_SIZE = arenaSize;
  const [zoomPercent, setZoomPercent] = useState(ZOOM_DEFAULT);
  // The game loop is set up once, so it reads the zoom from this ref, not from state.
  const zoomRef = useRef(ZOOM_DEFAULT / 100);
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const speedMultiplierRef = useRef(1);
  const [isPaused, setIsPaused] = useState(false);
  const pausedRef = useRef(false);
  const [timer, setTimer] = useState(300); // 5 minutes
  const [setupError, setSetupError] = useState(null);

  // fighterState holds the live instances. `fighters` never changes for the
  // lifetime of a battle, so this is initialised once on mount; the initializer
  // returns a marker on failure and the error is stored in an effect, because
  // state initializers must stay pure (and must not throw).
  const [fighterState, setFighterState] = useState(() => {
    try {
      return { fighters: createFighters(fighters, arenaSize), error: null };
    } catch (error) {
      return { fighters: [], error };
    }
  });

  useEffect(() => {
    if (!fighterState.error) return;
    setSetupError(fighterState.error);
    console.error("Battle could not start:", fighterState.error);
  }, [fighterState]);

  const gameState = useRef({
    fighters: fighterState.fighters,
    lastTime: performance.now(),
    suddenDeath: false,
    resolved: false,
    // Seconds of "afterglow" left after the battle is decided. The fight is over
    // the instant the last blow lands, but the simulation keeps ticking for this
    // long so the final kill's explosion (particles, expanding rings, body drift)
    // actually animates instead of freezing on its first frame. Combat and death
    // handling are suppressed during the window; only motion and FX continue.
    resolutionGrace: 0,
    // Set once the afterglow expires so the onFinish hand-off fires exactly once.
    handoffStarted: false,
    particles: new ParticleSystem({ performanceMode: getSettings().performanceMode }),
    replayTime: 0,
    nextReplayCapture: 0,
    replayEndTime: null,
    replayFrames: [],
    pendingReplayCaptures: []
  });

  const getReplayFrames = async () => {
    const state = gameState.current;
    while (state.pendingReplayCaptures.length) {
      await Promise.all([...state.pendingReplayCaptures]);
    }
    const endTime = state.replayEndTime ?? state.replayTime;
    const startTime = Math.max(0, endTime - 10);
    return state.replayFrames
      .filter(frame => frame.time >= startTime && frame.time <= endTime)
      .sort((a, b) => a.time - b.time);
  };

  const [countdownStep, setCountdownStep] = useState(3);
  const countdownActiveRef = useRef(true);

  // Which side each fighter's HUD panel lives on, and whether one column is the
  // narrower one (3-player fights). Derived from the fighter count, so the layout
  // adapts automatically from a duel up to a four-way brawl.
  const sidePlan = planSides(fighterState.fighters.length);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, []);

  // 3, 2, 1, GO countdown before combat and music start.
  useEffect(() => {
    // Start the battle clock at zero for this match. It is only read once the
    // countdown has finished, so the countdown never counts as survival time.
    battleStartAt.current = null;
    audioManager.playCountdownBeep(3);
    const timeouts = [
      setTimeout(() => { setCountdownStep(2); audioManager.playCountdownBeep(2); }, 1000),
      setTimeout(() => { setCountdownStep(1); audioManager.playCountdownBeep(1); }, 2000),
      setTimeout(() => { setCountdownStep("GO"); audioManager.playCountdownBeep("go"); }, 3000),
      setTimeout(() => {
        setCountdownStep(null);
        countdownActiveRef.current = false;
        battleStartAt.current = performance.now();
        gameState.current.lastTime = performance.now();
        audioManager.playBattleMusic();
      }, 3600)
    ];
    return () => {
      timeouts.forEach(clearTimeout);
      audioManager.stopMusic();
    };
  }, []);

  // Keep the fighters' scoreboard records on the fighter objects for the end screen.
  useEffect(() => {
    fighterState.fighters.forEach((f, i) => {
      f.wins = fighters[i]?.wins || 0;
      f.losses = fighters[i]?.losses || 0;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const performanceMode = getSettings().performanceMode;
    if (performanceMode) disableGlow(ctx);
    // Performance mode captures replay frames half as often to cut encoding work.
    const replayInterval = performanceMode ? 0.5 : 0.2;
    const replayCanvas = document.createElement("canvas");
    replayCanvas.width = 480;
    replayCanvas.height = 480;
    const replayCtx = replayCanvas.getContext("2d");
    let animationFrameId;
    let timerAccumulator = 0;
    let suddenDeathAccumulator = 0;
    let fighterUiAccumulator = 0;

    const captureReplaySnapshot = () => {
      const state = gameState.current;
      const capturedAt = state.replayTime;
      replayCtx.drawImage(canvas, 0, 0, replayCanvas.width, replayCanvas.height);
      let resolveCapture;
      const pendingCapture = new Promise(resolve => { resolveCapture = resolve; });
      state.pendingReplayCaptures.push(pendingCapture);
      replayCanvas.toBlob(blob => {
        if (blob && capturedAt >= state.replayTime - 10.2) {
          state.replayFrames.push({ time: capturedAt, image: blob });
          state.replayFrames = state.replayFrames.filter(frame => frame.time >= state.replayTime - 10.2);
        }
        const pendingIndex = state.pendingReplayCaptures.indexOf(pendingCapture);
        if (pendingIndex >= 0) state.pendingReplayCaptures.splice(pendingIndex, 1);
        resolveCapture();
      }, "image/webp", 0.68);
    };

    // async because the hand-off awaits any in-flight replay captures before it
    // calls onFinish; the returned promise is intentionally not consumed (rAF
    // fires and forgets), and the try/catch below still covers a rejection.
    const gameLoop = async (time) => {
      try {
      const dt = (time - gameState.current.lastTime) / 1000;
      gameState.current.lastTime = time;
      // While paused the simulation clock is frozen (simulationDt === 0) but
      // rendering keeps running so the frozen frame stays on screen.
      const simulationDt = pausedRef.current ? 0 : Math.min(dt, 0.1) * speedMultiplierRef.current;
      const renderTime = time / 1000;
      let shouldCaptureReplayFrame = false;

      // A resolved battle still runs a stripped-down simulation for the
      // resolutionGrace window (see the victory branch below), so the final
      // explosion animates. Everything else - countdown, pause, and a resolved
      // battle whose grace has expired - freezes the simulation entirely.
      const inResolutionGrace = gameState.current.resolved && gameState.current.resolutionGrace > 0;
      if (countdownActiveRef.current || pausedRef.current || (gameState.current.resolved && !inResolutionGrace)) {
        // Countdown, pause and the finished results handoff all freeze simulation
        // updates.
      } else if (inResolutionGrace) {
        // Post-battle afterglow: the outcome is already decided, so NO combat,
        // targeting, deaths or timers run - but the world keeps moving so the
        // killing explosion plays out. Particles are advanced with the real dt
        // (they own their own lifetimes) and the survivors are allowed to keep
        // drifting so the arena does not snap to a frozen tableau.
        const graceDt = Math.min(dt, 0.1);
        gameState.current.fighters.forEach(f => {
          if (f.isDead || f.health <= 0) return; // corpses are already exploded
          // Bodies only: momentum carries them on. update() is deliberately NOT
          // called, so no class can swing, fire or deal damage after the whistle.
          f.x += (f.vx || 0) * graceDt;
          f.y += (f.vy || 0) * graceDt;
          // Keep them inside the playable area, same inset the arena draws.
          const min = 20 + f.radius;
          const max = ARENA_SIZE - 20 - f.radius;
          if (f.x < min) { f.x = min; f.vx = Math.abs(f.vx || 0); }
          else if (f.x > max) { f.x = max; f.vx = -Math.abs(f.vx || 0); }
          if (f.y < min) { f.y = min; f.vy = Math.abs(f.vy || 0); }
          else if (f.y > max) { f.y = max; f.vy = -Math.abs(f.vy || 0); }
        });
        gameState.current.particles.update(graceDt);
        gameState.current.resolutionGrace = Math.max(0, gameState.current.resolutionGrace - graceDt);
        // The UI reads live fighter positions, so keep publishing them here too.
        fighterUiAccumulator += dt;
        if (fighterUiAccumulator >= 0.1) {
          fighterUiAccumulator %= 0.1;
          setFighterState({ fighters: [...gameState.current.fighters], error: null });
        }
      } else {
        if (!gameState.current.resolved) {
          gameState.current.replayTime += simulationDt;
          if (gameState.current.replayTime >= gameState.current.nextReplayCapture) {
            shouldCaptureReplayFrame = true;
            gameState.current.nextReplayCapture = gameState.current.replayTime + replayInterval;
          }
        }
        timerAccumulator += simulationDt;

        while (timerAccumulator >= 1) {
          timerAccumulator -= 1;
          setTimer(currentTimer => {
            if (currentTimer <= 1) {
              gameState.current.suddenDeath = true;
              return 0;
            }
            return currentTimer - 1;
          });
        }

        // One tick per second: per-frame hits would flood the hit feedback.
        let suddenDeathTick = false;
        if (gameState.current.suddenDeath) {
          suddenDeathAccumulator += simulationDt;
          if (suddenDeathAccumulator >= 1) {
            suddenDeathAccumulator -= 1;
            suddenDeathTick = true;
          }
        }

        // Ramp the battle music up as the fight heats up: intensity rises with
        // damage taken and maxes out during sudden death.
        if (gameState.current.suddenDeath) {
          audioManager.setBattleIntensity(1);
        } else {
          const hurt = gameState.current.fighters.reduce(
            (worst, f) => Math.max(worst, 1 - Math.max(0, f.health) / Math.max(1, f.maxHealth)),
            0
          );
          const timePressure = 1 - Math.min(1, timer / 60);
          audioManager.setBattleIntensity(Math.min(1, hurt * 0.7 + timePressure * 0.5));
        }

        gameState.current.fighters.forEach(f => { f.particleSystem = gameState.current.particles; });

        // The whole combat frame - targeting, class AI, sudden-death drain, wall
        // and body collisions, touch damage - is the shared engine step, so this
        // battle and a tournament bout run identical logic.
        const { hardestImpact } = stepBattle(gameState.current.fighters, {
          dt: simulationDt,
          arenaSize: ARENA_SIZE,
          suddenDeathTick,
          onSuddenDeath: f => {
            gameState.current.particles.emit(f.x + (Math.random() - 0.5) * f.radius * 2, f.y, "#ff4d6d", 2, { speed: 60, size: 2.2, life: 0.6 });
          },
          onContact: ({ x, y }) => {
            gameState.current.particles.ring(x, y, "#9fe8ff", { startRadius: 4, endRadius: 30, life: 0.22, lineWidth: 2 });
          }
        });

        // Resolve deaths caused by class attacks / sudden death / body contacts.
        // Deaths are always settled before the victory check, so the battle can
        // never end on a stale alive-count.
        resolveDeaths(gameState.current.fighters, gameState.current.particles);

        // Hard fighter-vs-fighter bounces jolt the camera; both applyDeflection
        // calls already spawned sparks via the particle system.
        if (hardestImpact > 0.65) {
          gameState.current.fighters.forEach(f => { f.screenShake = Math.max(f.screenShake || 0, 0.06 + hardestImpact * 0.05); });
        }

        gameState.current.particles.update(simulationDt);

        if (!gameState.current.resolved && countAlive(gameState.current.fighters) <= 1) {
            // A free-for-all ends only when at most ONE fighter is left standing -
            // never when the first fighter dies. Everyone eliminated before that
            // keeps the placement they earned.
            gameState.current.resolved = true;
            // Stamp the final statistics (which
            // requires the countdown clock to have run), then keep the arena moving
            // for a 1s beat where the killing explosion finishes playing and the
            // survivor keeps floating around.
            // An instant sweep can end the battle before the clock
            // was ever zeroed, so fall back to now - that is still the correct
            // end of a battle that never started.
            gameState.current.replayEndTime = gameState.current.replayTime;
            shouldCaptureReplayFrame = true;
            battleStartAt.current = battleStartAt.current ?? performance.now();
            finishBattle(gameState.current.fighters);
            // Open the post-battle afterglow window. The simulation keeps running
            // (particles + drifting bodies, no combat) until it hits zero, then the
            // hand-off below fires - so the end screen cannot appear while the
            // explosion is still mid-burst.
            gameState.current.resolutionGrace = RESOLUTION_GRACE_SECONDS;
            gameState.current.handoffStarted = false;
            // The fight is over the instant the last blow lands: cut the music right
            // away rather than letting it play through the hand-off delay.
            audioManager.stopMusic();
        }

        fighterUiAccumulator += dt;
        if (fighterUiAccumulator >= 0.1 || gameState.current.resolved) {
          fighterUiAccumulator %= 0.1;
          setFighterState({ fighters: [...gameState.current.fighters], error: null });
        }
      }

      // Hand off to the results screen once the afterglow has elapsed. Driven by
      // the simulation clock (checked on every frame) rather than a setTimeout, so
      // it stays locked to the explosion it is waiting for - a paused or slowed
      // battle cannot desync the two. Guarded so onFinish is called exactly once.
      if (gameState.current.resolved && gameState.current.resolutionGrace <= 0 && !gameState.current.handoffStarted) {
        gameState.current.handoffStarted = true;
        onFinish(gameState.current.fighters, { aborted: false, replayFrames: await getReplayFrames() });
      }

      // Draw
      const zoomLevel = zoomRef.current;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.shadowBlur = 0;
      ctx.clearRect(0, 0, ARENA_SIZE, ARENA_SIZE);
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, ARENA_SIZE, ARENA_SIZE);

      // Zoom: the world is ARENA_SIZE square at zoom 1. Scaling the context alone makes
      // the drawable area shrink into the middle of the canvas, which puts the
      // drawn border inside the region fighters can actually reach. Undo the
      // inset by translating in screen space first, so the playable rectangle and
      // the drawn border stay exactly aligned at every zoom level.
      ctx.save();
      ctx.scale(zoomLevel, zoomLevel);
      const inset = (ARENA_SIZE * (1 - zoomLevel)) / 2;
      ctx.translate(inset / zoomLevel, inset / zoomLevel);

      // Draw inner arena border (playable area boundary)
      ctx.strokeStyle = "rgba(0, 242, 255, 0.4)";
      ctx.lineWidth = 2;
      ctx.strokeRect(20, 20, ARENA_SIZE - 40, ARENA_SIZE - 40);

      // Clip everything that follows to the playable area, so no weapon, trail,
      // slash arc or particle can ever paint outside the border.
      ctx.beginPath();
      ctx.rect(20, 20, ARENA_SIZE - 40, ARENA_SIZE - 40);
      ctx.clip();
      drawGridLines(ctx, ARENA_SIZE);

      if (gameState.current.suddenDeath) {
        const pulse = 0.10 + 0.06 * Math.sin(renderTime * 6);
        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.fillStyle = "#ff2d55";
        ctx.fillRect(20, 20, ARENA_SIZE - 40, ARENA_SIZE - 40);
        ctx.restore();
      }

      const shakeSource = gameState.current.fighters.find(f => f.screenShake > 0);
      if (shakeSource) {
        const shakeAmount = 4 * (shakeSource.screenShake / 0.12);
        ctx.translate(
          (Math.random() - 0.5) * shakeAmount,
          (Math.random() - 0.5) * shakeAmount
        );
      }

      // Decay screen shake for every fighter.
      decayScreenShake(gameState.current.fighters, simulationDt);

      // Draw Fighters & Particles
      // Each fighter is wrapped in its own save/restore pair, so a class whose
      // draw() forgets a restore (or adds an extra one) cannot pop the arena's
      // clip region and paint outside the border. The clip is re-asserted per
      // fighter to be certain.
      gameState.current.fighters.forEach(f => {
        // A dead fighter is already exploded into particles by die(), so nothing
        // of it may be painted again. `FighterBase.draw` is not enough on its own:
        // it early-returns on `isDead`, but every subclass then draws its weapon,
        // trail, spawn or aura AFTER calling super.draw() and outside that guard.
        // That left corpses swinging swords and dragging poison trails across the
        // arena for the rest of the match. Gating here covers all 25 classes (and
        // Duplicator's clones, which recurse back through this same draw) in one
        // place instead of needing a guard in every class.
        if (f.isDead || f.health <= 0) return;

        ctx.save();
        // Re-apply the clip defensively: if a previous draw() unbalanced the
        // canvas stack, this restores the playable-area clip before this fighter
        // renders, so nothing can escape the border.
        ctx.beginPath();
        ctx.rect(20, 20, ARENA_SIZE - 40, ARENA_SIZE - 40);
        ctx.clip();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
        const isSlowed = f.statusEffects?.some(e => ["slow", "web-slow", "web-weave", "trail-slow", "stun-slow"].includes(e.name));
        try {
          if (isSlowed) {
            // Consistent readable slow indicator: cyan frost shell around the body.
            ctx.save();
            ctx.globalAlpha = 0.3 + 0.15 * Math.sin(renderTime * 8);
            ctx.fillStyle = "rgba(90, 190, 255, 0.55)";
            ctx.shadowBlur = 22;
            ctx.shadowColor = "#5abeff";
            ctx.beginPath();
            ctx.arc(f.x, f.y, f.radius + 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
          f.draw(ctx, renderTime);
        } catch (error) {
          // A single broken class must never blank the whole arena.
          console.error(`Draw failed for ${f.name}`, error);
        }
        // Outer ring follows the body's squash so bounces stay coherent. Only
        // reached for a living fighter - dead ones returned above, so this no
        // longer needs its own `isDead` check.
        ctx.save();
        ctx.translate(f.x, f.y);
        squashTransform(ctx, f.squashX ?? 1, f.squashY ?? 1, f.squashAngle ?? 0);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = f.bounceTimer > 0 ? "#ffffff" : f.color;
        ctx.lineWidth = 2 + (f.impactStrength ?? 0) * 1.5;
        ctx.shadowBlur = 6 + (f.impactStrength ?? 0) * 8;
        ctx.shadowColor = f.color;
        ctx.beginPath();
        ctx.arc(0, 0, f.radius + 4, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = f.color;
        ctx.beginPath();
        ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.restore();
        ctx.restore();
      });
      gameState.current.particles.draw(ctx);
      ctx.restore();

      if (shouldCaptureReplayFrame) {
        captureReplaySnapshot();
      }

      animationFrameId = requestAnimationFrame(gameLoop);
      } catch (error) {
        // A throwing class must not leave a frozen arena: stop the loop and surface
        // the failure through the same banner the setup path uses.
        console.error("Battle loop failed:", error);
        setSetupError(error);
      }
    };

    animationFrameId = requestAnimationFrame(gameLoop);
    return () => { cancelAnimationFrame(animationFrameId); };
  }, []);

  // A failed setup renders a readable message instead of letting the error escape
  // during render, which is what used to blank the entire page.
  if (setupError) {
    return (
      <div className="arena-screen" style={{ display: "flex", justifyContent: "center", alignItems: "center", color: "white", flexDirection: "column", gap: "16px", padding: "40px" }}>
        <h1 style={{ color: "#ff6873", margin: 0 }}>BATTLE COULD NOT START</h1>
        <p style={{ maxWidth: "640px", textAlign: "center", lineHeight: 1.6 }}>{setupError.message}</p>
        <button onClick={() => onFinish([], { aborted: true })} style={{ padding: "8px 18px", backgroundColor: "#ff4444", color: "white", border: "none", cursor: "pointer", fontWeight: "bold" }}>Back to roster</button>
      </div>
    );
  }

  return (
    <div className="arena-screen" style={{ display: "flex", justifyContent: "center", alignItems: "center", color: "white", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "20px", marginBottom: "10px" }}>
            <label className="zoom-control" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span>Zoom</span>
              <select
                className="zoom-select"
                value={zoomPercent}
                onChange={e => { const next = Number(e.target.value); zoomRef.current = next / 100; setZoomPercent(next); }}
              >
                {ZOOM_OPTIONS.map(percent => <option key={percent} value={percent}>{percent}%</option>)}
              </select>
            </label>
            <div className="speed-controls" aria-label="Combat speed">
              {[1, 2, 3].map(speed => (
                <button
                  key={speed}
                  className={speedMultiplier === speed ? "speed-button speed-button-active" : "speed-button"}
                  aria-pressed={speedMultiplier === speed}
                  onClick={() => { speedMultiplierRef.current = speed; setSpeedMultiplier(speed); }}
                >{speed}x</button>
              ))}
            </div>
            <button
              className={isPaused ? "pause-button pause-button-active" : "pause-button"}
              aria-pressed={isPaused}
              onClick={() => {
                audioManager.playUiClick();
                const next = !pausedRef.current;
                pausedRef.current = next;
                setIsPaused(next);
                // Freeze the soundtrack with the fight: the music stops the
                // instant Pause is hit and resumes when the fight does.
                if (next) audioManager.pauseMusic();
                else audioManager.resumeMusic();
              }}
            >{isPaused ? "▶ Resume" : "⏸ Pause"}</button>
            <button onClick={async () => {
              audioManager.playUiClick();
              audioManager.stopMusic();
              gameState.current.resolved = true;
              // Claim the hand-off now: the loop would otherwise report this exit as a finished battle and award wins/losses.
              gameState.current.handoffStarted = true;
              gameState.current.replayEndTime = gameState.current.replayTime;
              onFinish(gameState.current.fighters, { aborted: true, replayFrames: await getReplayFrames() });
            }}>Exit Game</button>
        </div>
        <div className={`arena-layout arena-layout-${sidePlan.count}`} style={{ display: "flex", justifyContent: "center", alignItems: "center", color: "white" }}>
          <div className={`arena-stats arena-stats-left ${sidePlan.leftSkinny ? "arena-stats-skinny" : ""}`}>
            {sidePlan.left.map(i => (
              <StatsPanel key={i} fighter={fighterState.fighters[i]} index={i} battleTime={`${Math.floor(timer / 60)}:${String(timer % 60).padStart(2, "0")}`} suddenDeath={timer === 0} />
            ))}
          </div>
          <div className="arena-scroll" style={{ position: "relative" }}>
              <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", fontFamily: "var(--font-mono)", zIndex: 2, pointerEvents: "none" }}>Time: {Math.floor(timer / 60)}:{String(timer % 60).padStart(2, "0")}</div>
                <canvas ref={canvasRef} width={ARENA_SIZE} height={ARENA_SIZE} />
                {countdownStep !== null && (
                  <div className="countdown-overlay" aria-live="assertive">
                    <span key={countdownStep} className={countdownStep === "GO" ? "countdown-number countdown-go" : "countdown-number"}>{countdownStep}</span>
                  </div>
                )}
                {isPaused && countdownStep === null && (
                  <div className="countdown-overlay pause-overlay" aria-live="polite">
                    <span className="countdown-number pause-label">PAUSED</span>
                  </div>
                )}
            </div>
          <div className={`arena-stats arena-stats-right ${sidePlan.rightSkinny ? "arena-stats-skinny" : ""}`}>
            {sidePlan.right.map(i => (
              <StatsPanel key={i} fighter={fighterState.fighters[i]} index={i} battleTime={`${Math.floor(timer / 60)}:${String(timer % 60).padStart(2, "0")}`} suddenDeath={timer === 0} />
            ))}
          </div>
        </div>
    </div>
  );
}
