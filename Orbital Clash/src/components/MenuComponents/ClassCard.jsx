import { useRef, useEffect } from "react";
import { renderMotif } from "../../engine/MotifSystem";

export default function ClassCard({ fighter, isSelected, onClick, onContextMenu, stats }) {
  const canvasRef = useRef(null);

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
      className={`fighter-card ${isSelected ? "fighter-card-selected" : ""}`}
    >
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
      <div className="fighter-card-ability">◆ {fighter.description.split(".")[0]}</div>
    </div>
  );
}
