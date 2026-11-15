const ELIMINATION_ROUNDS = ["semifinal", "quarterfinal", "round16", "preliminary"];

function compareStats(a, b) {
  return b.damageDealt - a.damageDealt
    || b.survivalTime - a.survivalTime
    || a.damageTaken - b.damageTaken;
}

// Match records are tournament-local; career statistics are never consulted.
export function tournamentRankings(tournament) {
  const totals = new Map((tournament.participants || []).map(name => [name, {
    name, damageDealt: 0, survivalTime: 0, damageTaken: 0, approximate: false
  }]));
  const records = new Map((tournament.matchResults || []).map(record => [record.id, record]));
  const matches = Object.values(tournament.rounds || {}).flatMap(round => round.matches || [])
    .filter(match => match.status === "resolved");
  const tiebreaks = (tournament.placementTiebreaks || []).filter(match => match.status === "resolved");

  for (const match of [...matches, ...tiebreaks]) {
    const record = match.round === "placement" ? match : records.get(match.id);
    for (const name of [match.first, match.second]) {
      const total = totals.get(name);
      if (!total) continue;
      const snapshot = record?.combatants?.find(item => item.name === name);
      const exact = snapshot?.tournamentStats;
      if (exact && ["damageDealt", "survivalTime", "damageTaken"]
        .every(key => Number.isFinite(exact[key]) && exact[key] >= 0)) {
        total.damageDealt += exact.damageDealt;
        total.survivalTime += exact.survivalTime;
        total.damageTaken += exact.damageTaken;
      } else {
        total.approximate = true;
        if (!snapshot) continue;
        if (Number.isFinite(snapshot.damageDealt)) total.damageDealt += Math.max(0, snapshot.damageDealt);
        if (Number.isFinite(snapshot.damageTaken)) total.damageTaken += Math.max(0, snapshot.damageTaken);
        const survived = snapshot.survivalTime || (name === match.winner ? match.durationSeconds : 0);
        if (Number.isFinite(survived)) total.survivalTime += Math.max(0, survived);
      }
    }
  }

  const rows = [];
  const ties = [];
  function tieDecision(a, b) {
    const match = [...tiebreaks].reverse().find(item =>
      item.tieDecision && [item.first, item.second].includes(a.name)
      && [item.first, item.second].includes(b.name)
      && compareStats(a, item.tieDecision) === 0);
    return match ? (match.winner === a.name ? -1 : 1) : 0;
  }
  for (const name of [tournament.champion, tournament.runnerUp]) {
    if (totals.has(name)) rows.push(totals.get(name));
  }
  for (const round of ELIMINATION_ROUNDS) {
    const group = (tournament.rounds?.[round]?.matches || [])
      .filter(match => match.status === "resolved" && totals.has(match.loser))
      .map(match => totals.get(match.loser))
      .sort((a, b) => compareStats(a, b) || tieDecision(a, b));
    for (let i = 1; i < group.length; i++) {
      if (compareStats(group[i - 1], group[i]) === 0 && !tieDecision(group[i - 1], group[i])) {
        ties.push({ round, first: group[i - 1].name, second: group[i].name });
      }
    }
    rows.push(...group);
  }
  return {
    standings: rows.map((row, index) => ({ ...row, placement: index + 1 })),
    ties
  };
}
