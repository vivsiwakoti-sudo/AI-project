import test from 'node:test';
import assert from 'node:assert/strict';
import { FighterFactory } from '../../FighterFactory.js';
import { installTestAudio } from '../../audio/testAudioStub.js';

installTestAudio();

test('an untouched mine remains indefinitely and detonates when touched', () => {
  const layer = FighterFactory.createFighter('Mine Layer', 100, 100);
  const victim = FighterFactory.createFighter('Gunner', 700, 700);
  layer.mineCooldown = 1000;
  layer.mines.push({ x: 400, y: 400, age: 0 });
  layer.updateMines(100, victim);
  assert.equal(layer.mines.length, 1);
  victim.x = 400;
  victim.y = 400;
  layer.updateMines(0.1, victim);
  assert.equal(layer.mines.length, 0);
  assert.equal(victim.health, victim.maxHealth - 10);
});
