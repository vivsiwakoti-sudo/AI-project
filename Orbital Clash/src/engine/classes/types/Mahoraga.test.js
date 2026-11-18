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

test('every damage category adapts independently at 3, 5 and 7 landed hits', () => {
  const mahoraga = makeMahoraga();
  mahoraga.health = mahoraga.maxHealth = 1e9;
  const attacker = makeVictim();
  for (const category of ['Melee', 'Projectile', 'Body', 'Beam', 'AOE', 'Other']) {
    for (let hit = 1; hit <= 9; hit++) {
      const before = mahoraga.health;
      withRandom(0.99, () => DamageSystem.applyDamage(attacker, mahoraga, 10, category, { ignoreCooldown: true }));
      const previousMultiplier = hit <= 3 ? 1 : hit <= 5 ? 0.7 : hit <= 7 ? 0.5 : 0.3;
      assert.ok(Math.abs(before - mahoraga.health - 10 * previousMultiplier) < 1e-6, `${category} hit ${hit}`);
      const multiplier = hit < 3 ? 1 : hit < 5 ? 0.7 : hit < 7 ? 0.5 : 0.3;
      assert.ok(Math.abs(mahoraga.getDamageMultiplier(category, {}, attacker) - multiplier) < 1e-9, `${category} after hit ${hit}`);
    }
  }
  assert.ok(mahoraga.wheelBurst > 0);
});

test('drawing a revealed adaptation on the wheel leaves the canvas stack balanced', () => {
  const mahoraga = makeMahoraga();
  mahoraga.health = mahoraga.maxHealth = 1e9;
  const attacker = makeVictim();
  for (let hit = 0; hit < 3; hit++) {
    withRandom(0.99, () => DamageSystem.applyDamage(attacker, mahoraga, 10, 'Melee', { ignoreCooldown: true }));
  }
  assert.ok(mahoraga.wheelLayers.includes('Melee'), 'the adaptation must be on the wheel');

  // Records save/restore depth so an exception mid-wheel cannot leak transforms
  // into the rest of the arena frame unnoticed.
  const { ctx, stack } = recordingContext();
  assert.doesNotThrow(() => mahoraga.draw(ctx));
  assert.equal(stack.depth, 0, 'every save must be matched by a restore');
  assert.equal(stack.badArcs, 0, 'no wheel node may be drawn with a non-finite radius');
});

test('each revealed adaptation nests one more wheel, capped at three in total', () => {
  const mahoraga = makeMahoraga();
  const victim = makeVictim();
  const advance = (seconds) => {
    for (let t = 0; t < seconds; t += 1 / 60) mahoraga.update(1 / 60, victim);
  };
  for (const category of ['Melee', 'Projectile', 'Body']) {
    for (let i = 0; i < 3; i++) mahoraga.onDamaged(8, category);
  }
  assert.deepEqual(mahoraga.wheelLayers, ['Melee'], 'the first reveal adds a wheel straight away');

  advance(3.1);
  assert.deepEqual(mahoraga.wheelLayers, ['Melee', 'Projectile'], 'the second reveal adds a wheel');

  advance(3.1);
  assert.deepEqual(mahoraga.wheelLayers, ['Melee', 'Projectile'], 'a third adaptation never exceeds three wheels');
  assert.equal(mahoraga.adaptedAttacks.length, 3, 'all three adaptations are still recorded');

  const { ctx, stack } = recordingContext();
  assert.doesNotThrow(() => mahoraga.draw(ctx));
  assert.equal(stack.depth, 0, 'nested wheels must restore every save');
  assert.equal(stack.badArcs, 0);
});

test('zero-impact projectiles still count as landed attacks', () => {
  const mahoraga = makeMahoraga();
  const attacker = makeVictim();
  for (let i = 0; i < 3; i++) {
    assert.equal(DamageSystem.applyDamage(attacker, mahoraga, 0, 'Projectile', { ignoreCooldown: true }), true);
  }
  assert.equal(mahoraga.getDamageMultiplier('Projectile', {}, attacker), 0.7);
});

test('Mahoraga keeps attacking (bodily) against an opponent adapted to melee', () => {
  const mahoraga = makeMahoraga();
  const opponent = makeVictim();

  // Adapt him to melee first, the way a real fight would. A melee adaptation
  // must not stop the body slam: contact damage is a different category.
  for (let i = 0; i < 3; i++) mahoraga.onDamaged(8, 'Melee', { attacker: opponent });
  assert.equal(mahoraga.getDamageMultiplier('Melee', {}, opponent), 0.7, 'melee adaptation is earned');

  const startHealth = opponent.health;
  assert.equal(
    DamageSystem.applyDamage(mahoraga, opponent, mahoraga.damage, 'Body'),
    true,
    'a melee adaptation must not block body contact'
  );
  assert.ok(opponent.health < startHealth);
});

