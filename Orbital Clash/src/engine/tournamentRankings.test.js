import test from 'node:test';
import assert from 'node:assert/strict';
import { installTestAudio } from './audio/testAudioStub.js';
import '../testHarness.js';

installTestAudio();
const storage = new Map();
window.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key)
};

const {
  applyMatchResult, buildTournamentBracket, createTournamentBout, loadActiveTournament, loadTournamentHistory,
  nextPendingMatch, recordTournamentResult, runTournamentMatch, saveActiveTournament,
  tournamentRankings, tournamentRoster, validateTournament
} = await import('./tournament.js');
const { FighterFactory } = await import('./FighterFactory.js');
const { DamageSystem } = await import('./systems/DamageSystem.js');

function result(match, values = {}) {
  const durationSeconds = 10;
  return {
    winner: { name: match.first }, loser: { name: match.second }, durationSeconds,
    combatants: [match.first, match.second].map(name => ({
      name,
      tournamentStats: values[name] ?? {
        damageDealt: tournamentRoster().indexOf(name) + 1,
        survivalTime: durationSeconds,
        damageTaken: 1
      }
    }))
  };
}

function bracketWithOpeningTie(count = 2) {
  let tournament = buildTournamentBracket({ random: () => 0.5, timestamp: 999 });
  const tied = tournament.rounds.preliminary.matches.slice(0, count).map(match => match.second);
  while (nextPendingMatch(tournament)?.round !== 'placement' && tournament.status !== 'complete') {
    const match = nextPendingMatch(tournament);
    const values = Object.fromEntries(tied.map(name => [name, {
      damageDealt: 20.25, survivalTime: 10, damageTaken: 1
    }]));
    tournament = applyMatchResult(tournament, match, result(match, values)).tournament;
  }
  return { tournament, tied };
}

test('rankings compare only same-round losses in damage, survival, damage-taken order', () => {
  const stat = (name, damageDealt, survivalTime, damageTaken) => ({
    name, tournamentStats: { damageDealt, survivalTime, damageTaken }
  });
  const matches = [
    { id: 'q1', first: 'winner1', second: 'A', winner: 'winner1', loser: 'A', status: 'resolved' },
    { id: 'q2', first: 'winner2', second: 'B', winner: 'winner2', loser: 'B', status: 'resolved' },
    { id: 'q3', first: 'winner3', second: 'C', winner: 'winner3', loser: 'C', status: 'resolved' },
    { id: 'q4', first: 'winner4', second: 'D', winner: 'winner4', loser: 'D', status: 'resolved' },
    { id: 'r1', first: 'winner1', second: 'E', winner: 'winner1', loser: 'E', status: 'resolved' }
  ];
  const totals = [stat('A', 10, 5, 1), stat('B', 11, 1, 100),
    stat('C', 10, 6, 100), stat('D', 10, 5, 2), stat('E', 1000, 100, 0)];
  const tournament = {
    participants: ['champion', 'runner', 'A', 'B', 'C', 'D', 'E'],
    champion: 'champion', runnerUp: 'runner',
    rounds: { quarterfinal: { matches: matches.slice(0, 4) }, round16: { matches: matches.slice(4) } },
    matchResults: matches.map((match, index) => ({ id: match.id, combatants: [totals[index]] }))
  };
  const { standings, ties } = tournamentRankings(tournament);
  assert.deepEqual(standings.map(row => row.name), ['champion', 'runner', 'B', 'C', 'A', 'D', 'E']);
  assert.deepEqual(ties, []);
});

test('complete tournament accumulates all matches and awards each entrant a unique placement', () => {
  let tournament = buildTournamentBracket({ random: () => 0.5, timestamp: 998 });
  while (nextPendingMatch(tournament)) {
    const match = nextPendingMatch(tournament);
    tournament = applyMatchResult(tournament, match, result(match)).tournament;
  }
  const { standings, ties } = tournamentRankings(tournament);
  assert.equal(tournament.status, 'complete');
  assert.equal(standings.length, 32);
  assert.deepEqual(standings.map(row => row.placement), Array.from({ length: 32 }, (_, i) => i + 1));
  assert.equal(new Set(standings.map(row => row.name)).size, 32);
  assert.equal(standings[0].name, tournament.champion);
  assert.equal(standings[1].name, tournament.runnerUp);
  assert.equal(standings[0].survivalTime, 50);
  assert.equal(standings[0].damageDealt, 5 * (tournamentRoster().indexOf(tournament.champion) + 1));
  assert.ok(standings.slice(2, 4).every(row => tournament.rounds.semifinal.matches.some(match => match.loser === row.name)));
  assert.ok(standings.slice(4, 8).every(row => tournament.rounds.quarterfinal.matches.some(match => match.loser === row.name)));
  assert.ok(standings.slice(8, 16).every(row => tournament.rounds.round16.matches.some(match => match.loser === row.name)));
  assert.ok(standings.slice(16).every(row => tournament.rounds.preliminary.matches.some(match => match.loser === row.name)));
  assert.deepEqual(ties, []);
  assert.deepEqual(validateTournament(tournament, { requireComplete: true }), []);
  storage.clear();
  recordTournamentResult(tournament);
  assert.deepEqual(loadTournamentHistory()[0].standings, standings);
});

