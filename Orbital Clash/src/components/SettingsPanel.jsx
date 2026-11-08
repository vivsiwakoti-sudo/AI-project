import { useEffect, useState } from "react";
import { audioManager } from "../engine/audio/AudioManager";
import { getSettings, updateSettings } from "../engine/settings";
import { GRAPHICS_LEVELS } from "../engine/graphics";

const percent = value => Math.round(value * 100);

const GRAPHICS_HINTS = {
  low: "No glow, sparse particles and half-rate replay capture. Best for slower computers.",
  medium: "Soft glow and moderate particle bursts.",
  high: "Full glow and dense particle bursts."
};

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
          <span className="settings-label">GRAPHICS QUALITY <b>{settings.graphicsQuality.toUpperCase()}</b></span>
          <div className="settings-segmented" role="group" aria-label="Graphics quality">
            {GRAPHICS_LEVELS.map(level => (
              <button
                key={level}
                className="settings-toggle"
                aria-pressed={settings.graphicsQuality === level}
                onClick={() => change({ graphicsQuality: level })}
              >{level.toUpperCase()}</button>
            ))}
          </div>
          <p className="settings-hint">{GRAPHICS_HINTS[settings.graphicsQuality]} Applies from the next battle.</p>
        </div>
      </div>
    </div>
  );
}
