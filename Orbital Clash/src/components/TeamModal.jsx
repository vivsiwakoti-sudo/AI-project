import { useState } from "react";
import { audioManager } from "../engine/audio/AudioManager";
import { TEAM_MODES, TEAM_MODE_IDS, describeSizes, planTeams } from "../engine/teamModes";

// The step after the prediction: how the selected fighters fight. Presets confirm
// with one click and preview the sides they produce for this roster. Custom opens
// a per-fighter picker; team numbers are only labels, so the engine re-indexes them.
export default function TeamModal({ fighters, onConfirm, onCancel }) {
  const count = fighters.length;
  const [customMode, setCustomMode] = useState(false);
  const [customTeams, setCustomTeams] = useState(() => fighters.map((_, i) => (i % 2) + 1));
  const [error, setError] = useState(null);

  const confirmPlan = (mode, teams = null) => {
    audioManager.playUiClick();
    const plan = planTeams(mode, count, teams);
    if (plan.error) {
      setError(plan.error);
      return;
    }
    onConfirm({ mode, ...plan });
  };

  const cycleTeam = index => {
    setError(null);
    setCustomTeams(current => current.map((team, i) => (i === index ? (team % count) + 1 : team)));
  };

  const chooseCustom = () => {
    audioManager.playUiClick();
    setCustomMode(true);
  };

  const previewFor = mode => {
    if (mode === "ffa") return "EVERYONE FOR THEMSELVES";
    const plan = planTeams(mode, count);
    return `${plan.sizes.length} TEAMS · ${describeSizes(plan.sizes)}`;
  };

  const customPreview = planTeams("custom", count, customTeams);

  return (
    <div className="fighter-info-overlay prediction-overlay" role="dialog" aria-label="Battle format">
      <div className="prediction-modal team-modal">
        <header>
          <div>
            <div className="roster-eyebrow">BATTLE FORMAT</div>
            <h2>{customMode ? "ASSIGN TEAMS" : "HOW ARE THEY FIGHTING?"}</h2>
          </div>
          <button className="fighter-info-close" onClick={onCancel} aria-label="Cancel battle format">×</button>
        </header>

        {!customMode ? (
          <div className="team-mode-grid" role="group" aria-label="Battle format">
            {TEAM_MODE_IDS.map(id => {
              const mode = TEAM_MODES[id];
              const isCustom = id === "custom";
              return (
                <button
                  key={id}
                  type="button"
                  className="team-mode-card"
                  onClick={() => (isCustom ? chooseCustom() : confirmPlan(id))}
                >
                  <b>{mode.label}</b>
                  <span>{isCustom ? "PICK EACH FIGHTER'S TEAM" : previewFor(id)}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <>
            <p className="prediction-progress">Tap a fighter to move them to the next team.</p>
            <div className="team-custom-list">
              {fighters.map((fighter, index) => (
                <button
                  key={fighter.name}
                  type="button"
                  className="team-custom-row"
                  style={{ "--fighter-color": fighter.color }}
                  onClick={() => cycleTeam(index)}
                >
                  <span>{fighter.name}</span>
                  <b>TEAM {customTeams[index]}</b>
                </button>
              ))}
            </div>
            <p className="team-custom-summary">
              {customPreview.error ? customPreview.error : `${customPreview.sizes.length} TEAMS · ${describeSizes(customPreview.sizes)}`}
            </p>
            <div className="prediction-footer">
              <button type="button" className="prediction-skip-button" onClick={() => { setError(null); setCustomMode(false); }}>BACK</button>
              <button type="button" className="prediction-skip-button" onClick={() => confirmPlan("custom", customTeams)}>START</button>
            </div>
          </>
        )}

        {error && <p className="team-error" role="alert">{error}</p>}

        {!customMode && (
          <div className="prediction-footer">
            <button type="button" className="prediction-cancel-button" onClick={onCancel}>CANCEL</button>
          </div>
        )}
      </div>
    </div>
  );
}
