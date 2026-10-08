import test from 'node:test';
import assert from 'node:assert/strict';

// AudioManager touches the Web Audio API as soon as a hit lands, so give the
// suite a no-op context instead of requiring a browser.
const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
globalThis.window = {
  AudioContext: function () {
    return {
      createGain: () => ({ connect() {}, gain: param() }),
      createOscillator: () => ({ connect() {}, start() {}, stop() {}, frequency: param(), detune: param(), type: '' }),
      createBiquadFilter: () => ({ connect() {}, frequency: param(), Q: param(), type: '' }),
      createBufferSource: () => ({ connect() {}, start() {}, stop() {}, buffer: null, playbackRate: param() }),
      createBuffer: (channels, length) => ({ getChannelData: () => new Float32Array(length) }),
      destination: {},
      currentTime: 0,
      state: 'running',
      sampleRate: 44100,
      resume() {}
    };
  }
};

import { DamageSystem } from './DamageSystem.js';

// Plain object stand-ins so the suite resolves under `node --test` without the
// browser-only modules that FighterBase pulls in (canvas drawing etc).
const makeFighter = (overrides = {}) => ({
  health: 100,
  maxHealth: 100,
  radius: 16,
  damage: 10,
  damageCooldown: 0,
  totalDamageDealt: 0,
  isDead: false,
  isInvulnerable: false,
  isUntargetable: false,
  x: 100,
  y: 100,
  particleSystem: null,
  die() { this.isDead = true; },
  onDamaged() {},
  ...overrides
});

test('damage is credited to the attacker and subtracted from the victim', () => {
  const attacker = makeFighter();
  const victim = makeFighter();

  const landed = DamageSystem.applyDamage(attacker, victim, 25, 'Melee');

  assert.equal(landed, true);
  assert.equal(victim.health, 75);
  assert.equal(attacker.totalDamageDealt, 25);
});

test('a corpse neither takes nor deals damage', () => {
  const attacker = makeFighter();
  const victim = makeFighter();

  DamageSystem.applyDamage(attacker, victim, 200, 'Melee');
  assert.equal(victim.isDead, true);

  // Hitting the corpse again must be a no-op.
  assert.equal(DamageSystem.applyDamage(attacker, victim, 10, 'Melee'), false);
  assert.equal(victim.health, -100);

  // A dead attacker's lingering projectiles must not keep dealing damage.
  const fresh = makeFighter();
  assert.equal(DamageSystem.applyDamage(victim, fresh, 10, 'Projectile'), false);
  assert.equal(fresh.health, 100);
});

test('invulnerable and untargetable victims ignore every damage source', () => {
  const attacker = makeFighter();

  for (const flag of ['isInvulnerable', 'isUntargetable']) {
    const victim = makeFighter();
    victim[flag] = true;
    assert.equal(DamageSystem.applyDamage(attacker, victim, 30, 'AOE'), false, flag);
    assert.equal(victim.health, 100, flag);
  }
});

test('avoidance applies to AOE and projectile damage, not just melee', () => {
  const victim = makeFighter();
  victim.getAvoidanceChance = () => 1; // always dodges

  assert.equal(DamageSystem.applyDamage(makeFighter(), victim, 30, 'AOE'), false);
  assert.equal(DamageSystem.applyDamage(makeFighter(), victim, 30, 'Projectile'), false);
  assert.equal(victim.health, 100);
});

test('parry hands the projectile to the parrier', () => {
  const victim = makeFighter();
  victim.getParryChance = category => (category === 'Projectile' ? 1 : 0);
  const handed = [];
  victim.onParried = (attacker, category, projectile) => handed.push({ attacker, category, projectile });

  const shard = { vx: 3, vy: 0 };
  assert.equal(DamageSystem.applyDamage(makeFighter(), victim, 30, 'Projectile', { projectile: shard }), false);
  assert.equal(victim.health, 100);
  assert.equal(handed.length, 1);
  assert.equal(handed[0].category, 'Projectile');
  assert.equal(handed[0].projectile, shard, 'the live projectile is handed over so it can be deflected');
});

