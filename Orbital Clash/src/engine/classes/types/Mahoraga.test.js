import test from 'node:test';
import assert from 'node:assert/strict';

// DamageSystem reaches the Web Audio API as soon as a hit lands, so give the
// suite a no-op context instead of requiring a browser. `createBuffer` must
// return a real array: the death SFX loops over it synchronously.
const param = () => ({ value: 0, setValueAtTime() { }, setTargetAtTime() { }, cancelScheduledValues() { }, linearRampToValueAtTime() { }, exponentialRampToValueAtTime() { } });
const audioContextStub = () => ({
  createGain: () => ({ connect() { }, gain: param() }),
  createOscillator: () => ({ connect() { }, start() { }, stop() { }, frequency: param(), detune: param(), type: '' }),
  createBiquadFilter: () => ({ connect() { }, frequency: param(), Q: param(), type: '' }),
  createBufferSource: () => ({ connect() { }, start() { }, stop() { }, buffer: null, playbackRate: param() }),
  createBuffer: (channels, length) => ({ getChannelData: () => new Float32Array(length) }),
  destination: {},
  currentTime: 0,
  state: 'running',
  sampleRate: 44100,
  resume() { }
});
globalThis.window = { AudioContext: function () { return audioContextStub(); } };

const { Mahoraga } = await import('./Mahoraga.js');
const { DamageSystem } = await import('../../systems/DamageSystem.js');

const makeMahoraga = () => new Mahoraga({
  name: 'Mahoraga',
  color: '#FFFFFF',
  health: 130,
  damage: 8,
  speed: 4,
  bodySize: 56,
  attackType: 'Body',
  cooldown: 0,
  description: 'Adapts'
}, 100, 100);

// Health is huge so the victim survives the whole run instead of dying mid-test.
const makeVictim = (overrides = {}) => ({
  name: 'Victim',
  x: 100 + 36, // overlapping Mahoraga's 28px-radius body
  y: 100,
  radius: 18,
  health: 1e9,
  maxHealth: 1e9,
  isDead: false,
  isInvulnerable: false,
  isUntargetable: false,
  damageCooldown: 0,
  vx: 0,
  vy: 0,
  speed: 1,
  particleSystem: null,
  onHitTaken: () => true,
  onDamaged() { },
  die() { this.isDead = true; },
  ...overrides
});

test('Mahoraga is a Body attacker with no weapon animation left behind', () => {
  const mahoraga = makeMahoraga();

  assert.equal(DamageSystem.isBodyAttacker(mahoraga), true, 'the body-contact pass must recognise Mahoraga as a body class');
  assert.equal(mahoraga.checkSlashHit, undefined, 'the slash hit test must be gone');
  assert.equal(mahoraga.sweepAngle, undefined, 'the sweep angle helper must be gone');
  assert.equal(mahoraga.slashSweep, undefined, 'no slash sweep state may exist');
  assert.equal(mahoraga.attackWindup, undefined, 'no wind-up state may exist');
  assert.equal(mahoraga.attackActive, undefined, 'no active-swing state may exist');
});

test('Mahoraga deals its damage purely through body contact', () => {
  const mahoraga = makeMahoraga();
  const opponent = makeVictim();
  const startHealth = opponent.health;

  // Overlap -> the arena-style touch pass lands a Body hit.
  assert.equal(DamageSystem.checkHitbox(mahoraga, opponent, 'Overlap'), true, 'bodies must overlap');
  assert.equal(
    DamageSystem.applyDamage(mahoraga, opponent, mahoraga.damage, 'Body'),
    true,
    'a body slam must connect'
  );
  assert.equal(opponent.health, startHealth - mahoraga.damage);
  assert.equal(mahoraga.totalDamageDealt, mahoraga.damage);
});

test('Mahoraga runs its timers without any swing state machine', () => {
  const mahoraga = makeMahoraga();
  const opponent = makeVictim();

  // Long run: nothing may throw, and no swing state may ever appear.
  for (let i = 0; i < 600; i++) mahoraga.update(1 / 60, opponent);

  assert.equal(mahoraga.slashSweep, undefined);
  assert.equal(mahoraga.attackWindup, undefined);
  assert.equal(mahoraga.attackActive, undefined);
});

test('Mahoraga still adapts after three hits from a category', () => {
  const mahoraga = makeMahoraga();

  for (let i = 0; i < 3; i++) mahoraga.onHitTaken('Melee', 8);
  assert.equal(mahoraga.getDamageMultiplier('Melee'), 0.7, 'melee adaptation is 30% resistance');

  for (let i = 0; i < 3; i++) mahoraga.onHitTaken('Projectile', 8);
  assert.equal(mahoraga.getDamageMultiplier('Projectile'), 0.5, 'projectile adaptation is 50% resistance');

  for (let i = 0; i < 3; i++) mahoraga.onHitTaken('Body', 8);
  assert.equal(mahoraga.getDamageMultiplier('Body'), 0.25, 'body adaptation is 75% resistance');

  // Wheel burst is kicked on each earned adaptation so it spins visibly.
  assert.ok(mahoraga.wheelBurst > 0, 'the wheel must spin on an adaptation');
});

test('Mahoraga keeps attacking (bodily) against an opponent adapted to melee', () => {
  const mahoraga = makeMahoraga();
  const opponent = makeVictim();

  // Adapt him to melee first, the way a real fight would. A melee adaptation
  // must not stop the body slam: contact damage is a different category.
  for (let i = 0; i < 3; i++) mahoraga.onHitTaken('Melee', 8);
  assert.equal(mahoraga.getDamageMultiplier('Melee'), 0.7, 'melee adaptation is earned');

  const startHealth = opponent.health;
  assert.equal(
    DamageSystem.applyDamage(mahoraga, opponent, mahoraga.damage, 'Body'),
    true,
    'a melee adaptation must not block body contact'
  );
  assert.ok(opponent.health < startHealth);
});
