import { useCallback, useEffect, useRef, useState } from "react";
import { renderMotif } from "../engine/MotifSystem";
import { traceShape } from "../engine/systems/Shapes";
import { audioManager } from "../engine/audio/AudioManager";
import NeonBackdrop from "./NeonBackdrop";

const FIGHTER_BEAT_MS = 3600;
const REDUCED_MOTION_BEAT_MS = 1200;

function FighterDesign({ fighter }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !fighter) return;

    const ctx = canvas.getContext("2d");
    const center = canvas.width / 2;
    const radius = canvas.width * 0.28;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(center, center);
    ctx.strokeStyle = fighter.color;
    ctx.globalAlpha = 0.2;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 12]);
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.55, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 32;
    ctx.shadowColor = fighter.color;

    traceShape(ctx, radius, fighter.shape);
    const gradient = ctx.createRadialGradient(
      -radius * 0.2,
      -radius * 0.25,
      radius * 0.08,
      0,
      0,
      radius * 1.05
    );
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(0.18, fighter.color);
    gradient.addColorStop(0.72, fighter.color);
    gradient.addColorStop(1, "#02030a");
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.shadowBlur = 0;
    traceShape(ctx, radius, fighter.shape);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.82)";
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.shadowBlur = 12;
    ctx.shadowColor = "#02030a";
    ctx.scale(2.4, 2.4);
    renderMotif(ctx, center / 2.4, center / 2.4, fighter.name);
    ctx.restore();
  }, [fighter]);

  return (
    <canvas
      ref={canvasRef}
      width={420}
      height={420}
      className="battle-intro-design"
      aria-label={`${fighter.name} design`}
      role="img"
    />
  );
}

function twoSentenceSummary(fighter) {
  const ability = String(fighter.description || "").trim();
  const first = /[.!?]$/.test(ability) ? ability : `${ability}.`;
  return `${first} Its build pairs ${fighter.health} health with ${fighter.damageLabel ?? fighter.damage} damage and ${fighter.speed} speed.`;
}

export default function BattleIntro({ fighters, onComplete }) {
  const [index, setIndex] = useState(0);
  const completedRef = useRef(false);
  const fighter = fighters[index];

  const finish = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete();
  }, [onComplete]);

  const advance = () => {
    audioManager.playUiClick();
    if (index >= fighters.length - 1) finish();
    else setIndex(current => current + 1);
  };

  useEffect(() => {
    if (!fighter) {
      finish();
      return undefined;
    }

    const reducedMotion = Boolean(
      globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
    );
    const timer = window.setTimeout(() => {
      if (index >= fighters.length - 1) finish();
      else setIndex(current => current + 1);
    }, reducedMotion ? REDUCED_MOTION_BEAT_MS : FIGHTER_BEAT_MS);

    return () => window.clearTimeout(timer);
  }, [fighter, fighters.length, index, finish]);

  if (!fighter) return null;

  return (
    <main
      className="battle-intro-screen"
      style={{ "--class-accent": fighter.color }}
      aria-label="Fighter introductions"
    >
      <NeonBackdrop />
      <div className="battle-intro-scanlines" aria-hidden="true" />

      <div className="battle-intro-topline">
        <span>ROSTER BATTLE</span>
        <span>{String(index + 1).padStart(2, "0")} / {String(fighters.length).padStart(2, "0")}</span>
      </div>

      <section className="battle-intro-card" key={fighter.name}>
        <div className="battle-intro-copy">
          <div className="battle-intro-label">{fighter.attackType.toUpperCase()} CLASS</div>
          <h1>{fighter.name}</h1>
          <div className="battle-intro-rule" />
          <p>{twoSentenceSummary(fighter)}</p>
          <div className="battle-intro-stats" aria-label={`${fighter.name} stats`}>
            <span><small>HEALTH</small><b>{fighter.health}</b></span>
            <span><small>DAMAGE</small><b>{fighter.damageLabel ?? fighter.damage}</b></span>
            <span><small>SPEED</small><b>{fighter.speed}</b></span>
          </div>
        </div>

        <div className="battle-intro-art">
          <div className="battle-intro-art-halo" aria-hidden="true" />
          <FighterDesign fighter={fighter} />
          <span className="battle-intro-art-label">FIGHTER PROFILE</span>
        </div>
      </section>

      <div className="battle-intro-footer">
        <div className="battle-intro-progress" aria-label="Introduction progress">
          {fighters.map((entry, entryIndex) => (
            <span
              key={entry.name}
              className={entryIndex <= index ? "battle-intro-progress-active" : ""}
            />
          ))}
        </div>
        <div className="battle-intro-actions">
          <button type="button" className="battle-intro-skip" onClick={finish}>SKIP INTRO</button>
          <button type="button" className="battle-intro-next" onClick={advance}>
            {index === fighters.length - 1 ? "ENTER ARENA" : "NEXT FIGHTER"} <span>→</span>
          </button>
        </div>
      </div>
    </main>
  );
}
