import test from 'node:test';
import assert from 'node:assert/strict';

import { FighterBase } from '../FighterBase.js';
import { Snake } from './Snake.js';
import { installTestAudio } from '../../audio/testAudioStub.js';

installTestAudio();

const stats = (name) => ({
  name,
  color: '#fff',
  health: 1000,
  damage: 2,
  speed: 4,
  bodySize: 40,
  attackType: 'Trail',
  cooldown: 0,
  description: name
});

// Keeps the Snake parked and drops a fixed trail node under the victim.
const stepOverVictim = (snake, dt, victim) => {
  snake.x = victim.x;
  snake.y = victim.y;
  snake.vx = 0;
  snake.vy = 0;
  snake.trail = [{ x: victim.x, y: victim.y, age: 0 }];
  snake.dropTimer = 10;
  snake.update(dt, victim);
};

test('Snake trail deals 2 damage per second of contact', () => {
  const snake = new Snake(stats('Snake'), 100, 100);
  const victim = new FighterBase(stats('Dummy'), 100, 100);

  for (let i = 0; i < 60; i++) stepOverVictim(snake, 1 / 60, victim);

  assert.equal(victim.totalDamageTaken, 2, 'one second of contact should deal 2 damage');
});

test('Each fighter in the venom keeps its own 1-second tick', () => {
  const snake = new Snake(stats('Snake'), 100, 100);
  const first = new FighterBase(stats('Dummy A'), 100, 100);
  const second = new FighterBase(stats('Dummy B'), 100, 100);
  snake.victims = [first, second];

  for (let i = 0; i < 60; i++) {
    snake.x = 100;
    snake.y = 100;
    snake.vx = 0;
    snake.vy = 0;
    snake.trail = [{ x: 100, y: 100, age: 0 }];
    snake.dropTimer = 10;
    snake.update(1 / 60, first);
  }

  assert.equal(first.totalDamageTaken, 2, 'first fighter should take 2 damage in one second');
  assert.equal(second.totalDamageTaken, 2, 'second fighter should take 2 damage in one second');
});
