import test from 'node:test';
import assert from 'node:assert/strict';
import { installTestAudio } from '../../audio/testAudioStub.js';

// DamageSystem reaches the Web Audio API as soon as a hit lands.
installTestAudio();

const { Gambler } = await import('./Gambler.js');
const { FighterFactory } = await import('../../FighterFactory.js');
const { DamageSystem } = await import('../../systems/DamageSystem.js');

const makeGambler = () => new Gambler({
  name: 'Gambler',
  color: '#FFFFFF',
  health: 150,
  damage: 15,
  speed: 5,
  bodySize: 44,
  attackType: 'Projectile',
  cooldown: 5,
  description: 'Throws dice'
}, 100, 100);

// Health is huge so victims survive the whole test and damage is easy to read.
const makeVictim = (x, overrides = {}) => ({
  name: 'Victim',
  x,
  y: 100,
  radius: 22,
  health: 1000,
  maxHealth: 1000,
  isDead: false,
  isInvulnerable: false,
  isUntargetable: false,
  damageCooldown: 0,
  statusEffects: [],
  vx: 0,
  vy: 0,
  speed: 1,
  particleSystem: null,
  onHitTaken: () => true,
  onDamaged() { },
  die() { this.isDead = true; },
  ...overrides
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

// Throws one die, then parks it on the victim so the next update() resolves it there.
const throwDieOnto = (gambler, victim) => {
  gambler.throwDie(victim);
  const die = gambler.dice[0];
  die.vx = 0;
  die.vy = 0;
  die.x = victim.x;
  die.y = victim.y;
  gambler.cooldownTimer = 999; // no second throw during this update
};

test('a Gambler created by the factory starts with 150 health', () => {
  const gambler = FighterFactory.createFighter('Gambler', 100, 100);
  assert.equal(gambler.health, 150);
  assert.equal(gambler.maxHealth, 150);
});

test('a die travels 8.75 pixels per frame at 60 fps', () => {
  const gambler = makeGambler();
  gambler.throwDie(makeVictim(200));
  const die = gambler.dice[0];
  const startX = die.x;
  const startY = die.y;

  die.update(1 / 60);

  assert.equal(die.x - startX, 8.75);
  assert.equal(die.y, startY);
});

test('a die that lands deals 15 damage and rolls a face on the victim', () => {
  const gambler = makeGambler();
  const victim = makeVictim(200);
  gambler.victims = [victim];
  victim.victims = [gambler];

  throwDieOnto(gambler, victim);
  // Random 0 is the first face, stun, so the rolled effect is visible on the victim.
  withRandom(0, () => gambler.update(0.016, victim));

  assert.equal(victim.health, 985);
  assert.equal(victim.isStuck, true);
  assert.equal(gambler.dice.length, 0);
});

test('a die roll picks one of eight faces by equal chance', () => {
  const gambler = makeGambler();
  const victim = makeVictim(200, { health: 500 });
  gambler.victims = [victim];
  victim.victims = [gambler];

  // Random in the fourth eighth lands on face index 3: heal the enemy 15 HP.
  throwDieOnto(gambler, victim);
  withRandom(3.5 / 8, () => gambler.update(0.016, victim));

  // The die's 15 base damage is healed back by the 15 HP heal face.
  assert.equal(victim.health, 500);
});

test('a parried die deals nothing and does not roll a face', () => {
  const gambler = makeGambler();
  const parrier = makeVictim(200, { getParryChance: () => 1, onParried() { } });
  gambler.victims = [parrier];
  parrier.victims = [gambler];

  throwDieOnto(gambler, parrier);
  // Random 0 would select the stun face if the die rolled, so a stun here means it did.
  withRandom(0, () => gambler.update(0.016, parrier));

  assert.equal(parrier.health, 1000);
  assert.equal(parrier.isStuck, undefined);
  assert.equal(parrier.statusEffects.length, 0);
});

test('a heal face cannot take the enemy above its max HP', () => {
  const gambler = makeGambler();
  const victim = makeVictim(200, { health: 990 });

  gambler.applyFace('heal', victim);

  assert.equal(victim.health, 1000);
});

test('the self 15% face damages the Gambler by 15% of its max HP', () => {
  const gambler = makeGambler();

  gambler.applyFace('selfPercent', gambler);

  assert.equal(gambler.health, 150 - 150 * 0.15);
});

const hitGambler = (gambler, damage = 10) => {
  const attacker = makeVictim(200);
  return DamageSystem.applyDamage(attacker, gambler, damage, 'Projectile', { ignoreCooldown: true });
};

test('the shield face blocks the next three hits and then lapses', () => {
  const gambler = makeGambler();
  gambler.applyFace('shield', gambler);

  const landed = [1, 2, 3, 4].map(() => hitGambler(gambler));

  assert.deepEqual(landed, [false, false, false, true]);
  assert.equal(gambler.health, 140);
});

test('the vulnerable face doubles the next three hits and then lapses', () => {
  const gambler = makeGambler();
  gambler.applyFace('vulnerable', gambler);

  const health = [1, 2, 3, 4].map(() => {
    hitGambler(gambler);
    return gambler.health;
  });

  assert.deepEqual(health, [130, 110, 90, 80]);
});

test('blocked hits do not use up the vulnerable charges', () => {
  const gambler = makeGambler();
  gambler.applyFace('shield', gambler);
  gambler.applyFace('vulnerable', gambler);

  [1, 2, 3].forEach(() => hitGambler(gambler));
  assert.equal(gambler.health, 150);

  [1, 2, 3].forEach(() => hitGambler(gambler));
  assert.equal(gambler.health, 90);
});

test('sudden death ignores the shield and does not use up a charge', () => {
  const gambler = makeGambler();
  gambler.applyFace('shield', gambler);

  DamageSystem.applyDamage(null, gambler, 2, 'AOE', { ignoreCooldown: true, suddenDeath: true });

  assert.equal(gambler.health, 148);
  assert.equal(gambler.shieldHits, 3);
});
