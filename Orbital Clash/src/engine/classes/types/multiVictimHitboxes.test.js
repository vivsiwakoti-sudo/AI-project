import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal audio stub so the constructor/update paths do not throw headless.
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

const { IceSword } = await import('./IceSword.js');
const { Ninja } = await import('./Ninja.js');

const data = (name, extra = {}) => ({
  name, color: '#fff', health: 150, damage: 15, speed: 3, bodySize: 56,
  attackType: 'Melee', cooldown: 3, description: 'x', shape: 'round', ...extra
});

const fighter = (name, x, y, radius = 20) => ({
  name, x, y, radius, health: 500, maxHealth: 500, isDead: false,
  statusEffects: [], vx: 0, vy: 0
});

test('an Ice Sword blade connects with a bystander the arena did not pick', () => {
  const blade = new IceSword(data('Ice Sword'), 100, 100);
  const far = fighter('Far', 700, 700);
  // At angle 0 the blade tip sits straight out along +x from the body edge.
  const bystander = fighter('Bystander', 100 + blade.radius + 78.75, 100);
  blade.victims = [far, bystander];

  blade.update(0, far);

  assert.ok(bystander.health < 500, 'the blade hits the fighter its tip touches');
  assert.equal(far.health, 500, 'the arena-picked opponent was not touched');
});

test('a Ninja dart catches the first fighter its line crosses', () => {
  const ninja = new Ninja(data('Ninja'), 100, 100);
  const far = fighter('Far', 300, 100);
  // Sits on the dart's flight line, well inside the 300px range.
  const bystander = fighter('Bystander', 120, 100);
  ninja.victims = [far, bystander];

  ninja.update(1 / 60, far);

  assert.ok(ninja.ropeDart?.hit, 'the dart connects');
  assert.equal(ninja.ropeDart.target, bystander, 'the dart holds the fighter it caught');
  assert.ok(bystander.health < 500, 'the caught fighter takes the dart damage');
});
