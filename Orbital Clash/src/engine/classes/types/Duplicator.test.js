import test from 'node:test';
import assert from 'node:assert/strict';

import { FighterBase } from '../FighterBase.js';
import { FighterFactory } from '../../FighterFactory.js';
import { installTestAudio } from '../../audio/testAudioStub.js';

installTestAudio();

const dummyStats = {
  name: 'Dummy',
  color: '#fff',
  health: 1000,
  damage: 2,
  speed: 4,
  bodySize: 40,
  attackType: 'Body',
  cooldown: 0,
  description: 'Dummy'
};

// Moves the victim onto or away from the Duplicator and runs only the parent's touch check,
// so clones spawned by the swarm don't add their own touches to the count.
const frame = (duplicator, victim, touching) => {
  victim.x = touching ? 100 : 700;
  duplicator.touchVictims = [victim];
  duplicator.checkTouchDamage(victim);
};

test('each new touch spawns a clone with no cooldown, and staying in contact does not', () => {
  const duplicator = FighterFactory.createFighter('Duplicator', 100, 100);
  const victim = new FighterBase(dummyStats, 100, 100);

  frame(duplicator, victim, true);
  assert.equal(duplicator.totalClones, 1, 'first touch spawns a clone');

  for (let i = 0; i < 120; i++) frame(duplicator, victim, true);
  assert.equal(duplicator.totalClones, 1, 'staying in contact spawns no more clones');

  frame(duplicator, victim, false);
  frame(duplicator, victim, true);
  assert.equal(duplicator.totalClones, 2, 'a new touch spawns again immediately');
});

test('touches stop cloning once the swarm reaches 50 clones', () => {
  const duplicator = FighterFactory.createFighter('Duplicator', 100, 100);
  const victim = new FighterBase(dummyStats, 100, 100);
  duplicator.totalClones = 50;

  frame(duplicator, victim, true);
  assert.equal(duplicator.totalClones, 50, 'at 50 clones a touch no longer duplicates');
});
