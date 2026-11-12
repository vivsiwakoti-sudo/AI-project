import test from 'node:test';
import assert from 'node:assert/strict';

import { FighterBase } from '../FighterBase.js';
import { LaserBeam } from './LaserBeam.js';
import { installTestAudio } from '../../audio/testAudioStub.js';

installTestAudio();

const laserStats = {
  name: 'Laser Beam',
  color: '#ff2d55',
  health: 100,
  damage: 5,
  speed: 4,
  bodySize: 40,
  attackType: 'Trail',
  cooldown: 5,
  description: 'Laser Beam'
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

function stepFrames(laser, opponent, seconds) {
  for (let i = 0; i < Math.round(seconds * 60); i++) laser.update(FRAME, opponent);
}

test('the Laser Beam starts drawing at fight start and keeps drawing until it touches a wall', () => {
  const laser = new LaserBeam(laserStats, 200, 400);
  const opponent = new FighterBase(victimStats, 700, 400);
  laser.vx = 1;
  laser.vy = 0;
  laser.update(FRAME, opponent);
  assert.equal(laser.lasers.length, 1);
  assert.equal(laser.lasers[0].fixed, false);

  stepFrames(laser, opponent, 6);
  assert.equal(laser.lasers.length, 1, 'no second trail starts while one is still being drawn');
  assert.equal(laser.lasers[0].fixed, false);
  assert.equal(laser.cooldownTimer, 0, 'the cooldown does not run while drawing');
});

test('the second wall bounce ends the trail, starts the 5 second cooldown, and the trail lingers 5 seconds', () => {
  const laser = new LaserBeam(laserStats, 200, 400);
  const opponent = new FighterBase(victimStats, 700, 400);
  laser.vx = 1;
  laser.vy = 0;
  laser.update(FRAME, opponent);
  stepFrames(laser, opponent, 1);
  const trail = laser.lasers[0];

  laser.onWallHit('right');
  assert.equal(trail.fixed, false, 'the first wall bounce keeps the laser drawing');
  assert.equal(laser.cooldownTimer, 0, 'no cooldown after the first bounce');

  laser.onWallHit('left');
  assert.equal(trail.fixed, true, 'the second wall bounce ends the laser');
  assert.deepEqual(trail.points[trail.points.length - 1], { x: laser.x, y: laser.y }, 'the trail ends where the fighter hit the wall');
  assert.equal(laser.cooldownTimer, 5, 'the cooldown starts at the second wall');

  stepFrames(laser, opponent, 4.9);
  assert.ok(laser.lasers.includes(trail), 'still lingering before 5 s');
  assert.equal(laser.lasers.length, 1, 'no new trail while cooling down');
  stepFrames(laser, opponent, 0.2);
  assert.ok(!laser.lasers.includes(trail), 'gone after 5 s');
  assert.equal(laser.lasers.length, 1, 'a new trail starts once the cooldown ends');
  assert.equal(laser.lasers[0].fixed, false);
});

test('a trail does 5 damage on touch, then 1 damage every 0.25 seconds while it lingers', () => {
  const laser = new LaserBeam(laserStats, 200, 400);
  const victim = new FighterBase(victimStats, 400, 400);
  victim.dodgeChance = 0;
  laser.vx = 1;
  laser.vy = 0;
  laser.update(FRAME, victim);
  for (let i = 0; i < 300 && victim.health === 1000; i++) laser.update(FRAME, victim);
  assert.equal(victim.health, 995, 'one 5 damage hit when the drawn trail first crosses the victim');

  stepFrames(laser, victim, 0.5);
  assert.equal(victim.health, 995, 'no more hits while the trail keeps moving past the victim');

  laser.onWallHit('right');
  laser.onWallHit('left');
  const healthAtWall = victim.health;
  stepFrames(laser, victim, 2);
  const ticks = healthAtWall - victim.health;
  assert.ok(ticks === 7 || ticks === 8, `about 8 ticks over 2 s, got ${ticks}`);
});