test('ties schedule a real placement bout, survive reload and rerank using its totals', () => {
  storage.clear();
  let { tournament, tied } = bracketWithOpeningTie();
  assert.equal(tournament.status, 'active');
  let match = nextPendingMatch(tournament);
  assert.equal(match.round, 'placement');
  assert.deepEqual(new Set([match.first, match.second]), new Set(tied));
  saveActiveTournament(tournament);
  tournament = loadActiveTournament();
  match = nextPendingMatch(tournament);
  assert.equal(match.round, 'placement');
  const outcome = result(match, {
    [match.first]: { damageDealt: 0, survivalTime: 10, damageTaken: 1 },
    [match.second]: { damageDealt: 5, survivalTime: 10, damageTaken: 1 }
  });
  const applied = applyMatchResult(tournament, match, outcome);
  tournament = applied.tournament;
  assert.equal(applyMatchResult(tournament, match, outcome).applied, false);
  assert.equal(tournament.status, 'complete');
  const { standings, ties } = tournamentRankings(tournament);
  const winner = standings.find(row => row.name === match.first);
  const loser = standings.find(row => row.name === match.second);
  assert.ok(loser.placement < winner.placement, 'updated damage overrides the bout winner');
  const overtaken = standings.find(row => row.damageDealt > 20.25 && row.damageDealt < 25.25
    && tournament.rounds.preliminary.matches.some(opening => opening.loser === row.name));
  assert.ok(overtaken && loser.placement < overtaken.placement, 'the entire elimination group is reranked');
  assert.equal(loser.damageDealt, 25.25);
  assert.equal(loser.survivalTime, 20);
  assert.equal(loser.damageTaken, 2);
  assert.deepEqual(ties, []);
});

test('the third-place match contributes stats but its winner is not automatically third', () => {
  const { tournament } = bracketWithOpeningTie();
  const third = tournament.rounds.thirdplace.matches[0];
  const record = tournament.matchResults.find(item => item.id === third.id);
  const losingSemifinalist = record.combatants.find(item => item.name === third.loser);
  losingSemifinalist.tournamentStats.damageDealt = 10000;
  const standings = tournamentRankings(tournament).standings;
  assert.equal(standings[2].name, third.loser);
  assert.equal(standings[3].name, third.winner);
});

test('three identical totals are resolved by tiebreak winners when match totals remain tied', () => {
  storage.clear();
  let { tournament, tied } = bracketWithOpeningTie(3);
  let bouts = 0;
  while (tournament.status !== 'complete') {
    const match = nextPendingMatch(tournament);
    assert.equal(match.round, 'placement');
    const outcome = result(match, Object.fromEntries(tied.map(name => [name, {
      damageDealt: 0, survivalTime: 0, damageTaken: 0
    }])));
    outcome.durationSeconds = 0;
    tournament = applyMatchResult(tournament, match, outcome).tournament;
    bouts++;
    assert.ok(bouts <= 3, 'tied bouts must not repeat forever');
    if (tournament.status !== 'complete') {
      saveActiveTournament(tournament);
      tournament = loadActiveTournament();
    }
  }
  const { standings, ties } = tournamentRankings(tournament);
  assert.deepEqual(ties, []);
  for (const match of tournament.placementTiebreaks) {
    assert.ok(standings.find(row => row.name === match.winner).placement
      < standings.find(row => row.name === match.loser).placement);
  }
  assert.ok(bouts >= 2);
});

test('missing older records are marked approximate, not represented as exact totals', () => {
  let tournament = buildTournamentBracket({ random: () => 0.5 });
  const match = nextPendingMatch(tournament);
  tournament = applyMatchResult(tournament, match, { winner: { name: match.first },
    loser: { name: match.second }, durationSeconds: 10 }).tournament;
  tournament.champion = match.first;
  tournament.runnerUp = match.second;
  const rows = tournamentRankings(tournament).standings;
  assert.ok(rows.find(row => row.name === match.first).approximate);
  assert.ok(rows.find(row => row.name === match.second).approximate);
});

test('actual bout snapshots retain precise damage and the winner’s survival time', () => {
  const [first, second] = tournamentRoster();
  const bout = runTournamentMatch(first, second);
  assert.equal(bout.error, null);
  const winner = bout.combatants.find(item => item.name === bout.winner.name);
  assert.equal(winner.tournamentStats.survivalTime, bout.durationSeconds);
  for (const fighter of bout.fighterInstances) {
    const snapshot = bout.combatants.find(item => item.name === fighter.name);
    assert.equal(snapshot.tournamentStats.damageDealt, fighter.tournamentDamageDealt);
    assert.equal(snapshot.tournamentStats.damageTaken, fighter.totalDamageTaken);
  }
});

test('summon and clone damage is credited to the tournament entrant without changing normal stats', () => {
  const bout = createTournamentBout('Summoner', 'Gunner');
  const [summoner, opponent] = bout.fighters;
  const summon = FighterFactory.createFighter('Duplicator', 300, 300);
  summon.owner = summoner;
  summon.particleSystem = bout.particles;
  summon.spawnClone();
  const clone = summon.clones[0];
  assert.ok(DamageSystem.applyDamage(summon, opponent, 2, 'Body', { ignoreCooldown: true }));
  assert.ok(DamageSystem.applyDamage(clone, opponent, 3, 'Body', { ignoreCooldown: true }));
  assert.equal(summoner.tournamentDamageDealt, 5);
  assert.equal(summoner.totalDamageDealt, 0);
  bout.destroy();
});
