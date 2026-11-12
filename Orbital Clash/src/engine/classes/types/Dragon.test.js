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

// Bursts a fire circle directly. A long cooldown stops the dragon breathing again mid-test.
function igniteAt(x, y) {
  const dragon = new Dragon(dragonStats, 400, 400);
  dragon.cooldownTimer = 60;
  const victim = new FighterBase(victimStats, 700, 700);
  dragon.explode(x, y);
  return { dragon, victim, fire: dragon.fires[0] };
}

test('Dragon fire waits 0.75 s, then burns 5 per second for 5 seconds', () => {
  const { dragon, victim, fire } = igniteAt(400, 400);
  victim.x = fire.x;
  victim.y = fire.y;

  for (let i = 0; i < 2; i++) dragon.update(STEP, victim);
  assert.equal(victim.totalDamageTaken, 0, 'no damage before the 0.75 s delay ends');

  dragon.update(STEP, victim);
  assert.equal(victim.totalDamageTaken, 5, 'the first burn lands 0.75 s after entering the fire');

  for (let i = 0; i < 3; i++) dragon.update(STEP, victim);
  assert.equal(victim.totalDamageTaken, 5, 'the next tick waits a full second');

  dragon.update(STEP, victim);
  assert.equal(victim.totalDamageTaken, 10, 'the second tick lands at 1.75 s');

  for (let i = 0; i < 12; i++) dragon.update(STEP, victim);
  assert.equal(victim.totalDamageTaken, 25, 'five ticks in total by 4.75 s');
});

test('Dragon fire vanishes 5 seconds after it bursts', () => {
  const { dragon, victim, fire } = igniteAt(400, 400);
  victim.x = fire.x;
  victim.y = fire.y;

  for (let i = 0; i < 19; i++) dragon.update(STEP, victim);
  assert.equal(dragon.fires.length, 1, 'the fire is still burning at 4.75 s');

  dragon.update(STEP, victim);
  assert.equal(dragon.fires.length, 0, 'the fire is gone at 5 s');
  assert.equal(victim.totalDamageTaken, 25, 'no damage is dealt after the fire expires');
});

test('Dragon fire burn restarts its 0.75 s delay when a victim re-enters the circle', () => {
  const { dragon, victim, fire } = igniteAt(400, 400);
  victim.x = fire.x;
  victim.y = fire.y;
  for (let i = 0; i < 2; i++) dragon.update(STEP, victim);

  victim.x = fire.x + 500;
  dragon.update(STEP, victim);

  victim.x = fire.x;
  for (let i = 0; i < 2; i++) dragon.update(STEP, victim);
  assert.equal(victim.totalDamageTaken, 0, 'the delay starts over after leaving the fire');

  dragon.update(STEP, victim);
  assert.equal(victim.totalDamageTaken, 5, 'the burn lands 0.75 s after re-entering');
});

// Places the victim `distance` px from the fire's centre, then reports the damage it takes after the burn delay.
function damageFromFireAt(distance) {
  const { dragon, victim, fire } = igniteAt(400, 400);
  victim.x = fire.x + distance;
  victim.y = fire.y;
  for (let i = 0; i < 3; i++) dragon.update(STEP, victim);
  return victim.totalDamageTaken;
}

test('Dragon fire only hits fighters that overlap its 100 px radius circle', () => {
  assert.equal(damageFromFireAt(119), 5, 'a victim overlapping the rim is burned');
  assert.equal(damageFromFireAt(121), 0, 'a victim just past the rim is missed');
});

test('Dragon speed drops 1% of base per HP lost, capped at an 80% reduction', () => {
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
  assertSpeed(speedAtHealth(106), 7.68);
  assertSpeed(speedAtHealth(70), 4.8);
  assertSpeed(speedAtHealth(30), 1.6);
  assertSpeed(speedAtHealth(20), 1.6);
});

test('Dragon fireball flies 9 px per frame until it strikes something', () => {
  const { dragon, victim, ball } = releaseFireball();
  ball.x = 400;
  ball.y = 400;
  ball.angle = 0;
  victim.x = 400;
  victim.y = 700;
  const start = { x: ball.x, y: ball.y };
  for (let i = 0; i < 10; i++) dragon.update(FRAME, victim);

  assert.equal(dragon.fireballs.length, 1, 'the fireball is still in flight');
  assert.equal(dragon.fires.length, 0, 'no fire appears while the fireball flies');
  const travelled = Math.hypot(ball.x - start.x, ball.y - start.y);
  assert.ok(Math.abs(travelled - 90) < 1e-6, `expected 90 px of travel, got ${travelled}`);
});

test('Dragon fireball deals 10 on a direct hit, then its fire burns 5 after a 0.75 s delay', () => {
  const { dragon, victim, ball } = releaseFireball();
  ball.x = 400;
  ball.y = 400;
  ball.angle = 0;
  victim.x = 412;
  victim.y = 400;

  dragon.update(FRAME, victim);
  assert.equal(dragon.fireballs.length, 0, 'the fireball is spent on contact');
  assert.equal(dragon.fires.length, 1, 'contact leaves a fire behind');
  assert.equal(victim.totalDamageTaken, 10, 'the direct hit deals 10');

  for (let i = 0; i < 2; i++) dragon.update(STEP, victim);
  assert.equal(victim.totalDamageTaken, 10, 'the fire waits before burning');

  dragon.update(STEP, victim);
  assert.equal(victim.totalDamageTaken, 15, 'the fire burn lands 0.75 s after the fire starts');
});

test('Dragon fireball bursts at the arena wall and keeps its fire on the map', () => {
  const cases = [
    { x: 22, angle: Math.PI, expectedX: 120 },
    { x: 778, angle: 0, expectedX: 680 }
  ];
  for (const { x, angle, expectedX } of cases) {
    const { dragon, victim, ball } = releaseFireball();
    ball.x = x;
    ball.y = 400;
    ball.angle = angle;
    dragon.update(FRAME, victim);

    assert.equal(dragon.fireballs.length, 0, 'the fireball is spent at the wall');
    assert.equal(dragon.fires.length, 1, 'the wall hit leaves a fire behind');
    assert.equal(dragon.fires[0].x, expectedX, 'the fire circle is pulled back so it stays on the map');
  }
});
