import test from 'node:test';
import assert from 'node:assert/strict';

import { countAliveTeams, drawBattleFrame, drawFighterOutlines, rankBySurvival } from './BattleSimulation.js';
import { OUTLINE_WIDTH } from '../classes/FighterBase.js';

function makeCanvas() {
  const strokes = [];
  const noop = () => {};
  const ctx = {
    save: noop, restore: noop, translate: noop, rotate: noop, scale: noop,
    beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop, arc: noop,
    rect: noop, clip: noop, setTransform: noop, clearRect: noop, fillRect: noop,
    strokeRect: noop, fill: noop,
    stroke() { strokes.push(this.lineWidth); },
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    shadowBlur: 0,
    shadowColor: '',
    lineWidth: 1,
    lineJoin: '',
    fillStyle: '',
    strokeStyle: ''
  };
  return { ctx, strokes };
}

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

test('a team battle ranks the whole winning side first, even above a losing member who lasted longer', () => {
  const winnerLong = { name: 'WinLong', team: 0, survivalTime: 30, totalDamageDealt: 0 };
  const winnerShort = { name: 'WinShort', team: 0, survivalTime: 10, totalDamageDealt: 0 };
  const loserLate = { name: 'LoseLate', team: 1, survivalTime: 20, totalDamageDealt: 0 };
  assert.deepEqual(
    rankBySurvival([loserLate, winnerShort, winnerLong]).map(f => f.name),
    ['WinLong', 'WinShort', 'LoseLate']
  );
});

test('the battle is over when one side is left, counting sides rather than fighters', () => {
  const alive = (name, team, extra = {}) => ({ name, team, health: 50, isDead: false, ...extra });
  const teammates = [alive('A', 0), alive('B', 0), alive('C', 1, { isDead: true })];
  assert.equal(countAliveTeams(teammates), 1);
  assert.equal(countAliveTeams([alive('A', 0), alive('B', 0), alive('C', 1)]), 2);
  // Free-for-all: every fighter is its own side.
  assert.equal(countAliveTeams([alive('A', undefined), alive('B', undefined)]), 2);
});

test('ranking does not reorder the input array', () => {
  const a = { name: 'A', survivalTime: 1, totalDamageDealt: 0 };
  const b = { name: 'B', survivalTime: 2, totalDamageDealt: 0 };
  const input = [a, b];
  rankBySurvival(input);
  assert.deepEqual(input, [a, b]);
});

test('the final fighter outline pass draws a thick body edge and accent ring', () => {
  const { ctx, strokes } = makeCanvas();
  const fighter = {
    x: 100, y: 100, radius: 20, shape: 'round', color: '#00ffff', health: 100,
    isDead: false, impactStrength: 0, bounceTimer: 0
  };

  drawFighterOutlines(ctx, fighter);

  assert.ok(strokes.includes(OUTLINE_WIDTH), 'the silhouette uses the shared thick outline');
  assert.ok(strokes.includes(3.5), 'the accent ring remains visible');
});

test('the tournament frame renderer applies fighter outlines after class artwork', () => {
  const { ctx, strokes } = makeCanvas();
  let classDrawn = false;
  const fighter = {
    x: 100, y: 100, radius: 20, shape: 'round', color: '#00ffff', health: 100,
    isDead: false, impactStrength: 0, bounceTimer: 0,
    draw() { classDrawn = true; }
  };

  drawBattleFrame(ctx, {
    fighters: [fighter],
    particles: null,
    arenaSize: 800,
    time: 0,
    onFighterError: (_fighter, error) => { throw error; }
  });

  assert.equal(classDrawn, true, 'class artwork was rendered');
  assert.ok(strokes.includes(OUTLINE_WIDTH), 'tournament rendering added the body outline');
  assert.ok(strokes.includes(3.5), 'tournament rendering added the outer accent ring');
});
