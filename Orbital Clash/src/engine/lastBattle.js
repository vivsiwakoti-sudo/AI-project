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

// The saved clip is the most recent regular battle's footage. It belongs to a
// fighter only when they were in that battle and it is still their latest bout;
// a later tournament match has no clip, so nothing is shown for it.
export function clipForFighter(name, replayMeta, battles = [], tournaments = []) {
  if (!replayMeta?.fighters?.some(f => f.name === name)) return null;
  return lastBattleFor(name, battles, tournaments)?.kind === "battle" ? replayMeta : null;
}

function latestBattle(name, battles) {
  for (const entry of battles) {
    const self = entry.participants.find(p => p.name === name);
    if (!self) continue;
    // A no-contest has no sides, so every other fighter is an opponent.
    const others = entry.participants.filter(p => p !== self);
    return {
      kind: "battle",
      at: entry.timestamp ?? 0,
      allies: entry.aborted ? [] : others.filter(p => p.won === self.won).map(p => p.name),
      rivals: entry.aborted ? others.map(p => p.name) : others.filter(p => p.won !== self.won).map(p => p.name),
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
      allies: [],
      rivals: [match.first === name ? match.second : match.first],
      round: ROUND_LABELS[match.round] ?? match.round,
      durationSeconds: match.durationSeconds
    };
  }
  return null;
}
