import { useEffect, useState } from "react";
import { audioManager } from "../engine/audio/AudioManager";
import { getSettings, updateSettings } from "../engine/settings";

const percent = value => Math.round(value * 100);

export default function SettingsPanel({ onClose }) {
  const [settings, setSettings] = useState(getSettings);

  useEffect(() => {
    const onKey = event => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const change = patch => {
    setSettings(updateSettings(patch));
    audioManager.applyVolumes();
  };

  return (
    <div className="fighter-info-overlay" role="dialog" aria-label="Settings">
      <div className="settings-panel">
        <header>
          <div>
            <div className="roster-eyebrow">PREFERENCES</div>
            <h2>SETTINGS</h2>
          </div>
          <button className="fighter-info-close" onClick={onClose} aria-label="Close settings">×</button>
        </header>

        <label className="settings-row">
          <span className="settings-label">MUSIC VOLUME <b>{percent(settings.musicVolume)}%</b></span>
          <input
            type="range"
            min="0"
            max="100"
            value={percent(settings.musicVolume)}
            onChange={event => change({ musicVolume: Number(event.target.value) / 100 })}
          />
        </label>

        <label className="settings-row">
          <span className="settings-label">SOUND EFFECTS <b>{percent(settings.sfxVolume)}%</b></span>
          <input
            type="range"
            min="0"
            max="100"
            value={percent(settings.sfxVolume)}
            onChange={event => change({ sfxVolume: Number(event.target.value) / 100 })}
          />
        </label>

        <div className="settings-row">
          <span className="settings-label">PERFORMANCE MODE</span>
          <button
            className="settings-toggle"
            aria-pressed={settings.performanceMode}
            onClick={() => change({ performanceMode: !settings.performanceMode })}
          >{settings.performanceMode ? "ON" : "OFF"}</button>
          <p className="settings-hint">Turns off glow, thins particles and slows replay capture. Applies from the next battle.</p>
        </div>
      </div>
    </div>
  );
}
