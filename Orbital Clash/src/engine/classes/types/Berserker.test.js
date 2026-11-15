import test from 'node:test';
import assert from 'node:assert/strict';
import { installTestAudio } from '../../audio/testAudioStub.js';

// DamageSystem reaches the Web Audio API as soon as a hit lands.
installTestAudio();

const { Berserker } = await import('./Berserker.js');
const { DamageSystem } = await import('../../systems/DamageSystem.js');

const makeBerserker = () => new Berserker({
  name: 'Berserker',
  color: '#8B0000',
  health: 1000,
  damage: 8,
  speed: 5,
  bodySize: 40,
  attackType: 'Melee',
  cooldown: 0,
  description: 'Two accelerating rotating blades.'
}, 100, 100);

test('Berserker takes 25% more damage from attacks', () => {
  const berserker = makeBerserker();
  const before = berserker.health;

  DamageSystem.applyDamage(null, berserker, 10, 'Melee');

  assert.equal(before - berserker.health, 12.5);
});

test('Berserker takes unmodified sudden death drain damage', () => {
  const berserker = makeBerserker();
  const before = berserker.health;

  DamageSystem.applyDamage(null, berserker, 2, 'AOE', { ignoreCooldown: true, suddenDeath: true });

  assert.equal(before - berserker.health, 2);
});
