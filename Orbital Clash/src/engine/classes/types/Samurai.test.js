import test from 'node:test';
import assert from 'node:assert/strict';

import { FighterBase } from '../FighterBase.js';
import { Samurai } from './Samurai.js';
import { DamageSystem } from '../../systems/DamageSystem.js';
import { installTestAudio } from '../../audio/testAudioStub.js';

installTestAudio();

const samuraiStats = {
  name: 'Samurai',
  color: '#ffffff',
  health: 150,
  damage: 6,
  speed: 5,
  bodySize: 44,
  attackType: 'Melee',
  cooldown: 3,
  description: 'Samurai'
};

const opponentStats = { ...samuraiStats, name: 'Opponent', health: 1000 };

const FRAME = 1 / 60;

test('an invisible Samurai takes no damage from any category', () => {
  const samurai = new Samurai(samuraiStats, 200, 400);
  const opponent = new FighterBase(opponentStats, 700, 400);
  samurai.performCombo(opponent);

  for (const category of ['Melee', 'Projectile', 'Body', 'AOE', 'Beam']) {
    assert.equal(DamageSystem.applyDamage(opponent, samurai, 20, category, { ignoreCooldown: true }), false, category);
  }
  assert.equal(samurai.health, 150);
});

test('the Samurai takes damage again once the 5 second invisibility ends', () => {
  const samurai = new Samurai(samuraiStats, 200, 400);
  const opponent = new FighterBase(opponentStats, 700, 400);
  samurai.dodgeChance = 0;
  samurai.performCombo(opponent);

  for (let i = 0; i < Math.round(5.1 * 60); i++) samurai.update(FRAME, opponent);

  assert.equal(samurai.isInvisible, false);
  assert.equal(samurai.isInvulnerable, false);
  // The walk can let the katana reach the opponent and pause its attacks, and the opponent is never updated to clear that.
  opponent.attackPauseTimer = 0;
  assert.equal(DamageSystem.applyDamage(opponent, samurai, 20, 'Melee', { ignoreCooldown: true }), true);
  assert.equal(samurai.health, 130);
});

// Pins Math.random to `value` for the duration of `fn`.
const withRandom = (value, fn) => {
  const original = Math.random;
  Math.random = () => value;
  try {
    return fn();
  } finally {
    Math.random = original;
  }
};

// Runs one full three-pass combo, starting it on the first update.
const runCombo = (samurai, opponent) => {
  samurai.update(FRAME, opponent);
  for (let i = 0; i < 120 && samurai.comboActive; i++) samurai.update(FRAME, opponent);
};

test('a finished combo turns the Samurai invisible when the 35% roll succeeds', () => {
  const samurai = new Samurai(samuraiStats, 200, 400);
  const opponent = new FighterBase(opponentStats, 240, 400);
  withRandom(0.2, () => runCombo(samurai, opponent));
  assert.equal(samurai.isInvisible, true);
});

test('a finished combo leaves the Samurai visible when the 35% roll fails', () => {
  const samurai = new Samurai(samuraiStats, 200, 400);
  const opponent = new FighterBase(opponentStats, 240, 400);
  withRandom(0.9, () => runCombo(samurai, opponent));
  assert.equal(samurai.comboPass, 3);
  assert.equal(samurai.isInvisible, false);
});

test('invisibility does not restart the cooldown, which keeps running from the combo start', () => {
  const samurai = new Samurai({ ...samuraiStats, cooldown: 7 }, 200, 400);
  const opponent = new FighterBase(opponentStats, 240, 400);
  let elapsed = 0;
  const step = () => { samurai.update(FRAME, opponent); elapsed += FRAME; };

  withRandom(0.2, () => {
    step();
    elapsed = 0; // the combo starts on this frame, so the cooldown is 7 from here
    for (let i = 0; i < 120 && samurai.comboActive; i++) step();
  });
  assert.equal(samurai.isInvisible, true);
  while (samurai.isInvisible) step();

  assert.ok(Math.abs(samurai.comboCooldown - Math.max(0, 7 - elapsed)) < FRAME / 2, 'cooldown ran down through the combo and invisibility');
});

test('a visible Samurai counts its cooldown down at the normal rate', () => {
  const samurai = new Samurai({ ...samuraiStats, cooldown: 7 }, 200, 400);
  const opponent = new FighterBase(opponentStats, 700, 400);
  samurai.comboCooldown = 7;

  for (let i = 0; i < 60; i++) samurai.update(FRAME, opponent);

  assert.ok(Math.abs(samurai.comboCooldown - 6) < FRAME / 2, 'one second costs one second of cooldown');
});

test('a hit taken does not overwrite the Samurai cooldown', () => {
  const samurai = new Samurai({ ...samuraiStats, cooldown: 7 }, 200, 400);
  samurai.comboCooldown = 5;

  samurai.addDamageNumber(4);

  assert.equal(samurai.comboCooldown, 5);
});

