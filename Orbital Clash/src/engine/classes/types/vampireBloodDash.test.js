import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal audio stub so the classes' constructor/update paths that touch
// audioManager do not throw in a headless run (mirrors the other engine tests).
const param = () => ({ value: 0, setValueAtTime() { }, setTargetAtTime() { }, cancelScheduledValues() { }, linearRampToValueAtTime() { }, exponentialRampToValueAtTime() { } });
globalThis.window = {
  AudioContext: function () {
    return {
      createGain: () => ({ connect() { }, gain: param() }),
      createOscillator: () => ({ connect() { }, start() { }, stop() { }, frequency: param(), detune: param(), type: '' }),
      createBiquadFilter: () => ({ connect() { }, frequency: param(), Q: param(), type: '' }),
      createBufferSource: () => ({ connect() { }, start() { }, stop() { }, buffer: null, playbackRate: param() }),
      createBuffer: (c, l) => ({ getChannelData: () => new Float32Array(l) }),
      destination: {}, currentTime: 0, state: 'running', sampleRate: 44100, resume() { }
    };
  }
};

const { Vampire } = await import('./Vampire.js');
const { Fireball } = await import('./Fireball.js');
const { Berserker } = await import('./Berserker.js');
const { Gunner } = await import('./Gunner.js');
const { Tunneler } = await import('./Tunneler.js');
const { IceSword } = await import('./IceSword.js');
const { Grappler } = await import('./Grappler.js');
const { Ninja } = await import('./Ninja.js');
const { Projectile } = await import('../Projectile.js');
const { DamageSystem } = await import('../../systems/DamageSystem.js');

const data = (name, extra = {}) => ({
  name, color: '#fff', health: 150, damage: 15, speed: 3, bodySize: 56,
  attackType: 'Melee', cooldown: 3, description: 'x', shape: 'round', ...extra
});

// Advance a fighter for `seconds` in ~60fps steps against a stationary opponent.
const advance = (fighter, opponent, seconds) => {
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) fighter.update(dt, opponent);
};

const withRandom = (value, fn) => {
  const original = Math.random;
  Math.random = () => value;
  try { return fn(); } finally { Math.random = original; }
};

test('Vampire gains a 25% dodge chance on its first evolution', () => {
  const vampire = new Vampire(data('Vampire'), 100, 100);
  const attack = category => DamageSystem.applyDamage(null, vampire, 10, category);

  assert.equal(withRandom(0, () => attack('Melee')), true, 'stage 1 cannot dodge');
  vampire.registerClawHit();
  vampire.registerClawHit();
  vampire.registerClawHit();
  assert.equal(vampire.evolutionLevel, 1);

  for (const category of ['Melee', 'Projectile']) {
    const health = vampire.health;
    assert.equal(withRandom(0.249, () => attack(category)), false, category);
    assert.equal(vampire.health, health);
    assert.equal(withRandom(0.25, () => attack(category)), true, category);
    assert.equal(vampire.health, health - 10);
  }
});

test('dodged bullets and spikes can pass through Vampire without hitting again', () => {
  for (const [Class, field] of [[Gunner, 'projectiles'], [Tunneler, 'spikes']]) {
    const vampire = new Vampire(data('Vampire', { speed: 0 }), 100, 100);
    vampire.evolve();
    const attacker = new Class(data('Attacker', { speed: 0, attackType: 'Projectile' }), 300, 100);
    attacker.cooldownTimer = 100;
    attacker.victims = [vampire];
    attacker[field].push(new Projectile(vampire.x, vampire.y, 0, 0, 10, attacker));

    withRandom(0, () => attacker.update(1 / 60, vampire));
    assert.equal(vampire.health, 150);
    const other = new Vampire(data('Other', { speed: 0 }), 100, 100);
    attacker.victims.push(other);
    withRandom(0.9, () => attacker.update(1 / 60, vampire));
    assert.equal(vampire.health, 150, 'a successful dodge lasts for the whole projectile');
    assert.equal(other.health, 140, 'the projectile can still hit another fighter');
  }
});

test('a dodged Ice Sword swing does not hit again on the next frame', () => {
  const vampire = new Vampire(data('Vampire', { speed: 0 }), 140, 100);
  vampire.evolve();
  const sword = new IceSword(data('Ice Sword', { speed: 0 }), 100, 100);
  sword.swordAngle = 0;
  sword.cooldownTimer = 0;

  withRandom(0, () => sword.update(0, vampire));
  withRandom(0.9, () => sword.update(0, vampire));
  assert.equal(vampire.health, 150);
});

test('a dodged grapple does not pin or pause Vampire', () => {
  const vampire = new Vampire(data('Vampire', { speed: 0 }), 140, 100);
  vampire.evolve();
  const grappler = new Grappler(data('Grappler', { speed: 0 }), 100, 100);

  withRandom(0, () => grappler.update(1 / 60, vampire));

  assert.equal(vampire.health, 150);
  assert.ok(!vampire.isPinned);
  assert.ok(!vampire.isStuck);
  assert.equal(vampire.attackPauseTimer, 0);
  assert.equal(grappler.isHookActive, false);
});

