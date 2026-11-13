import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_GUESSERS,
  PREDICTIONS_KEY,
  addPrediction,
  clearPredictions,
  loadPredictions,
  resolveBattlePrediction,
  resolveTournamentPrediction,
  skipPrediction,
  tallyPredictions,
  voidTournamentPrediction
} from './predictions.js';

// Minimal in-memory localStorage so the module's guarded storage paths run.
function installStorage() {
  const store = new Map();
  globalThis.window = {
    localStorage: {
      getItem: key => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: key => store.delete(key)
    }
  };
  return store;
}

test('guesses are stored in G1..G4 order and capped at four guessers', () => {
  installStorage();
  addPrediction({ kind: 'battle', guesses: ['Gunner', 'Ghost', 'Ninja', 'Tornado', 'Ice Sword'] });
  const [entry] = loadPredictions();
  assert.equal(entry.status, 'pending');
  assert.deepEqual(entry.guesses.map(g => g.guesser), ['G1', 'G2', 'G3', 'G4']);
  assert.equal(entry.guesses.length, MAX_GUESSERS);
});

test('a battle outcome marks each guess right or wrong', () => {
  installStorage();
  addPrediction({ kind: 'battle', guesses: ['Gunner', 'Ghost'] });
  const [entry] = resolveBattlePrediction({ winner: 'Gunner' });
  assert.equal(entry.status, 'resolved');
  assert.equal(entry.winner, 'Gunner');
  assert.deepEqual(entry.guesses.map(g => g.correct), [true, false]);
});

test('an aborted battle voids the pending prediction and it is not tallied', () => {
  installStorage();
  addPrediction({ kind: 'battle', guesses: ['Gunner'] });
  const [entry] = resolveBattlePrediction({ winner: null, aborted: true });
  assert.equal(entry.status, 'void');
  assert.deepEqual(tallyPredictions([entry]).overall, { correct: 0, total: 0 });
});

test('a new battle prediction voids an older one still awaiting its result', () => {
  installStorage();
  addPrediction({ kind: 'battle', guesses: ['Gunner'] });
  addPrediction({ kind: 'battle', guesses: ['Ghost'] });
  const list = loadPredictions();
  assert.equal(list[0].status, 'pending');
  assert.equal(list[1].status, 'void');
});

test('tournament predictions settle by tournament id, not by position', () => {
  installStorage();
  addPrediction({ kind: 'tournament', tournamentId: 't-1', guesses: ['Gunner'] });
  resolveTournamentPrediction('t-other', 'Gunner');
  assert.equal(loadPredictions()[0].status, 'pending');
  const [entry] = resolveTournamentPrediction('t-1', 'Gunner');
  assert.equal(entry.status, 'resolved');
  assert.equal(entry.guesses[0].correct, true);
});

test('discarding a tournament voids its prediction', () => {
  installStorage();
  addPrediction({ kind: 'tournament', tournamentId: 't-2', guesses: ['Gunner'] });
  const [entry] = voidTournamentPrediction('t-2');
  assert.equal(entry.status, 'void');
});

test('the tally counts each guesser separately and only settled picks', () => {
  installStorage();
  addPrediction({ kind: 'battle', guesses: ['Gunner', 'Ghost'] });
  resolveBattlePrediction({ winner: 'Gunner' });
  addPrediction({ kind: 'battle', guesses: ['Ghost', 'Ghost'] });
  resolveBattlePrediction({ winner: 'Gunner' });
  const tally = tallyPredictions(loadPredictions());
  assert.deepEqual(tally.overall, { correct: 1, total: 4 });
  assert.deepEqual(tally.guessers.find(s => s.guesser === 'G1'), { guesser: 'G1', correct: 1, total: 2 });
  assert.deepEqual(tally.guessers.find(s => s.guesser === 'G2'), { guesser: 'G2', correct: 0, total: 2 });
});

test('skipping stores nothing and voids the older pending prediction of its kind', () => {
  installStorage();
  addPrediction({ kind: 'battle', guesses: ['Gunner'] });
  skipPrediction('battle');
  assert.equal(loadPredictions().length, 1);
  // The skipped battle's result must not settle the earlier pending pick.
  const [entry] = resolveBattlePrediction({ winner: 'Gunner' });
  assert.equal(entry.status, 'void');
});

test('clearing predictions removes the stored list', () => {
  const store = installStorage();
  addPrediction({ kind: 'battle', guesses: ['Gunner'] });
  clearPredictions();
  assert.equal(store.has(PREDICTIONS_KEY), false);
  assert.deepEqual(loadPredictions(), []);
});
