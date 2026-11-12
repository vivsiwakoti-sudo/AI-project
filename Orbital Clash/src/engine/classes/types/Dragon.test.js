import test from 'node:test';
import assert from 'node:assert/strict';

import { FighterBase } from '../FighterBase.js';
import { Dragon } from './Dragon.js';
import { installTestAudio } from '../../audio/testAudioStub.js';

installTestAudio();

const STEP = 0.25;

const dragonStats = {
  name: 'Dragon',
  color: '#c8321f',
  health: 110,
  damage: 5,
  speed: 8,
  bodySize: 58,
  attackType: 'Area',
  cooldown: 6,
  description: 'Dragon'
};

const victimStats = {
  name: 'Victim',
  color: '#fff',
  health: 1000,
  damage: 5,
  speed: 4,
  bodySize: 40,
  attackType: 'Body',
  cooldown: 0,
  description: 'Victim'
};

// The victim is parked below the dragon, so the breath faces straight down.
// Three steps is the 0.5 s windup, so the fire is released on the third.
function breatheOnce() {
  const dragon = new Dragon(dragonStats, 400, 400);
  const victim = new FighterBase(victimStats, 400, 600);
  for (let i = 0; i < 3; i++) dragon.update(STEP, victim);
  assert.equal(dragon.fires.length, 1, 'the breath is released after a 0.5 s windup');
  return { dragon, victim, fire: dragon.fires[0] };
}

test('Dragon fire deals 5 on touch and 5 more every second while the victim stays inside', () => {
  const { dragon, victim, fire } = breatheOnce();
  victim.x = fire.x;
  victim.y = fire.y;

  dragon.update(STEP, victim);
  assert.equal(victim.totalDamageTaken, 5, 'touching the fire deals 5 immediately');

  for (let i = 0; i < 3; i++) dragon.update(STEP, victim);
  assert.equal(victim.totalDamageTaken, 5, 'no tick until a full second has passed');

  dragon.update(STEP, victim);
  assert.equal(victim.totalDamageTaken, 10, 'the first tick lands one second after touch');
});

test('Dragon fire vanishes 5 seconds after it is breathed', () => {
  const { dragon, victim, fire } = breatheOnce();
  victim.x = fire.x;
  victim.y = fire.y;

  for (let i = 0; i < 19; i++) dragon.update(STEP, victim);
  assert.equal(dragon.fires.length, 1, 'the fire is still burning at 4.75 s');

  dragon.update(STEP, victim);
  assert.equal(dragon.fires.length, 0, 'the fire is gone at 5 s');
  assert.equal(victim.totalDamageTaken, 25, 'no damage is dealt after the fire expires');
});

// Places the victim relative to the fire's own axes, then reports the damage it takes.
function damageFromFireAt(along, across) {
  const { dragon, victim, fire } = breatheOnce();
  const cos = Math.cos(fire.angle);
  const sin = Math.sin(fire.angle);
  victim.x = fire.x + along * cos - across * sin;
  victim.y = fire.y + along * sin + across * cos;
  dragon.update(STEP, victim);
  return victim.totalDamageTaken;
}

test('Dragon fire only hits fighters that overlap its 100x100 square', () => {
  assert.equal(damageFromFireAt(0, 69), 5, 'a victim overlapping the edge is hit');
  assert.equal(damageFromFireAt(0, 71), 0, 'a victim just past the edge is missed');
});

test('Dragon speed drops 5% of base per HP lost, capped at an 80% reduction', () => {
  const dragon = new Dragon(dragonStats, 400, 400);
  const victim = new FighterBase(victimStats, 700, 700);
  const speedAtHealth = (health) => {
    dragon.health = health;
    dragon.update(STEP, victim);
    return dragon.speed;
  };
  const assertSpeed = (actual, expected) =>
    assert.ok(Math.abs(actual - expected) < 1e-9, `expected speed ${expected}, got ${actual}`);

  assertSpeed(speedAtHealth(110), 8);
  assertSpeed(speedAtHealth(106), 6.4);
  assertSpeed(speedAtHealth(70), 1.6);
  assertSpeed(speedAtHealth(40), 1.6);
});
