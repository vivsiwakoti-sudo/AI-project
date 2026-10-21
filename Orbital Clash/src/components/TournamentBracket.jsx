import { FIGHTER_CLASSES } from "../engine/fighterDefinitions";
import { ROUND_DEFINITIONS, ROUND_ORDER, TOURNAMENT_SIZE, BYE_COUNT } from "../engine/tournament";

// Colour lookup so a bracket slot reads the same as the class card it came from.
function classColor(name) {
  return FIGHTER_CLASSES[name]?.color || "#8fa6bd";
}

// One bracket slot: the class, its colour chip, and its state. A slot is one of
// "upcoming", "current", "winner", "eliminated" or "bye" - never a mix - so the
// styling stays predictable and a screen reader hears one clear state.
function Slot({ name, state, isWinner, isLoser, isChampion, onClick }) {
  if (!name) {
    return <div className="tb-slot tb-slot-empty"><span className="tb-slot-name">—</span></div>;
  }
  const classes = [
    "tb-slot",
    `tb-slot-${state}`,
    isWinner ? "tb-slot-winner" : "",
    isLoser ? "tb-slot-loser" : "",
    isChampion ? "tb-slot-champion" : ""
  ].filter(Boolean).join(" ");
  return (
    <button
      type="button"
      className={classes}
      style={{ "--slot-color": classColor(name) }}
      onClick={onClick}
      title={name}
    >
      <span className="tb-slot-chip" aria-hidden="true" />
      <span className="tb-slot-name">{name}</span>
      {isChampion ? <span className="tb-slot-crown" aria-hidden="true">🏆</span> : null}
      {isWinner && !isChampion ? <span className="tb-slot-mark" aria-hidden="true">✓</span> : null}
      {isLoser ? <span className="tb-slot-mark tb-slot-mark-out" aria-hidden="true">✕</span> : null}
    </button>
  );
}

// A single match card. `match` is the engine's own match object, so this view
// never invents state - it only renders what the bracket already decided.
function MatchCard({ match, currentMatchId, champion, onSelectFighter }) {
  const isCurrent = match.id === currentMatchId && match.status !== "resolved";
  const resolved = match.status === "resolved";
  const errored = match.status === "error";
  const state = resolved ? "done" : isCurrent ? "current" : errored ? "error" : "upcoming";

  const slotState = (name) => {
    if (champion && champion === name) return "champion";
    if (resolved) return match.winner === name ? "winner" : "eliminated";
    return isCurrent ? "current" : "upcoming";
  };

  return (
    <article className={`tb-match tb-match-${state}`} data-match-id={match.id}>
      <header className="tb-match-head">
        <span className="tb-match-id">{match.id.toUpperCase()}</span>
        {resolved && Number.isFinite(match.durationSeconds)
          ? <span className="tb-match-duration">{Math.round(match.durationSeconds)}s</span>
          : null}
        {isCurrent ? <span className="tb-match-live">● LIVE</span> : null}
        {errored ? <span className="tb-match-error">! INVALID</span> : null}
      </header>
      <div className="tb-match-body">
        <Slot
          name={match.first}
          state={slotState(match.first)}
          isWinner={resolved && match.winner === match.first}
          isLoser={resolved && match.loser === match.first}
          isChampion={Boolean(champion && champion === match.first)}
          onClick={() => onSelectFighter?.(match.first)}
        />
        <div className="tb-match-vs" aria-hidden="true">VS</div>
        <Slot
          name={match.second}
          state={slotState(match.second)}
          isWinner={resolved && match.winner === match.second}
          isLoser={resolved && match.loser === match.second}
          isChampion={Boolean(champion && champion === match.second)}
          onClick={() => onSelectFighter?.(match.second)}
        />
      </div>
      {resolved ? (
        <footer className="tb-match-foot">
          <span className="tb-match-winner-label">WINNER</span>
          <span className="tb-match-winner" style={{ color: classColor(match.winner) }}>{match.winner}</span>
        </footer>
      ) : null}
    </article>
  );
}

// The full single-elimination bracket: byes first, then every round in order.
// It renders whichever rounds the engine has created so far, so an in-progress
// tournament shows real matches and later rounds simply do not exist yet.
export default function TournamentBracket({ tournament, currentMatchId, onSelectFighter, compact = false }) {
  if (!tournament) return null;

  const byes = tournament.byes || [];
  const champion = tournament.champion;

  return (
    <div className={`tournament-bracket ${compact ? "tournament-bracket-compact" : ""}`}>
      <div className="tb-bye-strip">
        <div className="tb-bye-label">
          <span>BYES INTO ROUND OF 16</span>
          <strong>{byes.length} / {BYE_COUNT}</strong>
        </div>
        <div className="tb-bye-list">
          {byes.map(bye => (
            <span key={bye.name} className="tb-bye-chip" style={{ "--slot-color": classColor(bye.name) }}>
              <span className="tb-slot-chip" aria-hidden="true" />
              {bye.name}
            </span>
          ))}
        </div>
      </div>

      <div className="tb-rounds">
        {ROUND_ORDER.map(roundKey => {
          const round = tournament.rounds?.[roundKey];
          const definition = ROUND_DEFINITIONS.find(item => item.key === roundKey);
          const matches = round?.matches || [];
          const done = matches.filter(match => match.status === "resolved").length;
          return (
            <section key={roundKey} className="tb-round" data-round={roundKey}>
              <header className="tb-round-head">
                <h3>{definition?.label || roundKey}</h3>
                <span className="tb-round-count">
                  {matches.length > 0
                    ? `${done}/${matches.length} PLAYED`
                    : `${definition?.matches ?? 0} MATCHES`}
                </span>
              </header>
              <div className="tb-round-matches">
                {matches.length > 0 ? (
                  matches.map(match => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      currentMatchId={currentMatchId}
                      champion={champion}
                      onSelectFighter={onSelectFighter}
                    />
                  ))
                ) : (
                  <div className="tb-round-pending">
                    {roundKey === "round16"
                      ? "9 preliminary winners + 7 byes"
                      : "Awaiting previous round"}
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <div className="tb-entrant-count">
        <span>{TOURNAMENT_SIZE} classes entered</span>
        <span>{byes.length} byes</span>
        <span>{tournament.eliminated?.length || 0} eliminated</span>
      </div>
    </div>
  );
}
