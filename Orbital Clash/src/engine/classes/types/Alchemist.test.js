import test from 'node:test';
import assert from 'node:assert/strict';
import { installTestAudio } from '../../audio/testAudioStub.js';

// DamageSystem reaches the Web Audio API as soon as a hit lands.
installTestAudio();

const { Alchemist } = await import('./Alchemist.js');

const makeAlchemist = () => new Alchemist({
  name: 'Alchemist',
  color: '#FFFFFF',
  health: 100,
  damage: 5,
  speed: 2,
  bodySize: 30,
  attackType: 'Projectile',
  cooldown: 5,
  description: 'Throws potions'
}, 100, 100);

// Health is huge so victims survive the whole test and damage is easy to read.
const makeVictim = (x, overrides = {}) => ({
  name: 'Victim',
  x,
  y: 100,
  radius: 14,
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

// Throws one flask, then parks it still on the victim so the next update() bursts it there.
const dropSlowFlaskOn = (alchemist, victim) => {
  alchemist.throwPotion(victim);
  const flask = alchemist.projectiles[0];
  flask.effect = { type: 'slow', damage: 5, duration: 2 };
  flask.vx = 0;
  flask.vy = 0;
  flask.x = victim.x;
  flask.y = victim.y;
  alchemist.cooldownTimer = 999; // no second throw during this update
};

test('a potion that lands damages the opponent in a one-on-one fight', () => {
  const alchemist = makeAlchemist();
  const opponent = makeVictim(200);
  alchemist.victims = [opponent];
  alchemist.opponent = opponent;
  opponent.victims = [alchemist];

  dropSlowFlaskOn(alchemist, opponent);
  alchemist.update(0.016, opponent);

  assert.equal(opponent.health, 995);
});

test('a potion splash damages every fighter in its blast, not just the first', () => {
  const alchemist = makeAlchemist();
  const first = makeVictim(200);
  const bystander = makeVictim(210);
  alchemist.victims = [first, bystander];
  alchemist.opponent = first;
  first.victims = [alchemist, bystander];

  dropSlowFlaskOn(alchemist, first);
  alchemist.update(0.016, first);

  assert.equal(first.health, 995);
  assert.equal(bystander.health, 995);
});

test('a potion is not dropped because the Alchemist hit someone recently', () => {
  const alchemist = makeAlchemist();
  const opponent = makeVictim(200);
  alchemist.victims = [opponent];
  alchemist.opponent = opponent;
  alchemist.damageCooldown = 0.5;

  dropSlowFlaskOn(alchemist, opponent);
  alchemist.update(0.016, opponent);

  assert.equal(opponent.health, 995);
});

test('a parried potion does nothing, including its splash', () => {
  const alchemist = makeAlchemist();
  const parrier = makeVictim(200, { getParryChance: () => 1, onParried() { } });
  const bystander = makeVictim(210);
  alchemist.victims = [parrier, bystander];
  alchemist.opponent = parrier;
  parrier.victims = [alchemist, bystander];

  dropSlowFlaskOn(alchemist, parrier);
  alchemist.update(0.016, parrier);

  assert.equal(parrier.health, 1000);
  assert.equal(bystander.health, 1000);
});
