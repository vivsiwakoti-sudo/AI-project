import test from 'node:test';
import assert from 'node:assert/strict';
import { installTestAudio } from '../../audio/testAudioStub.js';

installTestAudio();

const { FighterFactory } = await import('../../FighterFactory.js');
const { MIMIC_CLASSES } = await import('./Mimic.js');
const { stepBattle } = await import('../../systems/BattleSimulation.js');
const { hasShape } = await import('../../systems/Shapes.js');

const makeMimic = () => FighterFactory.createFighter('Mimic', 200, 200);
const makeContext = () => {
  const gradient = { addColorStop() {} };
  return new Proxy({ globalAlpha: 1 }, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient;
      return () => {};
    }
  });
};

test('Mimic keeps its distinct appearance when copying Summoner', () => {
  const mimic = makeMimic();
  const summoner = FighterFactory.createFighter('Summoner', 300, 200);
  const context = makeContext();
  const { color, shape } = mimic;
  assert.notEqual(color, summoner.color);
  assert.notEqual(shape, summoner.shape);
  assert.equal(hasShape(shape), true);

  mimic.draw(context);
  mimic.startCopiedForm('Summoner');
  assert.equal(mimic.color, color);
  assert.equal(mimic.shape, shape);
  mimic.draw(context);
});

test('Mimic repeats five seconds in base form and eleven in a copied form', () => {
  const mimic = makeMimic();
  const random = Math.random;
  Math.random = () => 0;
  try {
    mimic.update(4.99, null);
    assert.equal(mimic.mimicForm, null);
    mimic.update(0.01, null);
    assert.equal(mimic.mimicForm, MIMIC_CLASSES[0]);
    mimic.update(11, null);
    assert.equal(mimic.mimicForm, null);
    mimic.update(5, null);
    assert.equal(mimic.mimicForm, MIMIC_CLASSES[0]);
  } finally {
    Math.random = random;
  }
});

test('copying preserves Mimic stats and gives the copied weapon and defense', () => {
  const mimic = makeMimic();
  mimic.health = 90;
  mimic.startCopiedForm('Knight');
  assert.equal(mimic.health, 90);
  assert.equal(mimic.maxHealth, 125);
  assert.equal(mimic.damage, 5);
  assert.equal(mimic.speed, 5);
  assert.equal(mimic.getParryChance('Projectile'), 0.35);
  assert.ok(mimic.swordLength > 0);
  mimic.endCopiedForm();
  assert.equal(mimic.getParryChance, undefined);
  assert.equal(mimic.health, 90);
  assert.equal(mimic.damage, 5);
  assert.equal(mimic.speed, 5);
});

test('Mimic cannot copy itself, Mahoraga, or Mutant', () => {
  const mimic = makeMimic();
  for (const name of ['Mimic', 'Mahoraga', 'Mutant']) {
    assert.ok(!MIMIC_CLASSES.includes(name));
    assert.throws(() => mimic.startCopiedForm(name));
  }
});

test('copied temporary stat boosts and dodge do not persist in base form', () => {
  const mimic = makeMimic();
  mimic.startCopiedForm('Vampire');
  mimic.evolve();
  assert.equal(mimic.dodgeChance, 0.25);
  mimic.endCopiedForm();
  assert.equal(mimic.speed, 5);
  assert.equal(mimic.damage, 5);
  assert.equal(mimic.dodgeChance, undefined);
});

test('ending a Black Hole copy stops its sound and releases pulled fighters', () => {
  const mimic = makeMimic();
  const victim = FighterFactory.createFighter('Knight', 250, 200);
  mimic.victims = [victim];
  mimic.startCopiedForm('Black Hole');
  let stopped = false;
  mimic.holeLoopStop = () => { stopped = true; };
  mimic.activeHole = {};
  victim.isPulledIn = true;
  mimic.endCopiedForm();
  assert.equal(stopped, true);
  assert.equal(victim.isPulledIn, false);
});

test('Duplicator clones remain ordinary clones after Mimic changes form', () => {
  const mimic = makeMimic();
  const opponent = FighterFactory.createFighter('Knight', 200, 200);
  mimic.startCopiedForm('Duplicator');
  mimic.touchVictims = [opponent];
  mimic.checkTouchDamage(opponent);
  const clone = mimic.clones[0];
  assert.ok(clone);
  assert.equal(clone.name, 'Duplicator');
  assert.equal(clone.mimicForm, undefined);
  mimic.endCopiedForm();
  mimic.update(0.1, null);
  assert.equal(mimic.clones[0], clone);
  clone.x = opponent.x;
  clone.y = opponent.y;
  clone.touchVictims = [opponent];
  clone.checkTouchDamage(opponent);
  assert.equal(mimic.clones.length, 2);
  assert.equal(mimic.clones[1].name, 'Duplicator');
  mimic.die();
  assert.equal(clone.isDead, true);
});

test('Summoner minions survive the end of the copied form and die with Mimic', () => {
  const mimic = makeMimic();
  mimic.startCopiedForm('Summoner');
  mimic.update(0.1, null);
  assert.equal(mimic.summons.length, 2);
  const minion = mimic.summons[0];
  mimic.endCopiedForm();
  mimic.update(0.1, null);
  assert.equal(mimic.summons[0], minion);
  mimic.die();
  assert.equal(minion.isDead, true);
});

test('each eligible copied form runs in the battle loop with Mimic stats', () => {
  const context = makeContext();
  for (const name of MIMIC_CLASSES) {
    const mimic = makeMimic();
    const opponent = FighterFactory.createFighter('Knight', 450, 450);
    opponent.damage = 0;
    opponent.health = 1000000000;
    opponent.maxHealth = 1000000000;
    mimic.startCopiedForm(name);
    assert.equal(mimic.maxHealth, 125, name);
    assert.equal(mimic.damage, 5, name);
    assert.equal(mimic.speed, 5, name);
    for (let frame = 0; frame < 660 && !mimic.isDead && !opponent.isDead; frame++) {
      stepBattle([mimic, opponent], { dt: 1 / 60, arenaSize: 800 });
      if (frame % 120 === 0) mimic.draw(context);
    }
    assert.equal(mimic.mimicForm, null, name);
  }
});