test('a class that only parries projectiles still lets melee, body, beam and AOE through', () => {
  const victim = makeFighter();
  const parried = [];
  // Mahoraga style: the wheel only ever answers ranged fire.
  victim.getParryChance = category => (category === 'Projectile' ? 1 : 0);
  victim.onParried = (attacker, category) => parried.push(category);

  for (const category of ['Melee', 'Body', 'Beam', 'AOE']) {
    assert.equal(DamageSystem.applyDamage(makeFighter(), victim, 10, category), true, category);
  }

  assert.deepEqual(parried, []);
  assert.equal(victim.health, 60);
});

test('a class can deflect melee as well as parry projectiles', () => {
  const victim = makeFighter();
  // Knight style: both categories are answerable.
  victim.getParryChance = category => (category === 'Melee' ? 1 : category === 'Projectile' ? 1 : 0);
  const parried = [];
  victim.onParried = (attacker, category, projectile) => parried.push({ category, projectile });

  const bolt = { vx: 2, vy: 0 };
  assert.equal(DamageSystem.applyDamage(makeFighter(), victim, 30, 'Projectile', { projectile: bolt }), false);
  assert.equal(DamageSystem.applyDamage(makeFighter(), victim, 30, 'Melee'), false);
  assert.equal(victim.health, 100, 'a deflected melee blow deals no damage');
  assert.deepEqual(parried.map(p => p.category), ['Projectile', 'Melee']);
  assert.equal(parried[1].projectile, undefined, 'a melee strike has no projectile to hand over');

  // Beams and AOE are still never deflected.
  for (const category of ['Beam', 'AOE', 'Body']) {
    assert.equal(DamageSystem.applyDamage(makeFighter(), victim, 10, category), true, category);
  }
  assert.equal(victim.health, 70);
});

test('a class with no parry hook takes every category normally', () => {
  const victim = makeFighter();

  for (const category of ['Melee', 'Body', 'Beam', 'AOE', 'Projectile']) {
    assert.equal(DamageSystem.applyDamage(makeFighter(), victim, 10, category), true, category);
  }

  assert.equal(victim.health, 50);
});

test('damage resistance is applied for every category', () => {
  const victim = makeFighter();
  victim.getDamageMultiplier = () => 0.5;

  DamageSystem.applyDamage(makeFighter(), victim, 40, 'Projectile');
  assert.equal(victim.health, 80);
});

test('ignoreCooldown keeps a damage-over-time tick from burning the real attack', () => {
  const attacker = makeFighter();

  // A DOT tick with ignoreCooldown must not gate the class's own attack.
  DamageSystem.applyDamage(attacker, makeFighter(), 1, 'AOE', { ignoreCooldown: true });
  assert.equal(attacker.damageCooldown, 0);
  assert.equal(DamageSystem.applyDamage(attacker, makeFighter(), 10, 'Body'), true);

  // A normal hit still starts the cooldown and blocks an immediate follow-up.
  assert.equal(attacker.damageCooldown, 0.5);
  assert.equal(DamageSystem.applyDamage(attacker, makeFighter(), 10, 'Body'), false);
});

test('the killer is recorded even when the blow is a null-attacker AOE', () => {
  const victim = makeFighter();
  const killer = makeFighter();

  DamageSystem.applyDamage(killer, victim, 200, 'Melee');
  assert.equal(victim.killedBy, killer);
  assert.equal(killer.totalKills, 1);

  // Sudden death style damage credits nobody but still kills.
  const bystander = makeFighter();
  DamageSystem.applyDamage(null, bystander, 200, 'AOE', { ignoreCooldown: true });
  assert.equal(bystander.isDead, true);
  assert.equal(bystander.killedBy, null);
});

test('melee reach accounts for the victim body size', () => {
  const attacker = makeFighter({ radius: 16 });
  // Same centre distance for both, but only the larger body is in reach.
  const distance = attacker.radius + 30 + 20;
  const small = makeFighter({ radius: 5, x: attacker.x + distance });
  const huge = makeFighter({ radius: 32, x: attacker.x + distance });

  assert.equal(DamageSystem.checkHitbox(attacker, small, 'Melee'), false);
  assert.equal(DamageSystem.checkHitbox(attacker, huge, 'Melee'), true);
});
