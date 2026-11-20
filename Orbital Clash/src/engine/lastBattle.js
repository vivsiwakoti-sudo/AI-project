import { ROUND_LABELS } from "./tournament.js";

// The most recent bout a fighter took part in, across regular battles and
// tournament matches. Both logs are stored newest-first, so the first hit in each
// is that log's latest bout; the timestamps decide which of the two is newer.
export function lastBattleFor(name, battles = [], tournaments = []) {
  const fromBattle = latestBattle(name, battles);
  const fromTournament = latestTournamentMatch(name, tournaments);
  if (!fromBattle) return fromTournament;
  if (!fromTournament) return fromBattle;
  return fromTournament.at > fromBattle.at ? fromTournament : fromBattle;
}

function latestBattle(name, battles) {
  for (const entry of battles) {
    const self = entry.participants.find(p => p.name === name);
    if (!self) continue;
    return {
      kind: "battle",
      at: entry.timestamp ?? 0,
      outcome: entry.aborted ? "no-contest" : self.won ? "win" : "loss",
      // Everyone on the other side of the result. In a team battle this skips
      // teammates; in a free-for-all a loss is answered by the winner alone.
      rivals: entry.aborted ? [] : entry.participants.filter(p => p.won !== self.won).map(p => p.name),
      placement: self.placement,
      durationSeconds: entry.durationSeconds
    };
  }
  return null;
}

function latestTournamentMatch(name, tournaments) {
  for (const tournament of tournaments) {
    // Matches are stored in play order, so the last one is the fighter's latest.
    const match = [...(tournament.matches || [])]
      .reverse()
      .find(m => m.first === name || m.second === name);
    if (!match) continue;
    return {
      kind: "tournament",
      at: tournament.completedAt ?? 0,
      outcome: match.winner === name ? "win" : "loss",
      rivals: [match.first === name ? match.second : match.first],
      round: ROUND_LABELS[match.round] ?? match.round,
      durationSeconds: match.durationSeconds
    };
  }
  return null;
}
