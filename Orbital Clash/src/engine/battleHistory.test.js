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