// Attacks are adapted to per attacking class, so the helpers name a Knight as
// the source of every adaptation hit unless a test says otherwise.
const KNIGHT = { name: 'Knight' };
const makeAttacker = (name = 'Knight') => Object.assign(makeMahoraga(), { name });
const adaptedMahoraga = (...categories) => {
  const mahoraga = makeMahoraga();
  mahoraga.health = mahoraga.maxHealth = 1e9;
  for (const category of categories) {
    for (let i = 0; i < 3; i++) mahoraga.onDamaged(8, category, { attacker: KNIGHT });
  }
  return mahoraga;
};

const withRandom = (value, fn) => {
  const original = Math.random;
  Math.random = () => value;
  try { return fn(); } finally { Math.random = original; }
};

// Records save/restore depth, arcs drawn with a non-finite radius and every
// shadow colour set, so a draw that leaks transforms, skips a node or never
// glows gold fails the test.
const recordingContext = () => {
  const stack = { depth: 0, badArcs: 0, shadowColors: [] };
  const chain = new Proxy(function () { }, {
    get(_, prop) {
      if (prop === 'save') return () => { stack.depth += 1; };
      if (prop === 'restore') return () => { stack.depth -= 1; };
      if (prop === 'arc') return (x, y, radius) => { if (!Number.isFinite(radius)) stack.badArcs += 1; };
      if (prop === Symbol.toPrimitive) return () => 0;
      return chain;
    },
    set: (_, prop, value) => {
      if (prop === 'shadowColor') stack.shadowColors.push(value);
      return true;
    },
    apply: () => chain
  });
  return { ctx: chain, stack };
};

test('Mahoraga only gains a melee parry once it has adapted to melee', () => {
  const fresh = makeMahoraga();
  assert.equal(fresh.getParryChance('Melee', KNIGHT), 0, 'no melee parry before adapting');

  const adapted = adaptedMahoraga('Melee');
  assert.equal(adapted.getParryChance('Melee', KNIGHT), 0.25, '25% melee parry once adapted');
  assert.equal(adapted.getParryChance('Projectile', KNIGHT), 0, 'melee adaptation does not unlock a projectile parry');
  for (const category of ['Body', 'Beam', 'AOE']) {
    assert.equal(adapted.getParryChance(category, KNIGHT), 0, `${category} is never parried`);
  }
  assert.equal(adaptedMahoraga('Projectile').getParryChance('Projectile', KNIGHT), 0, 'the first adaptation step does not unlock reflection');
});

test('projectile reflection unlocks at the 2nd adaptation step, on any attack', () => {
  const mahoraga = makeMahoraga();
  mahoraga.health = mahoraga.maxHealth = 1e9;
  for (let i = 0; i < 5; i++) mahoraga.onDamaged(8, 'Melee', { attacker: KNIGHT });
  assert.equal(mahoraga.getParryChance('Projectile', makeAttacker()), 0.35);
});

test('a parried melee strike deals no damage and stuns the attacker', () => {
  const mahoraga = adaptedMahoraga('Melee');
  const attacker = makeAttacker();
  attacker.x = mahoraga.x + 36;
  attacker.y = mahoraga.y;
  const startHealth = mahoraga.health;

  const landed = withRandom(0, () => DamageSystem.applyDamage(attacker, mahoraga, 10, 'Melee'));

  assert.equal(landed, false, 'the parried strike must not land');
  assert.equal(mahoraga.health, startHealth, 'no damage is taken');
  assert.equal(attacker.isStuck, true, 'the attacker is frozen in place');
  assert.ok(attacker.attackPauseTimer > 0, 'the attacker cannot attack while stunned');
  assert.equal(
    DamageSystem.applyDamage(attacker, mahoraga, 10, 'Melee'),
    false,
    'a stunned attacker cannot damage Mahoraga'
  );

  for (let i = 0; i < 75; i++) attacker.update(1 / 60, mahoraga);
  assert.equal(attacker.isStuck, false, 'the stun ends after its duration');
  assert.ok(attacker.attackPauseTimer <= 0, 'the attack pause ends too');
});

test('an unparried melee strike takes 30% less damage and is not stunned', () => {
  const mahoraga = adaptedMahoraga('Melee');
  const attacker = makeAttacker();
  attacker.x = mahoraga.x + 36;
  attacker.y = mahoraga.y;
  const startHealth = mahoraga.health;

  const landed = withRandom(0.99, () => DamageSystem.applyDamage(attacker, mahoraga, 10, 'Melee'));

  assert.equal(landed, true);
  assert.ok(Math.abs(startHealth - mahoraga.health - 7) < 1e-6, 'melee damage is reduced by 30%');
  assert.notEqual(attacker.isStuck, true, 'only a parry stuns');
});

