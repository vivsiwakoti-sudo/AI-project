import { useRef, useEffect } from "react";
import { renderMotif } from "../../engine/MotifSystem";

// A standalone motif canvas. ClassCard renders its own inline canvas, but the
// tournament screens (bracket, live arena, champion screen) need the same motif
// without the whole card, so this is exported as its own component. It is the
// ONLY definition of how a fighter's emblem is drawn outside ClassCard, so the
// motif on the champion screen is identical to the one on the roster card.
//
// `fighter` is a FIGHTER_CLASSES entry (needs `.name`); a missing entry renders
// nothing rather than throwing, so a malformed bracket cannot crash the screen.
export function FighterCanvas({ fighter, size = 50, className = "" }) {
  const canvasRef = useRef(null);
  const name = fighter?.name;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, size, size);
    if (!name) return;
    // The motif set is authored for a 50px canvas; scaling the context keeps the
    // stroke weights proportional on the larger tournament surfaces.
    ctx.save();
    const scale = size / 50;
    ctx.scale(scale, scale);
    renderMotif(ctx, 25, 25, name);
    ctx.restore();
  }, [name, size]);

  return <canvas ref={canvasRef} width={size} height={size} className={className} aria-hidden="true" />;
}

export default function ClassCard({ fighter, isSelected, isChampion = false, onClick, onContextMenu, stats }) {
  const canvasRef = useRef(null);
  // Defensive by design: the roster card is rendered from data that can come from
  // storage, so a missing entry must render as a plain card rather than throw and
  // take the whole screen with it.
  if (!fighter) return null;

  useEffect(() => {
    const ctx = canvasRef.current.getContext("2d");
    ctx.clearRect(0, 0, 50, 50);
    renderMotif(ctx, 25, 25, fighter.name);
  }, [fighter.name]);

  const cardStyle = {
    "--class-accent": fighter.color,
    color: fighter.color
  };

  return (
    <div
      style={cardStyle}
      onClick={onClick}
      onContextMenu={onContextMenu}
      title="Right-click for details"
      className={`fighter-card ${isSelected ? "fighter-card-selected" : ""} ${isChampion ? "fighter-card-champion" : ""}`}
    >
      {isChampion && <span className="champion-badge" title="Winner of the last tournament">👑 CHAMPION</span>}
      <canvas ref={canvasRef} width={50} height={50} />
      <div className="fighter-card-copy"><h3>{fighter.name}</h3><strong>{fighter.attackType}</strong></div>
      <div className="fighter-card-stats">
        <span>HP <b>{fighter.health}</b></span><span>DMG <b>{fighter.damage}</b></span><span>SPD <b>{fighter.speed} px/f</b></span>
      </div>
      {stats && <div className="fighter-card-record">
        <span><small>W</small><b>{stats.wins}</b></span>
        <span><small>L</small><b>{stats.losses}</b></span>
        <span><small>K</small><b>{stats.kills || 0}</b></span>
        <span><small>APP</small><b>{stats.appearances}</b></span>
        <span><small>WIN</small><b>{stats.appearances ? `${(stats.winRate * 100).toFixed(0)}%` : "--"}</b></span>
      </div>}
      <div className="fighter-card-ability">◆ {String(fighter.description || "").split(".")[0]}</div>
    </div>
  );
}
