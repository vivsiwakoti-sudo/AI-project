import { useEffect } from "react";
import { FIGHTER_CLASSES } from "../engine/fighterDefinitions";

function classColor(name) {
  return FIGHTER_CLASSES[name]?.color || "#8fa6bd";
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "—";
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function FighterColumn({ combatant }) {
  const { name, isWinner, stats } = combatant;
  const color = classColor(name);
  const healthPercent = stats && stats.maxHealth > 0 ? Math.min(100, (stats.health / stats.maxHealth) * 100) : 0;
  return (
    <div className={`match-details-fighter ${isWinner ? "match-details-fighter-winner" : ""}`} style={{ "--fighter-color": color }}>
      <div className="match-details-fighter-head">
        <b style={{ color }}>{name}</b>
        <span>{isWinner ? "WINNER" : "ELIMINATED"}</span>
      </div>
      {stats ? (
        <>
          <div className="match-details-hp">
            <div className="match-details-hp-label"><span>FINAL HP</span><b>{stats.health} / {stats.maxHealth}</b></div>
            <div className="match-details-hp-track"><i style={{ width: `${healthPercent}%` }} /></div>
          </div>
          <dl className="match-details-rows">
            <div><dt>DAMAGE DEALT</dt><dd>{stats.damageDealt}</dd></div>
            <div><dt>DAMAGE TAKEN</dt><dd>{stats.damageTaken}</dd></div>
            <div><dt>KILLS</dt><dd>{stats.kills}</dd></div>
            {!isWinner && <div><dt>ELIMINATED AT</dt><dd>{formatTime(stats.survivalTime)}</dd></div>}
          </dl>
        </>
      ) : (
        <p className="match-details-missing">No stats were recorded for this fighter.</p>
      )}
    </div>
  );
}

// The details of one decided match, opened by right-clicking it in the bracket.
// `details` is the engine's `matchDetails(...)` result, so this only formats what
// the tournament actually recorded.
export default function MatchDetails({ details, onClose }) {
  useEffect(() => {
    const onKey = event => { if (event.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!details) return null;

  const totalDamage = details.hasStats
    ? details.combatants.reduce((sum, item) => sum + item.stats.damageDealt, 0)
    : null;

  return (
    <div className="match-details-overlay" onClick={onClose} onContextMenu={event => { event.preventDefault(); onClose?.(); }}>
      <div
        className="match-details"
        role="dialog"
        aria-label={`${details.winner} defeated ${details.loser}`}
        onClick={event => event.stopPropagation()}
        onContextMenu={event => event.stopPropagation()}
      >
        <header className="match-details-head">
          <span>{details.roundLabel} · {details.id.toUpperCase()}</span>
          <button type="button" className="match-details-close" onClick={onClose} aria-label="Close match details" autoFocus>✕</button>
        </header>

        <h3 className="match-details-title">
          <b style={{ color: classColor(details.winner) }}>{details.winner}</b>
          <em>def.</em>
          <span style={{ color: classColor(details.loser) }}>{details.loser}</span>
        </h3>

        <div className="match-details-summary">
          <div><span>LENGTH</span><b>{formatTime(details.durationSeconds)}</b></div>
          <div><span>TOTAL DAMAGE</span><b>{totalDamage ?? "—"}</b></div>
          <div><span>DECIDED BY</span><b>{details.resolvedBy === "draw" ? "TIEBREAK" : "KNOCKOUT"}</b></div>
        </div>

        {details.resolvedBy === "draw" && (
          <p className="match-details-note">Both fighters fell together, so the winner was decided by damage dealt, then health.</p>
        )}

        <div className="match-details-fighters">
          {details.combatants.map(combatant => <FighterColumn key={combatant.name} combatant={combatant} />)}
        </div>

        {!details.hasStats && (
          <p className="match-details-note">This match was saved before detailed stats were recorded.</p>
        )}
      </div>
    </div>
  );
}