test('a second adaptation waits 3 seconds on the wheel before it is shown', () => {
  const mahoraga = makeMahoraga();
  const victim = makeVictim();
  for (let i = 0; i < 3; i++) mahoraga.onDamaged(8, 'Melee');
  for (let i = 0; i < 3; i++) mahoraga.onDamaged(8, 'Projectile');
  assert.deepEqual(mahoraga.wheelLayers, ['Melee'], 'the first adaptation shows at once');
  assert.equal(mahoraga.getDamageMultiplier('Projectile'), 0.7, 'the queued adaptation still applies immediately');

  for (let t = 0; t < 2.9; t += 1 / 60) mahoraga.update(1 / 60, victim);
  assert.deepEqual(mahoraga.wheelLayers, ['Melee'], 'the second is still waiting');

  for (let t = 0; t < 0.2; t += 1 / 60) mahoraga.update(1 / 60, victim);
  assert.deepEqual(mahoraga.wheelLayers, ['Melee', 'Projectile'], 'the second shows after 3 seconds');
});

test('resistances stay capped at 70% through repeated hits', () => {
  const mahoraga = adaptedMahoraga('Melee', 'Projectile', 'Body');
  for (const category of ['Melee', 'Projectile', 'Body']) {
    for (let i = 0; i < 4; i++) mahoraga.onDamaged(8, category, { attacker: KNIGHT });
  }
  const attacker = makeAttacker();
  attacker.x = mahoraga.x + 36;
  attacker.y = mahoraga.y;
  const expected = { Melee: 3, Projectile: 3, Body: 3 };

  // Far more hits than adaptation needs: damage must never collapse to a flat value.
  for (let hit = 0; hit < 12; hit++) {
    for (const [category, damage] of Object.entries(expected)) {
      attacker.damageCooldown = 0;
      attacker.attackPauseTimer = 0;
      const before = mahoraga.health;
      withRandom(0.99, () => DamageSystem.applyDamage(attacker, mahoraga, 10, category));
      assert.ok(Math.abs(before - mahoraga.health - damage) < 1e-6, `${category} hit ${hit + 1} dealt ${before - mahoraga.health}`);
    }
  }
});

test('adaptation is kept per attacking class, so a different sword starts from zero', () => {
  const mahoraga = adaptedMahoraga('Melee');
  const samurai = makeAttacker('Samurai');

  assert.equal(mahoraga.getDamageMultiplier('Melee', {}, KNIGHT), 0.7, 'the Knight sword is adapted');
  assert.equal(mahoraga.getDamageMultiplier('Melee', {}, samurai), 1, 'the Samurai sword is not');
  assert.equal(mahoraga.getParryChance('Melee', samurai), 0, 'and cannot be parried yet');
  assert.deepEqual(mahoraga.adaptedAttacks.map(a => a.key), ['Knight:Melee']);
});

test('a Mimic must adapt again after switching to another form', () => {
  const mahoraga = makeMahoraga();
  mahoraga.health = mahoraga.maxHealth = 1e9;
  const mimic = makeAttacker('Mimic');
  const hitWith = (form) => {
    mimic.mimicForm = form;
    for (let i = 0; i < 3; i++) {
      withRandom(0.99, () => DamageSystem.applyDamage(mimic, mahoraga, 10, 'Melee', { ignoreCooldown: true }));
    }
  };

  hitWith('Knight');
  assert.equal(mahoraga.getDamageMultiplier('Melee', {}, mimic), 0.7, 'adapted to the copied Knight sword');

  mimic.mimicForm = 'Samurai';
  assert.equal(mahoraga.getDamageMultiplier('Melee', {}, mimic), 1, 'a new form is a new attack');

  hitWith('Samurai');
  assert.equal(mahoraga.getDamageMultiplier('Melee', {}, mimic), 0.7, 'the Samurai form is adapted after three hits');
  mimic.mimicForm = 'Knight';
  assert.equal(mahoraga.getDamageMultiplier('Melee', {}, mimic), 0.7, 'the Knight adaptation is kept');
});

test('each adaptation spins the wheel and glows gold until the glow fades', () => {
  const mahoraga = makeMahoraga();
  mahoraga.health = mahoraga.maxHealth = 1e9;
  const attacker = makeAttacker();
  for (let i = 0; i < 3; i++) {
    withRandom(0.99, () => DamageSystem.applyDamage(attacker, mahoraga, 10, 'Melee', { ignoreCooldown: true }));
  }
  assert.ok(mahoraga.wheelBurst > 0, 'the wheel is kicked into a fast spin');

  const lit = recordingContext();
  mahoraga.draw(lit.ctx);
  assert.ok(lit.stack.shadowColors.includes('#FFD700'), 'the wheel glows gold right after adapting');

  mahoraga.update(1, makeVictim());
  const faded = recordingContext();
  mahoraga.draw(faded.ctx);
  assert.ok(!faded.stack.shadowColors.includes('#FFD700'), 'the gold fades back out');
});

