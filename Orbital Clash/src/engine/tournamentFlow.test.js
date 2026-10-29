import test from 'node:test';
import assert from 'node:assert/strict';

// Same minimal audio stub the other headless engine tests use.
const param = () => ({ value: 0, setValueAtTime() { }, setTargetAtTime() { }, cancelScheduledValues() { }, linearRampToValueAtTime() { }, exponentialRampToValueAtTime() { } });
const store = new Map();
globalThis.window = {
  localStorage: {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: key => { store.delete(key); }
  },
  AudioContext: function () {
    return {
      createGain: () => ({ connect() { }, gain: param() }),
      createOscillator: () => ({ connect() { }, start() { }, stop() { }, frequency: param(), detune: param(), type: '' }),
      createBiquadFilter: () => ({ connect() { }, frequency: param(), Q: param(), type: '' }),
      createBufferSource: () => ({ connect() { }, start() { }, stop() { }, buffer: null, playbackRate: param() }),
      createBuffer: (channels, l) => ({ getChannelData: () => new Float32Array(l) }),
      destination: {}, currentTime: 0, state: 'running', sampleRate: 44100, resume() { }
    };
  }
};

const { FIGHTER_CLASSES } = await import('./fighterDefinitions.js');
const {
  BYE_COUNT,
  ROUND_DEFINITIONS,
  TOTAL_MATCHES,
  TOURNAMENT_SAVE_KEY,
  TOURNAMENT_SIZE,
  allMatches,
  applyMatchResult,
  buildTournamentBracket,
  createTournamentBout,
  hasResumableTournament,
  loadActiveTournament,
  nextPendingMatch,
  resolvedMatches,
  runTournamentMatch,
  sanitizeArenaSize,
  saveActiveTournament,
  validateTournament,
  withArenaSize
} = await import('./tournament.js');

