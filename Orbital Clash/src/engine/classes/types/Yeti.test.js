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

const { Yeti } = await import('./Yeti.js');
const { FighterBase } = await import('../FighterBase.js');
const { audioManager } = await import('../../audio/AudioManager.js');

// speed 0 keeps both fighters pinned where the test puts them.
const data = (name, extra = {}) => ({
  name, color: '#fff', health: 150, damage: 15, speed: 0, bodySize: 40,
  attackType: 'Melee', cooldown: 3, description: 'x', shape: 'round', ...extra
});

const advance = (fighter, opponent, seconds) => {
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) fighter.update(dt, opponent);
};

const withRandom = (value, fn) => {
  const original = Math.random;
  Math.random = () => value;
  try { return fn(); } finally { Math.random = original; }
};

test('the leap interval is rolled between 5 and 10 seconds', () => {
  const low = withRandom(0, () => new Yeti(data('Yeti', { bodySize: 52 }), 0, 0));
  const high = withRandom(0.999999, () => new Yeti(data('Yeti', { bodySize: 52 }), 0, 0));
  assert.ok(Math.abs(low.cooldown - 5) < 1e-6, `min interval is 5s, got ${low.cooldown}`);
  assert.ok(Math.abs(high.cooldown - 10) < 1e-3, `max interval is 10s, got ${high.cooldown}`);
});

test('the Yeti waits a full interval before its first leap', () => {
  const yeti = withRandom(0.5, () => new Yeti(data('Yeti'), 100, 100));
  const opponent = new FighterBase(data('Opponent'), 400, 100);

  assert.equal(yeti.cooldown, 7.5);
  advance(yeti, opponent, 7.2);
  assert.equal(yeti.leapState, 'idle', 'no leap before the interval has passed');
  advance(yeti, opponent, 0.6);
  assert.equal(yeti.leapState, 'leap', 'leaps once the interval has passed');
});

test('a landed leap slams for 10 AoE damage and resets the interval', () => {
  const yeti = withRandom(0.5, () => new Yeti(data('Yeti'), 100, 100));
  yeti.cooldownTimer = 0;
  const victim = new FighterBase(data('Victim'), 140, 100);
  const before = victim.health;

  yeti.update(1 / 60, victim); // launch
  assert.equal(yeti.leapState, 'leap');
  yeti.update(1 / 60, victim); // in contact -> slam

  assert.equal(yeti.leapState, 'idle');
  assert.equal(victim.health, before - 10, 'slam deals 10 damage');
  assert.ok(yeti.cooldownTimer > 0, 'the next leap is on a fresh interval');
});

test('a leap heads toward the launch position without following a moving opponent', () => {
  const yeti = withRandom(0.5, () => new Yeti(data('Yeti', { speed: 1 }), 100, 100));
  const victim = new FighterBase(data('Victim'), 250, 100);
  yeti.cooldownTimer = 0;
  yeti.vx = 0;
  yeti.vy = 1;

  yeti.update(1 / 60, victim);
  assert.ok(yeti.x > 100, 'the leap starts toward the opponent immediately');
  assert.equal(yeti.y, 100);
  victim.y = 350;

  while (yeti.leapState === 'leap') {
    yeti.update(1 / 60, victim);
    if (yeti.leapState === 'leap') assert.equal(yeti.y, 100);
  }
  assert.ok(yeti.x > 220, 'the Yeti reaches the original target position');
  assert.equal(victim.health, 150, 'an opponent that moved away avoids the slam');
});

test('the 175-pixel slam radius hits fighters at its edge but not beyond it', () => {
  const yeti = new Yeti(data('Yeti'), 100, 100);
  const atEdge = new FighterBase(data('At edge'), 295, 100);
  const outside = new FighterBase(data('Outside'), 295.01, 100);
  yeti.victims = [atEdge, outside];

  withRandom(0.9, () => yeti.slam(atEdge));

  assert.equal(atEdge.health, 140);
  assert.equal(outside.health, 150);
});

