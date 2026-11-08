import { useEffect, useState } from "react";
import Menu from "./components/Menu";
import TitleScreen from "./components/TitleScreen";
import Arena from "./components/Arena";
import EndScreen from "./components/EndScreen";
import SettingsPanel from "./components/SettingsPanel";
import TournamentScreen from "./components/TournamentScreen";
import ChampionScreen from "./components/ChampionScreen";
import ScreenTransition from "./components/ScreenTransition";
import PredictionModal from "./components/PredictionModal";
import { audioManager } from "./engine/audio/AudioManager";
import { DEFAULT_ARENA_SIZE } from "./engine/config";
import { FIGHTER_CLASSES } from "./engine/fighterDefinitions";
import { saveLastReplay } from "./engine/replayStore";
import {
  addPrediction,
  resolveBattlePrediction,
  resolveTournamentPrediction,
  voidTournamentPrediction
} from "./engine/predictions";
import {
  buildTournamentBracket,
  loadTournamentStats,
  loadActiveTournament,
  hasResumableTournament,
  saveActiveTournament,
  recordTournamentResult
} from "./engine/tournament";
import "./App.css";

const ALL_FIGHTERS = Object.values(FIGHTER_CLASSES).map(({ name, color }) => ({ name, color }));

function App() {
  const [screen, setScreen] = useState("menu");
  const [selectedFighters, setSelectedFighters] = useState([]);
  const [arenaSize, setArenaSize] = useState(DEFAULT_ARENA_SIZE);
  const [battleResults, setBattleResults] = useState(null);
  const [battleAborted, setBattleAborted] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  // The title screen opens the app. Its zoom hands off to the roster, which zooms
  // in from the centre once; the flag is cleared as soon as the player leaves it.
  const [showTitle, setShowTitle] = useState(true);
  const [rosterIntro, setRosterIntro] = useState(false);
  // A prediction is asked for before a battle starts or a new bracket is built.
  // `onConfirm` receives the guesses and carries on with the start it was waiting on.
  const [pendingPrediction, setPendingPrediction] = useState(null);

  // --- Tournament Mode -------------------------------------------------------
  // `tournament` is the live bracket driven by the engine; `tournamentRunId`
  // remounts TournamentScreen so a brand-new tournament cannot inherit any
  // state (battle loop, timers, listeners) from the previous one.
  const [tournament, setTournament] = useState(null);
  const [tournamentRunId, setTournamentRunId] = useState(0);
  const [champion, setChampion] = useState(null);
  const [stats, setStats] = useState(() => loadTournamentStats());

  // Puts a bracket on screen. A completed bracket goes to the champion screen
  // instead of replaying its matches.
  const enterTournament = next => {
    saveActiveTournament(next);
    setTournament(next);
    setStats(loadTournamentStats());
    setTournamentRunId(id => id + 1);
    setRosterIntro(false);
    if (next.status === "complete" && next.champion) {
      setChampion(next);
      setScreen("champion");
      return;
    }
    setChampion(null);
    setScreen("tournament");
  };

  // A new bracket is only built once its winner has been predicted, so the
  // prediction is stored against the bracket's own id.
  const beginNewTournament = arenaSize => {
    setPendingPrediction({
      kind: "tournament",
      fighters: ALL_FIGHTERS,
      onConfirm: guesses => {
        const next = buildTournamentBracket({ arenaSize });
        addPrediction({ kind: "tournament", tournamentId: next.id, guesses });
        setPendingPrediction(null);
        enterTournament(next);
      }
    });
  };

  // Opens Tournament Mode. An in-progress tournament restored from storage is
  // resumed exactly where it stopped, so closing the game mid-bracket does not
  // lose progress; only when there is no resumable bracket does a new 26-class
  // tournament get built. A *completed* saved tournament is not resumed - it is
  // shown on the champion screen instead of replaying its bracket.
  const startTournament = () => {
    const restored = loadActiveTournament();
    if (restored) {
      enterTournament(restored);
      return;
    }
    beginNewTournament(undefined);
  };

  const returnToRoster = () => {
    setBattleResults(null);
    setScreen("menu");
  };

  // Browsers require a user gesture before audio can play; unlock on the first click/keypress.
  useEffect(() => {
    const unlock = () => audioManager.unlock();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  const toggleMute = () => setIsMuted(audioManager.toggleMuted());

  // Every screen is built here rather than as a list of `screen === …` siblings,
  // so the transition wrapper can keep showing the old one for the length of its
  // exit animation. `screen` still drives it exactly as before.
  const screens = {
    menu: <Menu intro={rosterIntro} onStart={(f, size) => setPendingPrediction({
      kind: "battle",
      fighters: f.map(({ name, color }) => ({ name, color })),
      onConfirm: guesses => {
        addPrediction({ kind: "battle", guesses });
        setPendingPrediction(null);
        setSelectedFighters(f);
        setArenaSize(size);
        setRosterIntro(false);
        setScreen("game");
      }
    })} onStartTournament={startTournament} />,
    game: <Arena fighters={selectedFighters} arenaSize={arenaSize} onFinish={(res, meta) => {
      const aborted = Boolean(meta?.aborted);
      resolveBattlePrediction({ winner: res?.find(f => f.placement === 1)?.name ?? null, aborted });
      setBattleResults(res);
      setBattleAborted(aborted);
      // The last 25 seconds are kept for the roster's replay button.
      saveLastReplay(meta?.replayFrames, {
        aborted,
        winner: res?.find(f => f.placement === 1)?.name ?? null,
        fighters: (res ?? []).map(({ name, color }) => ({ name, color }))
      });
      setScreen("end");
    }} />,
    end: <EndScreen results={battleResults} aborted={battleAborted} onReturn={returnToRoster} />,
    tournament: (
      <TournamentScreen
        key={tournamentRunId}
        tournament={tournament}
        // Storage is the TournamentScreen's job: it writes every bracket change
        // and is the only place that may DELETE the save (EXIT WITHOUT SAVING).
        // Saving again here would resurrect a bracket the player just discarded.
        onTournamentChange={next => setTournament(next)}
        onComplete={next => {
          setTournament(next);
          saveActiveTournament(next);
          // Fold the whole tournament into the persistent stats + history once.
          // The engine guards against counting the same tournament twice.
          setStats(recordTournamentResult(next));
          resolveTournamentPrediction(next.id, next.champion);
          setChampion(next);
          setScreen("champion");
        }}
        onExit={() => {
          // EXIT WITHOUT SAVING discards the bracket, so its prediction can never
          // be settled. A bracket saved for later stays resumable and keeps its
          // prediction pending.
          if (!hasResumableTournament()) voidTournamentPrediction(tournament?.id);
          setTournament(null);
          setScreen("menu");
        }}
      />
    ),
    champion: (
      <ChampionScreen
        tournament={champion || tournament}
        stats={stats}
        onNewTournament={() => {
          // The next tournament starts on the map the last one used; the overview
          // lets the player change it before the first match.
          beginNewTournament((champion || tournament)?.arenaSize);
        }}
        onMainMenu={() => {
          setTournament(null);
          setChampion(null);
          saveActiveTournament(null);
          setScreen("menu");
        }}
      />
    )
  };

  return (
    <div className="App">
      <div className="screen-frame"></div>
      {showTitle ? (
        <TitleScreen onStart={() => { setRosterIntro(true); setShowTitle(false); }} />
      ) : (
        <>
          <header className={`app-topbar app-topbar-${screen}`}>
            <div className="app-brand"><span className="app-brand-dot" />ORBITAL CLASH</div>
            <div className="app-topbar-actions">
              {screen === "game" && <div className="app-live-label">LIVE COMBAT</div>}
              {screen === "end" && <div className="app-live-label">BATTLE REPORT</div>}
              <button className="audio-toggle-button" onClick={toggleMute} aria-pressed={isMuted}>{isMuted ? "🔇 MUTED" : "🔊 SOUND"}</button>
              <button className="audio-toggle-button" onClick={() => setShowSettings(true)} aria-haspopup="dialog">SETTINGS</button>
            </div>
          </header>
          {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}

          {/* The `.app-screen` node is keyed on the screen so the arriving screen is
              a fresh mount and its entrance animation always plays from the start;
              the transition wrapper itself stays mounted (see ScreenTransition). */}
          <ScreenTransition screenKey={screen} render={key => <div className={`app-screen app-screen-${key}`} key={key}>{screens[key]}</div>} />
          {pendingPrediction && (
            <PredictionModal
              kind={pendingPrediction.kind}
              fighters={pendingPrediction.fighters}
              onConfirm={guesses => pendingPrediction.onConfirm(guesses)}
              onCancel={() => setPendingPrediction(null)}
            />
          )}
        </>
      )}
    </div>
  );

}

export default App;
