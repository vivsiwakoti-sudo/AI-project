import test from 'node:test';
import assert from 'node:assert/strict';

import { installTestAudio } from './audio/testAudioStub.js';

installTestAudio();

const { FighterFactory } = await import('./FighterFactory.js');
const { applyTestForm, hasTestableFighter, defaultTestForm } = await import('./testForms.js');

test('enemy forms are only offered when a listed fighter is in the fight', () => {
  assert.equal(hasTestableFighter(['Gunner', 'Knight']), false);
  assert.equal(hasTestableFighter(['Gunner', 'Mutant']), true);
  assert.equal(hasTestableFighter(['Mahoraga']), true);
});

test('Vampire stage 3 starts with the stats of two evolutions and no evolve effects', () => {
  const base = FighterFactory.createFighter('Vampire', 100, 100);
  const baseDamage = base.damage;
  const baseSpeed = base.speed;
  const vampire = FighterFactory.createFighter('Vampire', 100, 100);

  applyTestForm(vampire, { stage: 3 });

  assert.equal(vampire.evolutionLevel, 2);
  assert.equal(vampire.damage, baseDamage + 4);
  assert.equal(vampire.speed, Math.min(13, baseSpeed + 4));
  assert.equal(vampire.hasWings, true);
  assert.equal(vampire.dodgeChance, 0.25);
});

test('Solar Beam starts on the chosen cooldown', () => {
  const solar = FighterFactory.createFighter('Solar Beam', 100, 100);
  applyTestForm(solar, { cooldown: 3 });
  assert.equal(solar.cooldown, 3);
});

test('Berserker starts at the chosen speed percentage', () => {
  const berserker = FighterFactory.createFighter('Berserker', 100, 100);
  applyTestForm(berserker, { speedPercent: 1000 });
  assert.equal(berserker.rotationSpeed, 10);
});

test('Mutant keeps its chosen damage and health through every mutation', () => {
  const mutant = FighterFactory.createFighter('Mutant', 100, 100);
  applyTestForm(mutant, defaultTestForm('Mutant'));

  for (let i = 0; i < 20; i++) {
    mutant.mutate();
    assert.equal(mutant.damage, 55);
    assert.equal(mutant.maxHealth, 175);
  }
});

test('pre-adapted Mahoraga resists every attack and reflects projectiles at stage 2', () => {
  const mahoraga = FighterFactory.createFighter('Mahoraga', 100, 100);
  const knight = FighterFactory.createFighter('Knight', 300, 200);
  const gunner = FighterFactory.createFighter('Gunner', 500, 200);

  applyTestForm(mahoraga, { stage: 2 });

  assert.equal(mahoraga.getDamageMultiplier('Melee', {}, knight), 0.5);
  assert.equal(mahoraga.getDamageMultiplier('Projectile', {}, gunner), 0.5);
  assert.equal(mahoraga.getParryChance('Melee', knight), 0.25);
  assert.equal(mahoraga.getParryChance('Projectile', gunner), 0.35);
});

test('pre-adapted Mahoraga at stage 1 does not reflect projectiles yet', () => {
  const mahoraga = FighterFactory.createFighter('Mahoraga', 100, 100);
  const gunner = FighterFactory.createFighter('Gunner', 500, 200);

  applyTestForm(mahoraga, { stage: 1 });

  assert.equal(mahoraga.getParryChance('Projectile', gunner), 0);
});

test('Fireball starts its first volley with the chosen amount', () => {
  const fireball = FighterFactory.createFighter('Fireball', 100, 100);
  const opponent = FighterFactory.createFighter('Knight', 700, 700);
  applyTestForm(fireball, { amount: 50 });

  fireball.update(1 / 60, opponent);

  assert.equal(fireball.projectiles.length, 50);
});

test('Duplicator with 0 starting clones begins with no clones', () => {
  const duplicator = FighterFactory.createFighter('Duplicator', 400, 400);
  duplicator.arenaSize = 800;
  applyTestForm(duplicator, { clones: 0 });

  assert.equal(duplicator.clones.length, 0);
  assert.equal(duplicator.totalClones, 0);
});

test('Duplicator starting clones stop at the 75 clone cap', () => {
  const duplicator = FighterFactory.createFighter('Duplicator', 400, 400);
  duplicator.arenaSize = 800;
  applyTestForm(duplicator, { clones: 75 });

  assert.equal(duplicator.clones.length, 75);
  duplicator.spawnClone();
  assert.equal(duplicator.clones.length, 75);
});

test('Duplicator clones made before the battle receive the arena particle system', () => {
  const duplicator = FighterFactory.createFighter('Duplicator', 400, 400);
  duplicator.arenaSize = 800;
  applyTestForm(duplicator, { clones: 3 });
  const particles = new Proxy({}, { get: () => () => {} });
  duplicator.particleSystem = particles;

  duplicator.update(1 / 60, FighterFactory.createFighter('Knight', 700, 700));

  assert.equal(duplicator.clones.length, 3);
  for (const clone of duplicator.clones) assert.equal(clone.particleSystem, particles);
});
