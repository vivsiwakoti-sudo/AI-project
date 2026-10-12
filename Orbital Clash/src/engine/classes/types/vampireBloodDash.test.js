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

const data = (name, extra = {}) => ({
  name, color: '#fff', health: 150, damage: 15, speed: 3, bodySize: 56,
  attackType: 'Melee', cooldown: 3, description: 'x', shape: 'round', ...extra
});

// Advance a fighter for `seconds` in ~60fps steps against a stationary opponent.
const advance = (fighter, opponent, seconds) => {
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) fighter.update(dt, opponent);
};

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
