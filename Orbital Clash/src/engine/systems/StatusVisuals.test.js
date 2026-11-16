import test from 'node:test';
import assert from 'node:assert/strict';

import { installTestAudio } from '../audio/testAudioStub.js';
import { FighterBase } from '../classes/FighterBase.js';
import { EffectSystem } from './EffectSystem.js';
import { BOOST_TRAIL_POINTS, activeStatusIcons, drawStatusTrail, drawStatusVisuals, notifyStatusEvent, updateStatusVisuals } from './StatusVisuals.js';

installTestAudio();

const makeFighter = () => new FighterBase({
  name: 'Dummy',
  color: '#fff',
  health: 200,
  damage: 10,
  speed: 5,
  bodySize: 32,
  attackType: 'Melee',
  cooldown: 1,
  description: 'Dummy'
}, 100, 100);

test('a status announces its onset once, not every frame', () => {
  const fighter = makeFighter();
  EffectSystem.addEffect(fighter, { name: 'poison', duration: 5 });

  assert.deepEqual(updateStatusVisuals(fighter, 1 / 60), ['poison']);
  assert.deepEqual(updateStatusVisuals(fighter, 1 / 60), []);
});

test('a timed status icon shows the share of its duration still left', () => {
  const fighter = makeFighter();
  EffectSystem.addEffect(fighter, { name: 'MomentumBoost', duration: 2 });
  updateStatusVisuals(fighter, 0);

  EffectSystem.get(fighter, 'MomentumBoost').duration = 1;
  updateStatusVisuals(fighter, 0);

  const [icon] = activeStatusIcons(fighter);
  assert.equal(icon.name, 'boost');
  assert.equal(icon.fraction, 0.5);
});

test('each burn stack raises the count on the burn icon', () => {
  const fighter = makeFighter();
  EffectSystem.addEffect(fighter, { name: 'burn-1', duration: 5 });
  EffectSystem.addEffect(fighter, { name: 'burn-2', duration: 5 });
  updateStatusVisuals(fighter, 0);

  const [icon] = activeStatusIcons(fighter);
  assert.equal(icon.name, 'burn');
  assert.equal(icon.stacks, 2);
});

test('an instant heal flashes an icon briefly and then clears', () => {
  const fighter = makeFighter();
  updateStatusVisuals(fighter, 0);
  notifyStatusEvent(fighter, 'heal');
  assert.deepEqual(activeStatusIcons(fighter).map(icon => icon.name), ['heal']);

  updateStatusVisuals(fighter, 0.9);
  assert.deepEqual(activeStatusIcons(fighter), []);
});

test('a pinned fighter shows the stun status with its pin timer', () => {
  const fighter = makeFighter();
  fighter.isPinned = true;
  fighter.pinTimer = 2;
  updateStatusVisuals(fighter, 0);

  const [icon] = activeStatusIcons(fighter);
  assert.equal(icon.name, 'stun');
  assert.equal(icon.fraction, 1);
});

test('momentum boost keeps a longer trail that shrinks back when it ends', () => {
  const fighter = makeFighter();
  fighter.vx = 2;
  fighter.vy = 0;
  EffectSystem.addEffect(fighter, { name: 'MomentumBoost', duration: 5 });
  for (let i = 0; i < 40; i++) fighter.tickDeflection(1 / 60);
  assert.equal(fighter.trailPoints.length, BOOST_TRAIL_POINTS);

  EffectSystem.removeEffects(fighter, effect => effect.name === 'MomentumBoost');
  fighter.tickDeflection(1 / 60);
  assert.equal(fighter.trailPoints.length, 8);
});

// Accepts any canvas call or property access, so the draw path runs without a real canvas.
const stubContext = () => {
  const ctx = new Proxy(function () {}, {
    get: (_, prop) => (prop === Symbol.toPrimitive ? () => 0 : ctx),
    apply: () => ctx,
    set: () => true
  });
  return ctx;
};

test('every status draws without error on a canvas context', () => {
  const fighter = makeFighter();
  fighter.isStunned = true;
  fighter.stunTimer = 2;
  fighter.isFrozen = true;
  EffectSystem.addEffect(fighter, { name: 'freeze', duration: 2 });
  EffectSystem.addEffect(fighter, { name: 'burn-1', duration: 3 });
  EffectSystem.addEffect(fighter, { name: 'poison', duration: 3 });
  EffectSystem.addEffect(fighter, { name: 'MomentumBoost', duration: 3 });
  fighter.vx = 2;
  updateStatusVisuals(fighter, 0);
  notifyStatusEvent(fighter, 'heal');
  notifyStatusEvent(fighter, 'percent');
  const ctx = stubContext();

  assert.doesNotThrow(() => {
    drawStatusTrail(ctx, fighter);
    drawStatusVisuals(ctx, fighter);
  });
});
