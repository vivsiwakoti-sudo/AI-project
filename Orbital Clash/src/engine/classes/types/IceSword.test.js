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

const { IceSword } = await import('./IceSword.js');
const { FighterBase } = await import('../FighterBase.js');

const SWORD_LENGTH = 78.75;

const data = (name, extra = {}) => ({
  name, color: '#fff', health: 100, damage: 10, speed: 0, bodySize: 40,
  attackType: 'Melee', cooldown: 0.25, description: 'x', shape: 'round', ...extra
});

const withRandom = (value, fn) => {
  const original = Math.random;
  Math.random = () => value;
  try { return fn(); } finally { Math.random = original; }
};

// Puts the opponent exactly where the blade tip is at angle 0, then swings once.
const strikeOnce = (randomValue) => {
  const sword = new IceSword(data('Ice Sword'), 100, 100);
  sword.swordAngle = 0;
  const tipX = sword.x + sword.radius + SWORD_LENGTH;
  const opponent = new FighterBase(data('Opponent', { bodySize: 56 }), tipX, sword.y);
  withRandom(randomValue, () => sword.update(0, opponent));
  return opponent;
};

test('an Ice Sword hit has a 25% chance to freeze the victim', () => {
  const frozen = strikeOnce(0.1);
  assert.equal(frozen.isFrozen, true, 'a roll under 0.25 freezes the victim');
  assert.ok(frozen.attackPauseTimer >= 2 - 1e-9, 'a frozen victim cannot attack for 2 seconds');

  const spared = strikeOnce(0.9);
  assert.ok(!spared.isFrozen, 'a roll over 0.25 does not freeze');
});

test('an Ice Sword hit still slows the victim', () => {
  const victim = strikeOnce(0.9);
  assert.equal(victim.statusEffects.some(effect => effect.name === 'slow'), true);
  assert.equal(victim.health < 100, true, 'the hit still lands for damage');
});

test('a paused Ice Sword does not start its attack cooldown', () => {
  const sword = new IceSword(data('Ice Sword'), 100, 100);
  const victim = new FighterBase(data('Victim'), 140, 100);
  sword.swordAngle = 0;
  sword.cooldownTimer = 0;
  sword.pauseAttacks(1);

  sword.update(0, victim);

  assert.equal(sword.cooldownTimer, 0);
  assert.equal(victim.health, 100);
});