test('a dodged Ninja dart does not pull or affect Vampire', () => {
  const vampire = new Vampire(data('Vampire', { speed: 0 }), 100, 100);
  vampire.evolve();
  const ninja = new Ninja(data('Ninja', { speed: 0 }), 20, 100);
  ninja.ropeActive = true;
  ninja.ropeTimer = 1;
  ninja.ropeDart = {
    x: 86, y: 100, vx: 14, vy: 0, traveled: 0, maxDistance: 300,
    hit: false, target: null, savedVx: 0, savedVy: 0
  };

  withRandom(0, () => ninja.update(1 / 60, vampire));

  assert.equal(vampire.health, 150);
  assert.equal(vampire.statusEffects.length, 0);
  assert.equal(ninja.ropeActive, false);
  assert.equal(ninja.ropeDart, null);
});

test('a latched Blood Dash freezes the victim\'s attacks', () => {
  const vampire = new Vampire(data('Vampire'), 100, 100);
  vampire.evolutionLevel = 1; // stage 2: Blood Dash unlocked
  const victim = new Fireball(data('Fireball'), 140, 100);

  // Force the latch directly rather than waiting on the 35% roll: drive the
  // dash state machine to "drain" and let one frame hold it there.
  vampire.dashState = 'dash';
  vampire.dashTarget = victim;
  vampire.dashTimer = 1.2;
  victim.x = vampire.x + 5;
  victim.y = vampire.y;
  vampire.update(1 / 60, victim); // dash -> drain (bodies are touching)
  assert.equal(vampire.dashState, 'drain', 'dash must latch on contact');

  // A fresh frame of the latch must have paused the victim.
  vampire.update(1 / 60, victim);
  assert.ok(victim.attackPauseTimer > 0, 'a latched victim has its attacks paused');
});

test('a full Blood Dash deals and heals only 12 HP, without stake hits during the latch', () => {
  const vampire = new Vampire(data('Vampire', { damage: 12 }), 100, 100);
  const victim = new Fireball(data('Fireball'), 140, 100);
  vampire.health = 50;
  vampire.evolutionLevel = 2;
  vampire.weaponAngle = 0;
  vampire.vx = 0;
  vampire.vy = 0;
  vampire.dashState = 'dash';
  vampire.dashTarget = victim;
  vampire.dashTimer = 1.2;

  vampire.update(1 / 60, victim);
  assert.equal(vampire.dashState, 'drain');
  for (let i = 0; i < 181 && vampire.dashState === 'drain'; i++) {
    vampire.update(1 / 60, victim);
  }

  assert.equal(vampire.dashState, 'idle');
  assert.equal(victim.health, 138);
  assert.equal(vampire.health, 62);
  assert.equal(vampire.totalHits, 3);
  assert.equal(vampire.successfulHeals, 0);

  vampire.weaponAngle = 0;
  vampire.weaponHot = false;
  vampire.vx = 0;
  vampire.vy = 0;
  vampire.update(1 / 60, victim);
  assert.equal(victim.health, 126, 'stake attacks resume after the latch');
  assert.equal(vampire.health, 72);
});

test('a paused Fireball stops firing new projectiles', () => {
  const fireball = new Fireball(data('Fireball'), 100, 100);
  const opponent = { x: 300, y: 100, radius: 20, health: 500, isDead: false, statusEffects: [], vx: 0, vy: 0 };

  // Let it get a volley off first, then hold it paused and confirm the volley
  // counter stops climbing while paused.
  advance(fireball, opponent, 3.2);
  const beforePause = fireball.shotsFired;
  assert.ok(beforePause >= 1, 'the Fireball fires at least one volley unpaused');

  // Simulate the Vampire keeping it latched: refresh the pause every frame.
  const dt = 1 / 60;
  for (let t = 0; t < 5; t += dt) {
    fireball.pauseAttacks(0.1);
    fireball.update(dt, opponent);
  }
  assert.equal(fireball.shotsFired, beforePause, 'no fresh volley may leave a latched Fireball');

  // Released: the volley timer resumes and fires again.
  advance(fireball, opponent, 3.2);
  assert.ok(fireball.shotsFired > beforePause, 'once released it fires again');
});

test('a latched Berserker stops rotating its blades', () => {
  const berserker = new Berserker(data('Berserker'), 100, 100);
  const opponent = { x: 300, y: 100, radius: 20, health: 500, isDead: false, statusEffects: [], vx: 0, vy: 0 };

  // Spin it up unpaused so the angle is clearly advancing.
  advance(berserker, opponent, 0.5);
  const spinningAngle = berserker.bladeAngle;

  // Hold it paused for a full second of simulated frames.
  const dt = 1 / 60;
  for (let t = 0; t < 1; t += dt) {
    berserker.pauseAttacks(0.1);
    berserker.update(dt, opponent);
  }
  assert.equal(berserker.bladeAngle, spinningAngle, 'a latched Berserker\'s blades must not turn');

  // Released: the blades turn again.
  advance(berserker, opponent, 0.1);
  assert.notEqual(berserker.bladeAngle, spinningAngle, 'once released the blades turn again');
});
