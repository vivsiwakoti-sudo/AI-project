import test from 'node:test';
import assert from 'node:assert/strict';

// A tiny recording canvas stub: every drawing call is counted so we can prove a
// dead fighter paints nothing, without needing a real canvas backend.
const makeCtx = () => {
  const calls = { fill: 0, stroke: 0, fillRect: 0, fillText: 0, ellipse: 0 };
  const noop = () => {};
  const chain = () => makeCtx(); // for createLinearGradient().addColorStop()
  const ctx = {
    calls,
    save: noop, restore: noop, translate: noop, rotate: noop, scale: noop,
    beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop,
    arc: noop, quadraticCurveTo: noop, bezierCurveTo: noop, roundRect: noop,
    ellipse: () => { calls.ellipse++; },
    fill: () => { calls.fill++; },
    stroke: () => { calls.stroke++; },
    fillRect: () => { calls.fillRect++; },
    strokeRect: noop, clearRect: noop, clip: noop, setLineDash: noop,
    fillText: () => { calls.fillText++; },
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    set globalAlpha(v) { this._a = v; },
    get globalAlpha() { return this._a ?? 1; },
    set fillStyle(v) { this._f = v; },
    get fillStyle() { return this._f; },
    shadowBlur: 0, shadowColor: '', lineWidth: 1, lineCap: '', lineJoin: '',
    strokeStyle: '', font: '', textAlign: '', textBaseline: '',
    _unused: chain
  };
  return ctx;
};

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

const { Knight } = await import('./Knight.js');
const { Samurai } = await import('./Samurai.js');
const { Snake } = await import('./Snake.js');
const { Mahoraga } = await import('./Mahoraga.js');
const { Vampire } = await import('./Vampire.js');
const { Duplicator } = await import('./Duplicator.js');

// Drive one frame so timers like swingTimer / parryFlash are live, proving the
// guard suppresses transient feedback too and not just the standing weapon.
const LIVE_OPPONENT = { x: 140, y: 100, radius: 20, health: 100, isDead: false };

const data = (name, extra = {}) => ({
  name, color: '#fff', health: 150, damage: 15, speed: 3, bodySize: 56,
  attackType: 'Melee', cooldown: 0.75, description: 'x', shape: 'round', ...extra
});

const totalPaints = ctx => Object.values(ctx.calls).reduce((a, b) => a + b, 0);

// These classes all draw their weapon / trail AFTER `super.draw(ctx)`, which is
// exactly the bug: FighterBase.draw's own `isDead` guard cannot stop them.
const CASES = [
  ['Knight (spinning greatsword)', () => new Knight(data('Knight'), 100, 100)],
  ['Samurai (katana + red trail)', () => new Samurai(data('Samurai'), 100, 100)],
  ['Snake (poison trail + scales)', () => new Snake(data('Snake'), 100, 100)],
  ['Mahoraga (fist + adaptation wheel)', () => new Mahoraga(data('Mahoraga', { bodySize: 56 }), 100, 100)],
  ['Vampire (blood stake + wings)', () => new Vampire(data('Vampire'), 100, 100)],
  ['Duplicator (clone swarm)', () => new Duplicator(data('Duplicator'), 100, 100)]
];

for (const [label, make] of CASES) {
  test(`${label} draws nothing once dead`, () => {
    const fighter = make();
    fighter.particleSystem = null;
    // Give the class live state (spinning angle, swing arc, trail) so the guard
    // is tested against a fighter that is mid-animation when it dies.
    fighter.update(1 / 60, LIVE_OPPONENT);
    fighter.triggerSwing(fighter.weaponAngle ?? 0, { duration: 0.22, reach: 40 });

    // Alive: it must actually paint, otherwise the assertion below proves nothing.
    const aliveCtx = makeCtx();
    fighter.draw(aliveCtx);
    assert.ok(totalPaints(aliveCtx) > 0, 'a living fighter must paint its weapon');

    // Dead: every drawing call must be skipped.
    fighter.isDead = true;
    fighter.health = 0;
    const deadCtx = makeCtx();
    fighter.draw(deadCtx);

    assert.equal(
      totalPaints(deadCtx), 0,
      `${label} painted ${JSON.stringify(deadCtx.calls)} after death`
    );
  });
}

test('a weapon drawn before the isDead guard is still suppressed by the base class', () => {
  // Regression guard for the mechanism: FighterBase.draw must bail first.
  const knight = new Knight(data('Knight'), 100, 100);
  const ctx = makeCtx();
  knight.isDead = true;
  knight.draw(ctx);
  assert.equal(totalPaints(ctx), 0);
});

test('a rotating weapon whose angle keeps advancing still paints nothing when dead', () => {
  const knight = new Knight(data('Knight'), 100, 100);
  knight.isDead = true;
  knight.health = 0;

  // Simulate several frames of a dead fighter: the arena skips drawing entirely,
  // so the weapon angle advancing must not produce paint.
  for (let i = 0; i < 5; i++) {
    knight.weaponAngle += 0.5;
    const ctx = makeCtx();
    knight.draw(ctx);
    assert.equal(totalPaints(ctx), 0, `frame ${i} painted a dead weapon`);
  }
});