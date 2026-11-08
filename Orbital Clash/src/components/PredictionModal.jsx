import { useState } from "react";
import { audioManager } from "../engine/audio/AudioManager";
import { MAX_GUESSERS } from "../engine/predictions";

// Two steps: first how many people are guessing, then one pick per guesser in
// guess order (G1, G2, ...). The picks are handed to onConfirm only once the
// last guesser has chosen, so cancelling part-way stores nothing.
export default function PredictionModal({ kind, fighters, onConfirm, onCancel }) {
  const [guesserCount, setGuesserCount] = useState(null);
  const [picks, setPicks] = useState([]);

  const isTournament = kind === "tournament";
  const heading = isTournament ? "TOURNAMENT WINNER" : "BATTLE WINNER";
  const counts = Array.from({ length: MAX_GUESSERS }, (_, i) => i + 1);

  const chooseCount = count => {
    audioManager.playUiClick();
    setGuesserCount(count);
  };

  const choosePick = name => {
    audioManager.playUiClick();
    const next = [...picks, name];
    if (next.length >= guesserCount) {
      onConfirm(next);
      return;
    }
    setPicks(next);
  };

  const currentGuesser = picks.length + 1;

  return (
    <div className="fighter-info-overlay prediction-overlay" role="dialog" aria-label={`${heading} prediction`}>
      <div className="prediction-modal">
        <header>
          <div>
            <div className="roster-eyebrow">{isTournament ? "BEFORE THE BRACKET" : "BEFORE THE FIGHT"}</div>
            <h2>{guesserCount === null ? "HOW MANY ARE GUESSING?" : `G${currentGuesser} — WHO WILL WIN?`}</h2>
          </div>
          <button className="fighter-info-close" onClick={onCancel} aria-label="Cancel prediction">×</button>
        </header>

        {guesserCount === null ? (
          <div className="prediction-count-row" role="group" aria-label="Number of guessers">
            {counts.map(count => (
              <button key={count} type="button" className="prediction-count-button" onClick={() => chooseCount(count)}>
                {count}
              </button>
            ))}
          </div>
        ) : (
          <>
            <p className="prediction-progress">Guesser {currentGuesser} of {guesserCount}</p>
            <div className="prediction-pick-grid">
              {fighters.map(fighter => (
                <button
                  key={fighter.name}
                  type="button"
                  className="prediction-pick-button"
                  style={{ "--fighter-color": fighter.color }}
                  onClick={() => choosePick(fighter.name)}
                >
                  {fighter.name}
                </button>
              ))}
            </div>
          </>
        )}

        <button type="button" className="prediction-cancel-button" onClick={onCancel}>CANCEL</button>
      </div>
    </div>
  );
}
