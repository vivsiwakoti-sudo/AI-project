import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal audio stub so the classes' constructor/update paths that touch
// audioManager do not throw in a headless run (mirrors the other engine tests).
const param = () => ({ value: 0, setValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
globalThis.window = {
  AudioContext: function () {
    return {
      createGain: () => ({ connect() {}, gain: param() }),
      createOscillator: () => ({ connect() {}, start() {}, stop() {}, frequency: param(), detune: param(), type: '' }),
      createBiquadFilter: () => ({ connect() {}, frequency: param(), Q: param(), type: '' }),
      createBufferSource: () => ({ connect() {}, start() {}, stop() {}, buffer: null, playbackRate: param() }),
      createBuffer: (c, l) => ({ getChannelData: () => new Float32Array(l) }),
      destination: {}, currentTime: 0, state: 'running', sampleRate: 44100, resume() {}
    };
  }
};

const { Grappler } = await import('./Grappler.js');
const { Fireball } = await import('./Fireball.js');
const { Berserker } = await import('./Berserker.js');

const data = (name, extra = {}) => ({
  name, color: '#fff', health: 150, damage: 15, speed: 3, bodySize: 56,
  attackType: 'Melee', cooldown: 3, description: 'x', shape: 'round', ...extra
});

// A stationary victim that can be grappled, with the fields the hook reads.
const victim = (name = 'Fireball') => ({
  name, x: 140, y: 100, radius: 20, health: 500, isDead: false,
  statusEffects: [], vx: 0, vy: 0,
  releasePin() { this.isPinned = false; this.isStuck = false; },
  pauseAttacks(seconds) { this.attackPauseTimer = Math.max(this.attackPauseTimer || 0, seconds); }
});

test('an active grapple pins and pauses the victim', () => {
  const grappler = new Grappler(data('Grappler'), 100, 100);
  const target = victim();

  // In range, so the hook engages on the first frame.
  grappler.update(1 / 60, target);
  assert.ok(grappler.isHookActive, 'the hook engages an in-range target');
  assert.equal(target.isPinned, true, 'the victim is pinned');
  assert.ok(target.attackPauseTimer > 0, 'a grappled victim has its attacks paused');
});

test('the hook cooldown is 8 seconds', async () => {
  // The class reads its cooldown from the fighter definition, so a fighter built
  // with the shipped data must wait 8 seconds between hooks.
  const { FIGHTER_CLASSES } = await import('../../fighterDefinitions.js');
  assert.equal(FIGHTER_CLASSES.Grappler.cooldown, 8, 'the Grappler hook cooldown is 8s');

  const grappler = new Grappler({ ...FIGHTER_CLASSES.Grappler }, 100, 100);
  assert.equal(grappler.cooldownDuration, 8, 'the Grappler adopts the 8s cooldown');
});

test('a pinned Fireball stops firing new projectiles', () => {
  const fireball = new Fireball(data('Fireball'), 100, 100);
  const opponent = { x: 300, y: 100, radius: 20, health: 500, isDead: false, statusEffects: [], vx: 0, vy: 0 };

  // Let it get a volley off first, then hold it paused and confirm the volley
  // counter stops climbing while paused.
  const dt = 1 / 60;
  for (let t = 0; t < 3.2; t += dt) fireball.update(dt, opponent);
  const beforePause = fireball.shotsFired;
  assert.ok(beforePause >= 1, 'the Fireball fires at least one volley unpaused');

  // Simulate the Grappler keeping it pinned: refresh the pause every frame.
  for (let t = 0; t < 5; t += dt) {
    fireball.pauseAttacks(0.1);
    fireball.update(dt, opponent);
  }
  assert.equal(fireball.shotsFired, beforePause, 'no fresh volley may leave a pinned Fireball');

  // Released: the volley timer resumes and fires again.
  for (let t = 0; t < 3.2; t += dt) fireball.update(dt, opponent);
  assert.ok(fireball.shotsFired > beforePause, 'once released it fires again');
});

test('a pinned Berserker stops rotating its blades', () => {
  const berserker = new Berserker(data('Berserker'), 100, 100);
  const opponent = { x: 300, y: 100, radius: 20, health: 500, isDead: false, statusEffects: [], vx: 0, vy: 0 };

  // Spin it up unpaused so the angle is clearly advancing.
  const dt = 1 / 60;
  for (let t = 0; t < 0.5; t += dt) berserker.update(dt, opponent);
  const spinningAngle = berserker.bladeAngle;

  // Hold it pinned for a full second of simulated frames.
  for (let t = 0; t < 1; t += dt) {
    berserker.pauseAttacks(0.1);
    berserker.update(dt, opponent);
  }
  assert.equal(berserker.bladeAngle, spinningAngle, 'a pinned Berserker\'s blades must not turn');

  // Released: the blades turn again.
  for (let t = 0; t < 0.1; t += dt) berserker.update(dt, opponent);
  assert.notEqual(berserker.bladeAngle, spinningAngle, 'once released the blades turn again');
});
