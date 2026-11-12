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

test('the Laser Beam fires right away, then only again after 5 seconds', () => {
  const laser = new LaserBeam(laserStats, 200, 400);
  const opponent = new FighterBase(victimStats, 700, 400);
  laser.update(FRAME, opponent);
  assert.equal(laser.lasers.length, 1);
  assert.equal(laser.cooldownTimer, 5);

  stepFrames(laser, opponent, 4.9);
  assert.equal(laser.lasers.length, 1, 'no second laser before 5 s');
  stepFrames(laser, opponent, 0.2);
  assert.equal(laser.lasers.length, 2, 'a second laser fires at 5 s');
});

test('the laser stops at the wall and stays there for 5 seconds', () => {
  const laser = new LaserBeam(laserStats, 200, 400);
  const opponent = new FighterBase(victimStats, 700, 400);
  opponent.dodgeChance = 1;
  laser.update(FRAME, opponent);
  const shot = laser.lasers[0];

  // Wall inset is 20 px, so an arena of 800 px stops the tip at x = 780.
  assert.ok(Math.abs(shot.maxLength - (780 - shot.x)) < 1e-6);
  for (let i = 0; i < 60 && !shot.fixed; i++) laser.update(FRAME, opponent);
  assert.equal(shot.fixed, true);
  assert.ok(Math.abs(shot.x + Math.cos(shot.angle) * shot.length - 780) < 1e-6, 'the tip rests on the wall');

  stepFrames(laser, opponent, 4.9);
  assert.ok(laser.lasers.includes(shot), 'still lingering just before 5 s');
  stepFrames(laser, opponent, 0.2);
  assert.ok(!laser.lasers.includes(shot), 'gone after 5 s fixed');
});

test('a laser does 5 damage on touch and then 1 damage every 0.25 seconds while fixed', () => {
  const laser = new LaserBeam(laserStats, 200, 400);
  const victim = new FighterBase(victimStats, 400, 400);
  victim.dodgeChance = 0;
  laser.update(FRAME, victim);
  const shot = laser.lasers[0];

  for (let i = 0; i < 600 && !shot.fixed; i++) laser.update(FRAME, victim);
  assert.equal(victim.health, 1000 - 5, 'one 5 damage hit when the beam crosses the victim');

  stepFrames(laser, victim, 2);
  const ticks = 1000 - 5 - victim.health;
  assert.ok(ticks === 7 || ticks === 8, `about 8 ticks over 2 s, got ${ticks}`);
});
