import test from 'node:test';
import assert from 'node:assert/strict';

import { rankBySurvival } from './BattleSimulation.js';

test('a fighter who lasted longer ranks first', () => {
  const early = { name: 'Early', survivalTime: 10, totalDamageDealt: 999 };
  const late = { name: 'Late', survivalTime: 20, totalDamageDealt: 0 };
  const ranked = rankBySurvival([early, late]);
  assert.deepEqual(ranked.map(f => f.name), ['Late', 'Early']);
});

test('same-frame knockouts share a timestamp and the one with more damage dealt wins', () => {
  const summoner = { name: 'Summoner', survivalTime: 113.2, totalDamageDealt: 10 };
  const opponent = { name: 'Opponent', survivalTime: 113.2, totalDamageDealt: 80 };
  assert.deepEqual(rankBySurvival([summoner, opponent]).map(f => f.name), ['Opponent', 'Summoner']);
  assert.deepEqual(rankBySurvival([opponent, summoner]).map(f => f.name), ['Opponent', 'Summoner']);
});

test('a complete tie on time and damage keeps spawn order', () => {
  const first = { name: 'First', survivalTime: 5, totalDamageDealt: 3 };
  const second = { name: 'Second', survivalTime: 5, totalDamageDealt: 3 };
  assert.deepEqual(rankBySurvival([first, second]).map(f => f.name), ['First', 'Second']);
  assert.deepEqual(rankBySurvival([second, first]).map(f => f.name), ['Second', 'First']);
});

test('ranking does not reorder the input array', () => {
  const a = { name: 'A', survivalTime: 1, totalDamageDealt: 0 };
  const b = { name: 'B', survivalTime: 2, totalDamageDealt: 0 };
  const input = [a, b];
  rankBySurvival(input);
  assert.deepEqual(input, [a, b]);
});