test('each enemy struck rolls its own 25% freeze', () => {
  const yeti = withRandom(0.5, () => new Yeti(data('Yeti'), 100, 100));
  const frozen = new FighterBase(data('Frozen'), 130, 100);
  const spared = new FighterBase(data('Spared'), 70, 100);

  withRandom(0.1, () => yeti.slam(frozen));
  withRandom(0.9, () => yeti.slam(spared));

  assert.equal(frozen.isFrozen, true, 'a roll under 0.25 freezes the victim');
  assert.ok(frozen.attackPauseTimer >= 2 - 1e-9, 'a frozen victim cannot attack for 2 seconds');
  assert.ok(!spared.isFrozen, 'a roll over 0.25 does not freeze');
});

test('a freeze ends after 2 seconds', () => {
  const yeti = withRandom(0.5, () => new Yeti(data('Yeti'), 100, 100));
  const victim = new FighterBase(data('Victim'), 130, 100);
  withRandom(0.1, () => yeti.slam(victim));
  assert.equal(victim.isFrozen, true);

  advance(victim, yeti, 2.1);
  assert.equal(victim.isFrozen, false, 'the ice block melts after 2 seconds');
});

test('a leaping Yeti swells and lifts at the middle of its arc, with no ground marker; an idle one does neither', () => {
  const recordingCtx = () => {
    const calls = [];
    const ctx = new Proxy({}, {
      get: (_t, key) => (...args) => { calls.push([key, ...args]); return ctx; },
      set: () => true
    });
    return { ctx, calls };
  };

  const yeti = withRandom(0.5, () => new Yeti(data('Yeti'), 100, 100));
  const idle = recordingCtx();
  yeti.draw(idle.ctx);
  assert.equal(idle.calls.some(([k]) => k === 'setLineDash'), false, 'no slam marker while idle');
  assert.equal(idle.calls.some(([k, sx]) => k === 'scale' && sx === 2.2), false, 'no growth while idle');

  yeti.leapState = 'leap';
  yeti.leapProgress = 0.5;
  const mid = recordingCtx();
  yeti.draw(mid.ctx);
  assert.equal(mid.calls.some(([k]) => k === 'setLineDash'), false, 'no slam marker mid-leap');
  assert.equal(mid.calls.some(([k, sx]) => k === 'scale' && sx === 2.2), true, 'body swells to 2.2x at the middle of the arc');
  assert.equal(mid.calls.some(([k, x, y]) => k === 'translate' && x === 100 && y === 100 - 22), true, 'body is lifted at the middle of the arc');
});

test('a slam shatters the ice and plays the slam sound', () => {
  const yeti = withRandom(0.5, () => new Yeti(data('Yeti'), 100, 100));
  const shatters = [];
  let slamSounds = 0;
  yeti.particleSystem = {
    ring() { },
    emit() { },
    shatter: (...args) => shatters.push(args)
  };
  const originalSlamSfx = audioManager.playSlamSfx;
  audioManager.playSlamSfx = () => { slamSounds += 1; };
  try {
    yeti.slam(new FighterBase(data('Victim'), 300, 100));
  } finally {
    audioManager.playSlamSfx = originalSlamSfx;
  }

  assert.equal(shatters.length, 1, 'one shatter burst per slam');
  assert.equal(shatters[0][0], 100);
  assert.equal(shatters[0][1], 100);
  assert.equal(shatters[0][3].radius, 175, 'the break spreads across the 175px slam radius');
  assert.equal(slamSounds, 1, 'the slam sound plays once');
});


test('a frozen Yeti cancels its leap without slamming', () => {
  const yeti = withRandom(0.5, () => new Yeti(data('Yeti'), 100, 100));
  yeti.cooldownTimer = 0;
  const victim = new FighterBase(data('Victim'), 300, 100);
  const before = victim.health;

  yeti.update(1 / 60, victim); // launch
  assert.equal(yeti.leapState, 'leap');
  yeti.isFrozen = true;
  yeti.update(1 / 60, victim);

  assert.equal(yeti.leapState, 'idle', 'the leap is cancelled');
  assert.equal(victim.health, before, 'no slam lands');
});
