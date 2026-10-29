import { useEffect, useMemo, useState } from "react";
import { audioManager } from "../engine/audio/AudioManager";
import { FIGHTER_CLASSES } from "../engine/fighterDefinitions";
import { ROUND_LABELS, TOTAL_MATCHES, allMatches, matchDetails } from "../engine/tournament";
import TournamentBracket from "./TournamentBracket";
import MatchDetails from "./MatchDetails";
import FighterCanvas from "./MenuComponents/ClassCard";

function classColor(name) {
  return FIGHTER_CLASSES[name]?.color || "#8fa6bd";
}

// The champion's route: only the matches it actually fought, in order. Byes are
// shown as byes rather than as wins, so "path" means what it says.
function championPath(tournament, champion) {
  if (!champion) return [];
  const byes = (tournament.byes || []).map(b => b.name);
  const path = [];
  if (byes.includes(champion)) path.push({ kind: "bye", label: "BYE", detail: "Round of 16" });
  for (const match of allMatches(tournament)) {
    if (match.status !== "resolved") continue;
    if (match.winner !== champion && match.loser !== champion) continue;
    path.push({
      kind: "match",
      label: ROUND_LABELS[match.round] ?? match.round,
      detail: `${match.winner} def. ${match.loser}`,
      opponent: match.winner === champion ? match.loser : match.winner,
      won: match.winner === champion,
      duration: match.durationSeconds
    });
  }
  return path;
}

// Head-to-head summary across the whole tournament, read straight from the
// engine's own headToHead table so the screen cannot disagree with the bracket.
//
// The engine stores head-to-head as a nested map in the STATS document:
//   stats.headToHead[from][to] = { matches, firstWins, secondWins }
// so the champion's row for each opponent is read directly, and the opponent's
// row is read only to count how many of the pairings that opponent won. Nothing
// is recomputed from the bracket: this reads the engine's own record.
function headToHeadLines(stats, champion) {
  const table = stats?.headToHead?.[champion];
  if (!champion || !table || typeof table !== "object") return [];
  const lines = [];
  for (const [opponent, record] of Object.entries(table)) {
    // `__tournaments` is the engine's internal guard marker, not a pairing.
    if (opponent === "__tournaments" || !record || typeof record !== "object") continue;
    const played = Math.max(0, Math.floor(Number(record.matches) || 0));
    if (played === 0) continue;
    const champWins = Math.max(0, Math.floor(Number(record.firstWins) || 0));
    const oppWins = Math.max(0, Math.floor(Number(record.secondWins) || 0));
    lines.push({ opponent, champWins, oppWins, played });
  }
  return lines.sort((x, y) => y.played - x.played);
}

export default function ChampionScreen({ tournament, stats, onNewTournament, onMainMenu }) {
  const [revealed, setRevealed] = useState(false);
  const [inspectedMatchId, setInspectedMatchId] = useState(null);

  useEffect(() => {
    audioManager.playVictorySound();
    const timer = setTimeout(() => setRevealed(true), 80);
    return () => clearTimeout(timer);
  }, []);

  const champion = tournament?.champion;
  const runnerUp = tournament?.runnerUp;
  const finalMatch = useMemo(
    () => allMatches(tournament).find(m => m.round === "final"),
    [tournament]
  );
  const path = useMemo(() => championPath(tournament, champion), [tournament, champion]);
  const h2h = useMemo(() => headToHeadLines(stats, champion), [stats, champion]);
  const record = stats?.classes?.[champion];
  const inspected = useMemo(
    () => (inspectedMatchId ? matchDetails(tournament, inspectedMatchId) : null),
    [tournament, inspectedMatchId]
  );

  if (!tournament || !champion) return null;

  return (
    <main className="champion-screen">
      <div className={`champion-hero ${revealed ? "champion-hero-in" : ""}`}>
        <div className="champion-rays" aria-hidden="true" />
        <div className="champion-crown" aria-hidden="true">🏆</div>
        <div className="champion-card-slot">
          <FighterCanvas fighter={FIGHTER_CLASSES[champion]} />
        </div>
        <p className="champion-eyebrow">TOURNAMENT CHAMPION</p>
        <h1 className="champion-name" style={{ color: classColor(champion) }}>{champion}</h1>
        {runnerUp ? (
          <p className="champion-runner-up">
            Defeated <b style={{ color: classColor(runnerUp) }}>{runnerUp}</b> in the Grand Final
          </p>
        ) : null}
        <div className="champion-final-stats">
          <div><span>FINAL DURATION</span><b>{finalMatch && Number.isFinite(finalMatch.durationSeconds) ? `${Math.round(finalMatch.durationSeconds)}s` : "—"}</b></div>
          <div><span>MATCHES PLAYED</span><b>{path.filter(p => p.kind === "match").length}</b></div>
          <div><span>TOURNAMENT RECORD</span><b>{record ? `${record.wins}-${record.losses}` : "—"}</b></div>
          <div><span>TOTAL MATCHES</span><b>{TOTAL_MATCHES}</b></div>
        </div>
      </div>

      <section className="champion-path">
        <h2>CHAMPION&apos;S PATH</h2>
        <ol className="champion-path-list">
          {path.map((step, i) => (
            <li key={`${step.kind}-${i}`} className={`champion-path-step ${step.won === false ? "champion-path-loss" : ""}`}>
              <span className="champion-path-round">{step.label}</span>
              <span className="champion-path-detail">{step.detail}</span>
              {Number.isFinite(step.duration) ? <span className="champion-path-time">{Math.round(step.duration)}s</span> : null}
            </li>
          ))}
        </ol>
      </section>

      {h2h.length > 0 && (
        <section className="champion-h2h">
          <h2>TOURNAMENT HEAD-TO-HEAD</h2>
          <ul className="champion-h2h-list">
            {h2h.map(line => (
              <li key={line.opponent}>
                <span style={{ color: classColor(line.opponent) }}>{line.opponent}</span>
                <b>{line.champWins}–{line.oppWins}</b>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="champion-bracket-section">
        <h2>FULL BRACKET · {TOTAL_MATCHES} MATCHES</h2>
        <p className="champion-bracket-hint">Right-click any match for its details</p>
        <TournamentBracket
          tournament={tournament}
          currentMatchId={null}
          onSelectFighter={() => { }}
          onInspectMatch={matchId => { audioManager.playUiClick(); setInspectedMatchId(matchId); }}
        />
      </section>

      <section className="champion-matches">
        <h2>ALL MATCH RESULTS</h2>
        <div className="champion-matches-list">
          {allMatches(tournament).map(match => (
            <div key={match.id} className="champion-match-row">
              <span className="champion-match-round">{ROUND_LABELS[match.round] ?? match.round}</span>
              <span className="champion-match-id">{match.id}</span>
              <span className="champion-match-fight">
                <b style={{ color: classColor(match.winner) }}>{match.winner}</b>
                <em>def.</em>
                <span style={{ color: classColor(match.loser) }}>{match.loser}</span>
              </span>
              <span className="champion-match-time">{Number.isFinite(match.durationSeconds) ? `${Math.round(match.durationSeconds)}s` : "—"}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="champion-actions">
        <button className="tournament-control champion-action-primary" onClick={() => { audioManager.playUiClick(); onNewTournament?.(); }}>
          🏆 NEW TOURNAMENT
        </button>
        <button className="tournament-control" onClick={() => { audioManager.playUiClick(); onMainMenu?.(); }}>
          ← MAIN MENU
        </button>
      </div>

      {inspected && <MatchDetails details={inspected} onClose={() => setInspectedMatchId(null)} />}
    </main>
  );
}
