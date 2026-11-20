import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BATTLE_COUNT_KEY,
  HISTORY_KEY,
  MAX_HISTORY_ENTRIES,
  clearHistory,
  loadBattleCount,
  loadHistory,
  recordBattle
} from './battleHistory.js';

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

const results = [
  { name: 'Gunner', color: '#ff0000', placement: 1, totalKills: 2, battleDuration: 40 },
  { name: 'Ghost', color: '#ffffff', placement: 2, totalKills: 0, battleDuration: 40 }
];

test('a team battle marks every fighter on the winning side as won', () => {
  installStorage();
  clearHistory();
  recordBattle([
    { name: 'Gunner', color: '#ff0000', placement: 1, team: 0, totalKills: 1, battleDuration: 30 },
    { name: 'Ghost', color: '#ffffff', placement: 2, team: 0, totalKills: 0, battleDuration: 30 },
    { name: 'Vanguard', color: '#00ff00', placement: 3, team: 1, totalKills: 0, battleDuration: 30 }
  ]);
  const [entry] = loadHistory();
  assert.deepEqual(entry.participants.map(p => [p.name, p.won]), [
    ['Gunner', true],
    ['Ghost', true],
    ['Vanguard', false]
  ]);
});

test('an aborted battle marks nobody as won', () => {
  installStorage();
  clearHistory();
  recordBattle(results, { aborted: true });
  const [entry] = loadHistory();
  assert.ok(entry.participants.every(p => p.won === false));
});

test('entries recorded before the won flag fall back to the winner name', () => {
  const store = installStorage();
  store.set(HISTORY_KEY, JSON.stringify([{
    timestamp: 1,
    winner: 'Gunner',
    aborted: false,
    durationSeconds: 40,
    participants: [{ name: 'Gunner', placement: 1 }, { name: 'Ghost', placement: 2 }]
  }]));
  const [entry] = loadHistory();
  assert.deepEqual(entry.participants.map(p => p.won), [true, false]);
});


test('the battle count keeps rising past the capped log length', () => {
  installStorage();
  for (let i = 0; i < MAX_HISTORY_ENTRIES + 5; i++) recordBattle(results);
  assert.equal(loadHistory().length, MAX_HISTORY_ENTRIES);
  assert.equal(loadBattleCount(), MAX_HISTORY_ENTRIES + 5);
});

test('clearing the history also resets the battle count', () => {
  installStorage();
  recordBattle(results);
  clearHistory();
  assert.equal(loadBattleCount(), 0);
  assert.deepEqual(loadHistory(), []);
});

test('an install without a stored count starts from the logged battles', () => {
  const store = installStorage();
  recordBattle(results);
  recordBattle(results);
  store.delete(BATTLE_COUNT_KEY);
  assert.equal(store.has(HISTORY_KEY), true);
  assert.equal(loadBattleCount(), 2);
});
