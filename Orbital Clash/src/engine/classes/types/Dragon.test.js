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

const FRAME = 1 / 60;

// Runs the 0.5 s windup at 60 fps and returns the fireball it releases.
function releaseFireball() {
  const dragon = new Dragon(dragonStats, 400, 400);
  const victim = new FighterBase(victimStats, 700, 700);
  for (let i = 0; i < 60 && dragon.fireballs.length === 0; i++) dragon.update(FRAME, victim);
  assert.equal(dragon.fireballs.length, 1, 'the fireball leaves after a 0.5 s windup');
  return { dragon, victim, ball: dragon.fireballs[0] };
}

// Bursts a fire square directly. A long cooldown stops the dragon breathing again mid-test.
function igniteAt(x, y, angle) {
  const dragon = new Dragon(dragonStats, 400, 400);
  dragon.cooldownTimer = 60;
  const victim = new FighterBase(victimStats, 700, 700);
  dragon.explode(x, y, angle);
  return { dragon, victim, fire: dragon.fires[0] };
}

test('Dragon fire deals 5 on touch and 5 more every second while the victim stays inside', () => {
  const { dragon, victim, fire } = igniteAt(400, 400, 0);
  victim.x = fire.x;
  victim.y = fire.y;

  dragon.update(STEP, victim);
  assert.equal(victim.totalDamageTaken, 5, 'touching the fire deals 5 immediately');

  for (let i = 0; i < 3; i++) dragon.update(STEP, victim);
  assert.equal(victim.totalDamageTaken, 5, 'no tick until a full second has passed');

  dragon.update(STEP, victim);
  assert.equal(victim.totalDamageTaken, 10, 'the first tick lands one second after touch');
});

test('Dragon fire vanishes 5 seconds after it bursts', () => {
  const { dragon, victim, fire } = igniteAt(400, 400, 0);
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
  const { dragon, victim, fire } = igniteAt(400, 400, Math.PI / 4);
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

test('Dragon fireball flies 6 px per frame until it strikes something', () => {
  const { dragon, victim, ball } = releaseFireball();
  const start = { x: ball.x, y: ball.y };
  for (let i = 0; i < 10; i++) dragon.update(FRAME, victim);

  assert.equal(dragon.fireballs.length, 1, 'the fireball is still in flight');
  assert.equal(dragon.fires.length, 0, 'no fire appears while the fireball flies');
  const travelled = Math.hypot(ball.x - start.x, ball.y - start.y);
  assert.ok(Math.abs(travelled - 60) < 1e-6, `expected 60 px of travel, got ${travelled}`);
});

test('Dragon fireball bursts into fire when it strikes a fighter', () => {
  const { dragon, victim, ball } = releaseFireball();
  victim.x = ball.x + Math.cos(ball.angle) * 12;
  victim.y = ball.y + Math.sin(ball.angle) * 12;

  dragon.update(FRAME, victim);
  assert.equal(dragon.fireballs.length, 0, 'the fireball is spent on contact');
  assert.equal(dragon.fires.length, 1, 'contact leaves a fire behind');

  dragon.update(FRAME, victim);
  assert.equal(victim.totalDamageTaken, 5, 'the victim is burned by the new fire');
});

test('Dragon fireball bursts at the arena wall and keeps its fire on the map', () => {
  const cases = [
    { x: 22, angle: Math.PI, expectedX: 50 },
    { x: 778, angle: 0, expectedX: 750 }
  ];
  for (const { x, angle, expectedX } of cases) {
    const { dragon, victim, ball } = releaseFireball();
    ball.x = x;
    ball.y = 400;
    ball.angle = angle;
    dragon.update(FRAME, victim);

    assert.equal(dragon.fireballs.length, 0, 'the fireball is spent at the wall');
    assert.equal(dragon.fires.length, 1, 'the wall hit leaves a fire behind');
    assert.equal(dragon.fires[0].x, expectedX, 'the fire square is pulled back onto the map');
  }
});
