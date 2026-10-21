import { useEffect, useState } from "react";
import Menu from "./components/Menu";
import Arena from "./components/Arena";
import EndScreen from "./components/EndScreen";
import SettingsPanel from "./components/SettingsPanel";
import TournamentScreen from "./components/TournamentScreen";
import ChampionScreen from "./components/ChampionScreen";
import { audioManager } from "./engine/audio/AudioManager";
import { DEFAULT_ARENA_SIZE } from "./engine/config";
import {
  buildTournamentBracket,
  loadTournamentStats,
  loadActiveTournament,
  saveActiveTournament,
  recordTournamentResult
} from "./engine/tournament";
import "./App.css";

function App() {
  const [screen, setScreen] = useState("menu");
  const [selectedFighters, setSelectedFighters] = useState([]);
  const [arenaSize, setArenaSize] = useState(DEFAULT_ARENA_SIZE);
  const [battleResults, setBattleResults] = useState(null);
  const [battleAborted, setBattleAborted] = useState(false);
  const [replayFrames, setReplayFrames] = useState([]);
  const [isMuted, setIsMuted] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // --- Tournament Mode -------------------------------------------------------
  // `tournament` is the live bracket driven by the engine; `tournamentRunId`
  // remounts TournamentScreen so a brand-new tournament cannot inherit any
  // state (battle loop, timers, listeners) from the previous one.
  const [tournament, setTournament] = useState(null);
  const [tournamentRunId, setTournamentRunId] = useState(0);
  const [champion, setChampion] = useState(null);
  const [stats, setStats] = useState(() => loadTournamentStats());

  // Opens Tournament Mode. An in-progress tournament restored from storage is
  // resumed exactly where it stopped, so closing the game mid-bracket does not
  // lose progress; only when there is no resumable bracket does a new 25-class
  // tournament get built. A *completed* saved tournament is not resumed - it is
  // shown on the champion screen instead of replaying its bracket.
  const startTournament = () => {
    const restored = loadActiveTournament();
    const next = restored || buildTournamentBracket();
    saveActiveTournament(next);
    setTournament(next);
    setStats(loadTournamentStats());
    setTournamentRunId(id => id + 1);
    if (next.status === "complete" && next.champion) {
      setChampion(next);
      setScreen("champion");
      return;
    }
    setChampion(null);
    setScreen("tournament");
  };

  const returnToRoster = () => {
    setBattleResults(null);
    setReplayFrames([]);
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

  return (
    <div className="App">
      <div className="screen-frame"></div>
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
      {screen === "menu" && <Menu onStart={(f, size) => { setSelectedFighters(f); setArenaSize(size); setScreen("game"); }} onStartTournament={startTournament} />}
      {screen === "game" && <Arena fighters={selectedFighters} arenaSize={arenaSize} onFinish={(res, meta) => { setBattleResults(res); setBattleAborted(Boolean(meta?.aborted)); setReplayFrames(meta?.replayFrames || []); setScreen("end"); }} />}
      {screen === "end" && <EndScreen results={battleResults} aborted={battleAborted} replayFrames={replayFrames} onReturn={returnToRoster} />}

      {screen === "tournament" && (
        <TournamentScreen
          key={tournamentRunId}
          tournament={tournament}
          onTournamentChange={next => {
            setTournament(next);
            saveActiveTournament(next);
          }}
          onComplete={next => {
            setTournament(next);
            saveActiveTournament(next);
            // Fold the whole tournament into the persistent stats + history once.
            // The engine guards against counting the same tournament twice.
            setStats(recordTournamentResult(next));
            setChampion(next);
            setScreen("champion");
          }}
          onExit={() => {
            setTournament(null);
            saveActiveTournament(null);
            setScreen("menu");
          }}
        />
      )}
      {screen === "champion" && (
        <ChampionScreen
          tournament={champion || tournament}
          stats={stats}
          onNewTournament={() => {
            const next = buildTournamentBracket();
            saveActiveTournament(next);
            setTournament(next);
            setTournamentRunId(id => id + 1);
            setChampion(null);
            setStats(loadTournamentStats());
            setScreen("tournament");
          }}
          onMainMenu={() => {
            setTournament(null);
            setChampion(null);
            saveActiveTournament(null);
            setScreen("menu");
          }}
        />
      )}
    </div>
  );
}

export default App;
