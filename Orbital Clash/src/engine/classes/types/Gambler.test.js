import test from 'node:test';
import assert from 'node:assert/strict';
import { installTestAudio } from '../../audio/testAudioStub.js';

// DamageSystem reaches the Web Audio API as soon as a hit lands.
installTestAudio();

const { Gambler } = await import('./Gambler.js');

const makeGambler = () => new Gambler({
  name: 'Gambler',
  color: '#FFFFFF',
  health: 110,
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

test('a die roll picks one of six faces by equal chance', () => {
  const gambler = makeGambler();
  const victim = makeVictim(200, { health: 500 });
  gambler.victims = [victim];
  victim.victims = [gambler];

  // Random in the fourth sixth lands on face index 3: heal the enemy 15 HP.
  throwDieOnto(gambler, victim);
  withRandom(3.5 / 6, () => gambler.update(0.016, victim));

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

  assert.equal(gambler.health, 110 - 110 * 0.15);
});
