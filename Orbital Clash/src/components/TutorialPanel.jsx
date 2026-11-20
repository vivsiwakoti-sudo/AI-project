import { useEffect, useState } from "react";
import { MAX_FIGHTERS, MIN_FIGHTERS } from "../engine/config";

const STEPS = [
  {
    title: "THE GOAL",
    body: `Pick ${MIN_FIGHTERS} to ${MAX_FIGHTERS} fighters and start a battle. Fighters fight on their own until only one is left standing.`,
  },
  {
    title: "HEALTH AND DAMAGE",
    body: "Each fighter has a health bar. Attacks and abilities wear it down, and a fighter is knocked out when it reaches zero. Fighters that collide with each other also take touch damage.",
  },
  {
    title: "ABILITIES",
    body: "Every class has its own ability on a cooldown. It fires automatically whenever it is ready. Right-click a fighter in the roster to read its full kit.",
  },
  {
    title: "STATUS EFFECTS",
    body: "Status icons appear above fighters. Freeze and stun stop a fighter from acting for a short time, burn wears health down over time, and slow cuts movement speed.",
  },
  {
    title: "THE CLOCK",
    body: "A battle lasts 5:00. When the clock reaches 0:00, sudden death begins and damage ticks every second, so no fight can stall forever.",
  },
  {
    title: "IN THE ARENA",
    body: "Pause freezes the fight. The 1x, 2x and 3x buttons change combat speed. Map size is chosen in the roster before the battle starts.",
  },
  {
    title: "BEFORE YOU FIGHT",
    body: "Predict the winner before each battle to build your record. Press R for a random roster and Enter to start a battle once it is ready. Tournament mode runs every class through a single-elimination bracket.",
  },
];

export default function TutorialPanel({ onClose }) {
  const [index, setIndex] = useState(0);
  const last = STEPS.length - 1;

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowRight") setIndex(i => Math.min(i + 1, last));
      else if (event.key === "ArrowLeft") setIndex(i => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, last]);

  const step = STEPS[index];

  return (
    <div className="fighter-info-overlay" role="dialog" aria-label="How to play">
      <div className="battle-history-panel tutorial-panel">
        <header>
          <div>
            <div className="roster-eyebrow">HOW TO PLAY • {index + 1} / {STEPS.length}</div>
            <h2>{step.title}</h2>
          </div>
          <button className="fighter-info-close" onClick={onClose} aria-label="Close tutorial">×</button>
        </header>

        <p className="tutorial-body">{step.body}</p>

        <div className="tutorial-nav">
          <button type="button" onClick={() => setIndex(i => Math.max(i - 1, 0))} disabled={index === 0}>BACK</button>
          <div className="tutorial-dots" aria-hidden="true">
            {STEPS.map((s, i) => <span key={s.title} className={i === index ? "tutorial-dot tutorial-dot-active" : "tutorial-dot"} />)}
          </div>
          {index < last ? (
            <button type="button" className="tutorial-next" onClick={() => setIndex(i => Math.min(i + 1, last))}>NEXT</button>
          ) : (
            <button type="button" className="tutorial-next" onClick={onClose}>DONE</button>
          )}
        </div>
      </div>
    </div>
  );
}