// Deterministic RNG so the bracket shape assertions are repeatable.
function seeded(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

test('the bracket uses exactly the 25 existing classes, 9 prelim matches + 7 byes', () => {
  const bracket = buildTournamentBracket({ random: seeded(7) });
  const roster = Object.keys(FIGHTER_CLASSES);

  assert.equal(roster.length, TOURNAMENT_SIZE);
  assert.deepEqual(validateTournament(bracket), []);

  const prelim = bracket.rounds.preliminary.matches;
  assert.equal(prelim.length, 9);
  assert.equal(bracket.byes.length, BYE_COUNT);

  const entrants = [...prelim.flatMap(m => [m.first, m.second]), ...bracket.byes.map(b => b.name)];
  assert.equal(entrants.length, 25);
  assert.deepEqual([...entrants].sort(), [...roster].sort(), 'every class enters exactly once');
});

test('an active save records the bout on stage, its round, eliminations and who is still in', () => {
  store.clear();
  let tournament = buildTournamentBracket({ random: seeded(21) });
  for (let i = 0; i < 2; i++) {
    const match = nextPendingMatch(tournament);
    tournament = applyMatchResult(tournament, match, runTournamentMatch(match.first, match.second)).tournament;
  }
  saveActiveTournament(tournament);

  const next = nextPendingMatch(tournament);
  const saved = JSON.parse(store.get(TOURNAMENT_SAVE_KEY));
  assert.equal(saved.battle.matchId, next.id, 'the bout still to be fought is recorded');
  assert.equal(saved.battle.round, next.round);
  assert.equal(saved.battle.first, next.first);
  assert.equal(saved.battle.second, next.second);
  assert.equal(saved.battle.eliminatedBefore, 2);
  assert.equal(saved.battle.stillIn.length, TOURNAMENT_SIZE - 2);
  assert.ok(saved.battle.stillIn.every(name => !saved.battle.eliminated.includes(name)));

  assert.equal(loadActiveTournament().currentMatchId, next.id, 'restoring resumes the same bout');
});

test('round sizes are 9 / 8 / 4 / 2 / 1 = 24 matches', () => {
  assert.deepEqual(ROUND_DEFINITIONS.map(r => r.matches), [9, 8, 4, 2, 1]);
  assert.equal(TOTAL_MATCHES, 24);
});

test('playing every match produces a champion, and the save survives a "close and reopen"', () => {
  store.clear();
  let tournament = buildTournamentBracket({ random: seeded(11) });
  saveActiveTournament(tournament);

  let closedAndReopened = 0;
  let played = 0;

  while (true) {
    const match = nextPendingMatch(tournament);
    if (!match) break;
    const result = runTournamentMatch(match.first, match.second);
    assert.equal(result.error, null, `${match.first} vs ${match.second}: ${result.error}`);
    const applied = applyMatchResult(tournament, match, result);
    assert.equal(applied.applied, true);
    tournament = applied.tournament;
    saveActiveTournament(tournament);
    played += 1;

    // Simulate closing the program after every match: restore from storage and
    // continue from the restored copy, as App.jsx does on startTournament().
    const restored = loadActiveTournament();
    if (tournament.status === 'complete') {
      // The 24th match finishes the tournament; a finished bracket is deliberately
      // not resumable (see the dedicated test below).
      assert.equal(restored, null);
      break;
    }
    assert.ok(restored, `save lost after match ${played}`);
    assert.equal(restored.status, tournament.status);
    assert.equal(resolvedMatches(restored).length, played);
    tournament = restored;
    closedAndReopened += 1;
  }

  assert.equal(closedAndReopened, TOTAL_MATCHES - 1, 'closed and reopened after each of the 23 unfinished states');
  assert.equal(played, TOTAL_MATCHES);
  assert.equal(resolvedMatches(tournament).length, 24);
  assert.equal(tournament.status, 'complete');
  assert.ok(tournament.champion);
  assert.ok(tournament.runnerUp);
  assert.notEqual(tournament.champion, tournament.runnerUp);
  assert.deepEqual(validateTournament(tournament, { requireComplete: true }), []);

  // Each round was created with its exact size as the tournament progressed.
  assert.equal(tournament.rounds.round16.matches.length, 8);
  assert.equal(tournament.rounds.quarterfinal.matches.length, 4);
  assert.equal(tournament.rounds.semifinal.matches.length, 2);
  assert.equal(tournament.rounds.final.matches.length, 1);
  assert.equal(allMatches(tournament).length, 24);
  assert.equal(tournament.eliminated.length, 24, 'every class but the champion is eliminated');
  assert.ok(!tournament.eliminated.includes(tournament.champion), 'the champion is never eliminated');
});

test('a hand-edited/broken save is discarded instead of resuming a corrupt bracket', () => {
  store.clear();
  const bracket = buildTournamentBracket({ random: seeded(5) });
  store.set('orbital-clash-tournament-active', JSON.stringify({
    ...bracket,
    participants: ['Not A Class'],
    byes: []
  }));
  assert.equal(loadActiveTournament(), null);
});

test('a save from the old roster (extra names) still resumes the 25-class bracket', () => {
  store.clear();
  const bracket = buildTournamentBracket({ random: seeded(9) });
  bracket.participants.push('Retired Class');
  saveActiveTournament(bracket);
  const restored = loadActiveTournament();
  assert.ok(restored);
  assert.equal(restored.participants.length, 25);
  assert.ok(!restored.participants.includes('Retired Class'));
});

test('an unfinished save mid-final resumes with only the final left', () => {
  store.clear();
  let tournament = buildTournamentBracket({ random: seeded(3) });
  while (nextPendingMatch(tournament)?.round !== 'final') {
    const match = nextPendingMatch(tournament);
    tournament = applyMatchResult(tournament, match, runTournamentMatch(match.first, match.second)).tournament;
  }
  saveActiveTournament(tournament);

  const restored = loadActiveTournament();
  assert.ok(restored);
  assert.equal(restored.status, 'active');
  assert.equal(restored.currentRound, 'final');
  assert.equal(nextPendingMatch(restored).id, 'final-1');
  assert.equal(resolvedMatches(restored).length, 23);
});

test('a finished tournament is cleared from the active save, so the next click starts fresh', () => {
  store.clear();
  let tournament = buildTournamentBracket({ random: seeded(21) });
  saveActiveTournament(tournament);
  assert.equal(hasResumableTournament(), true, 'an unfinished bracket is resumable');

  while (true) {
    const match = nextPendingMatch(tournament);
    if (!match) break;
    tournament = applyMatchResult(tournament, match, runTournamentMatch(match.first, match.second)).tournament;
  }
  saveActiveTournament(tournament);
  assert.equal(tournament.status, 'complete');
  assert.equal(loadActiveTournament(), null, 'a completed bracket must not be resumed');
  assert.equal(hasResumableTournament(), false);

  // An explicit keepComplete keeps the finished bracket on disk.
  saveActiveTournament(tournament, { keepComplete: true });
  assert.equal(loadActiveTournament()?.champion, tournament.champion);
});

test('a tournament defaults to the 800 map and only accepts the offered sizes', () => {
  assert.equal(buildTournamentBracket({ random: seeded(2) }).arenaSize, 800);
  assert.equal(buildTournamentBracket({ random: seeded(2), arenaSize: 1000 }).arenaSize, 1000);
  assert.equal(buildTournamentBracket({ random: seeded(2), arenaSize: 123 }).arenaSize, 800, 'an unlisted size falls back');
  assert.equal(sanitizeArenaSize('900'), 800, 'a string is not a valid size');
  assert.equal(sanitizeArenaSize(700), 700);
});

test('changing the arena size leaves the bracket itself untouched', () => {
  const bracket = buildTournamentBracket({ random: seeded(4) });
  const resized = withArenaSize(bracket, 900);
  assert.equal(resized.arenaSize, 900);
  assert.deepEqual(resized.rounds, bracket.rounds);
  assert.deepEqual(resized.byes, bracket.byes);
  assert.equal(bracket.arenaSize, 800, 'the original object is not mutated');
  assert.equal(withArenaSize(bracket, 5).arenaSize, 800);
});

test('the chosen arena size is saved, restored, and kept as matches are played', () => {
  store.clear();
  let tournament = withArenaSize(buildTournamentBracket({ random: seeded(8) }), 1000);
  saveActiveTournament(tournament);
  assert.equal(loadActiveTournament().arenaSize, 1000);
  assert.equal(JSON.parse(store.get(TOURNAMENT_SAVE_KEY)).battle.arenaSize, 1000, 'the save record names the map too');

  const match = nextPendingMatch(tournament);
  tournament = applyMatchResult(tournament, match, runTournamentMatch(match.first, match.second)).tournament;
  assert.equal(tournament.arenaSize, 1000, 'applying a result keeps the map');
  saveActiveTournament(tournament);
  assert.equal(loadActiveTournament().arenaSize, 1000);
});

test('a save from before arena sizes existed (or with a bad size) resumes on the 800 map', () => {
  store.clear();
  const bracket = buildTournamentBracket({ random: seeded(6) });
  const { arenaSize: _omitted, ...legacy } = bracket;
  store.set(TOURNAMENT_SAVE_KEY, JSON.stringify(legacy));
  assert.equal(loadActiveTournament().arenaSize, 800);

  store.set(TOURNAMENT_SAVE_KEY, JSON.stringify({ ...bracket, arenaSize: 99999 }));
  assert.equal(loadActiveTournament().arenaSize, 800);
});

test('a bout is built on the tournament arena size it is given', () => {
  for (const size of [700, 1000]) {
    const bout = createTournamentBout('Knight', 'Ninja', { arenaSize: size, performanceMode: true });
    assert.equal(bout.arenaSize, size);
    const inside = bout.fighters.every(f => f.x > 0 && f.x < size && f.y > 0 && f.y < size);
    assert.ok(inside, `both fighters spawn inside a ${size} map`);
    bout.destroy();
  }
});
