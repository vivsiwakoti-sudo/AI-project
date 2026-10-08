import test from 'node:test';
import assert from 'node:assert/strict';

import { FighterBase } from './FighterBase.js';

const makeFighter = () => new FighterBase({
  name: 'Dummy',
  color: '#fff',
  health: 200,
  damage: 10,
  speed: 5,
  bodySize: 32,
  attackType: 'Melee',
  cooldown: 1,
  description: 'Dummy'
}, 100, 100);

// Advance a fighter by `seconds` of simulation in small steps.
const advance = (fighter, seconds, step = 1 / 60) => {
  for (let t = 0; t < seconds; t += step) fighter.tickTimers(step);
};

test('a stun applied with no timer still expires', () => {
  // Spearman sets only `isStunned`/`isStuck` with no stunTimer at all, which is
  // the case that used to leave a fighter stunned for the rest of the match.
  const victim = makeFighter();
  victim.isStunned = true;
  victim.isStuck = true;

  advance(victim, 5);

  assert.equal(victim.isStunned, false);
  assert.equal(victim.isStuck, false);
});

test('a stun is never cleared early while a finite timer is still running', () => {
  const victim = makeFighter();
  victim.isStunned = true;
  victim.stunTimer = 2;

  advance(victim, 1);
  assert.equal(victim.isStunned, true, 'still stunned one second into a two second stun');

  advance(victim, 1.5);
  assert.equal(victim.isStunned, false);
});

test('a pinned victim stays stuck for the whole pin and is released afterwards', () => {
  const victim = makeFighter();
  // Grappler style pin: both flags plus a pin timer.
  victim.isStunned = true;
  victim.isStuck = true;
  victim.isPinned = true;
  victim.pinTimer = 2;
  victim.stunTimer = 2;

  advance(victim, 1);
  assert.equal(victim.isStuck, true);

  advance(victim, 2);
  assert.equal(victim.isPinned, false);
  assert.equal(victim.isStunned, false);
  assert.equal(victim.isStuck, false);
});

test('a stunned fighter still attacks again once the stun clears', () => {
  const victim = makeFighter();
  victim.isStunned = true;
  victim.isStuck = true;
  // No stunTimer: the class forgot the bookkeeping.
  advance(victim, 5);
  assert.equal(victim.isStuck, false);

  // Movement must resume once unstuck instead of being skipped forever.
  const beforeX = victim.x;
  victim.update(1 / 60, null);
  assert.notEqual(victim.x, beforeX, 'an unstunned fighter moves again');
});