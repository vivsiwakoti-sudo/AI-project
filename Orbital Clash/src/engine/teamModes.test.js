import test from 'node:test';
import assert from 'node:assert/strict';
import { planTeams, presetSizes, winningSideNames } from './teamModes.js';

test('a preset deals fighters round-robin so sides differ by at most one and sum to the roster', () => {
  assert.deepEqual(presetSizes(5, 2), [2, 2, 1]);
  assert.deepEqual(presetSizes(5, 3), [3, 2]);
  assert.deepEqual(presetSizes(6, 3), [3, 3]);
  assert.deepEqual(presetSizes(4, 3), [2, 2]);
  // A 2v2 or 3v3 always has at least two sides, even with a single pair of fighters.
  assert.deepEqual(presetSizes(2, 3), [1, 1]);
  assert.deepEqual(presetSizes(3, 2), [2, 1]);
});

test('a preset plan gives every fighter a side index that matches the sizes', () => {
  const plan = planTeams('2v2', 5);
  assert.deepEqual(plan.teams, [0, 1, 2, 0, 1]);
  assert.deepEqual(plan.sizes, [2, 2, 1]);
  assert.equal(plan.error, null);
});

test('free-for-all carries no team data at all', () => {
  assert.deepEqual(planTeams('ffa', 4), { teams: null, sizes: null, error: null });
});

test('custom teams re-index arbitrary picker labels into ascending side numbers', () => {
  const plan = planTeams('custom', 3, [7, 3, 7]);
  assert.deepEqual(plan.teams, [1, 0, 1]);
  assert.deepEqual(plan.sizes, [1, 2]);
  assert.equal(plan.error, null);
});

test('custom teams need at least two sides and a pick for every fighter', () => {
  assert.match(planTeams('custom', 3, [1, 1, 1]).error, /at least two teams/);
  assert.match(planTeams('custom', 3, [1, 2]).error, /every fighter/);
  assert.match(planTeams('custom', 3, null).error, /every fighter/);
});

test('the winning side in a team battle is everyone on the placement-one fighter’s team', () => {
  const results = [
    { name: 'Gunner', team: 0, placement: 1 },
    { name: 'Loser', team: 1, placement: 3 },
    { name: 'Ghost', team: 0, placement: 2 },
    { name: 'Other', team: 1, placement: 4 }
  ];
  assert.deepEqual(winningSideNames(results), ['Gunner', 'Ghost']);
});

test('the winning side in a free-for-all is just the winner', () => {
  const results = [
    { name: 'Gunner', placement: 1 },
    { name: 'Ghost', placement: 2 }
  ];
  assert.deepEqual(winningSideNames(results), ['Gunner']);
  assert.deepEqual(winningSideNames([]), []);
});
