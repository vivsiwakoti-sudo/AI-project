import test from 'node:test';
import assert from 'node:assert/strict';

import { FighterBase } from '../FighterBase.js';
import { Tornado } from './Tornado.js';
import { installTestAudio } from '../../audio/testAudioStub.js';

installTestAudio();

const stats = (name) => ({
  name,
  color: '#fff',
  health: 100,
  damage: 10,
  speed: 6,
  bodySize: 40,
  attackType: 'Area',
  cooldown: 4,
  description: name
});

// Keeps the Tornado parked at its spawn point so the victim stays inside the ring.
const stepPinned = (tornado, dt, victim) => {
  tornado.x = 100;
  tornado.y = 100;
  tornado.vx = 0;
  tornado.vy = 0;
  tornado.update(dt, victim);
};

test('A Tornado release hits each victim exactly once for its damage', () => {
  const tornado = new Tornado(stats('Tornado'), 100, 100);
  const victim = new FighterBase(stats('Dummy'), 150, 100);

  stepPinned(tornado, 1 / 60, victim);
  assert.equal(tornado.aoeActive, true, 'the release should start the burst window');

  // Step well past the 0.4s window at a coarse timestep, as a slow frame would.
  for (let i = 0; i < 60; i++) stepPinned(tornado, 0.05, victim);

  assert.equal(victim.totalDamageTaken, 10, 'one release should deal its damage once, not per frame');
  assert.equal(tornado.aoeActive, false, 'the burst window should close');
});

test('Each new Tornado release can hit the same victim again', () => {
  const tornado = new Tornado(stats('Tornado'), 100, 100);
  const victim = new FighterBase(stats('Dummy'), 150, 100);

  stepPinned(tornado, 1 / 60, victim);
  for (let i = 0; i < 20; i++) stepPinned(tornado, 0.05, victim);

  tornado.cooldownTimer = 0;
  stepPinned(tornado, 1 / 60, victim);
  for (let i = 0; i < 20; i++) stepPinned(tornado, 0.05, victim);

  assert.equal(victim.totalDamageTaken, 20, 'two separate releases should deal two hits');
});
