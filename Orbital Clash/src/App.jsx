import { useEffect, useState } from "react";
import Menu from "./components/Menu";
import Arena from "./components/Arena";
import EndScreen from "./components/EndScreen";
import SettingsPanel from "./components/SettingsPanel";
import { audioManager } from "./engine/audio/AudioManager";
import { DEFAULT_ARENA_SIZE } from "./engine/config";
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
      {screen === "menu" && <Menu onStart={(f, size) => { setSelectedFighters(f); setArenaSize(size); setScreen("game"); }} />}
      {screen === "game" && <Arena fighters={selectedFighters} arenaSize={arenaSize} onFinish={(res, meta) => { setBattleResults(res); setBattleAborted(Boolean(meta?.aborted)); setReplayFrames(meta?.replayFrames || []); setScreen("end"); }} />}
      {screen === "end" && <EndScreen results={battleResults} aborted={battleAborted} replayFrames={replayFrames} onReturn={returnToRoster} />}
    </div>
  );
}

export default App;
