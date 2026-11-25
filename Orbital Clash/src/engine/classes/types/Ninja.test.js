import test from 'node:test';
import assert from 'node:assert/strict';

import { FighterBase } from '../FighterBase.js';
import { Ninja } from './Ninja.js';
import { installTestAudio } from '../../audio/testAudioStub.js';

installTestAudio();

const makeDummy = (x, y) => new FighterBase({
  name: 'Dummy',
  color: '#fff',
  health: 500,
  damage: 10,
  speed: 6,
  bodySize: 32,
  attackType: 'Melee',
  cooldown: 0,
  description: 'Dummy'
}, x, y);

const makeNinja = () => new Ninja({
  name: 'Ninja',
  color: '#808080',
  health: 90,
  damage: 15,
  speed: 6,
  bodySize: 38,
  attackType: 'Rope-dart',
  cooldown: 6,
  description: 'Ninja'
}, 100, 100);

// Fires the dart at a target and steps the sim until the dart connects.
function landDart(ninja, target) {
  ninja.cooldownTimer = 0;
  // Step until the dart exists and has hit (or a safety cap).
  for (let i = 0; i < 120; i++) {
    ninja.update(1 / 60, target);
    if (ninja.ropeDart && ninja.ropeDart.hit) return true;
  }
  return false;
}

test('Ninja dart launches fast', () => {
  const ninja = makeNinja();
  const target = makeDummy(360, 100);

  ninja.cooldownTimer = 0;
  ninja.update(1 / 60, target);

  assert.ok(ninja.ropeDart, 'the dart should have been fired');
  const launchedSpeed = Math.hypot(ninja.ropeDart.vx, ninja.ropeDart.vy);
  assert.ok(launchedSpeed >= 13.9, `dart launch speed should be at least 13.9 px/frame, got ${launchedSpeed}`);
});

test('Victim keeps meaningful speed after the rope dart releases', () => {
  const ninja = makeNinja();
  // Put the target moving at full tilt toward the ninja so it has real momentum.
  const target = makeDummy(360, 100);
  target.vx = -0.8;
  target.vy = 0.25;

  assert.ok(landDart(ninja, target), 'the dart should connect');

  // Run the pull out to its release.
  for (let i = 0; i < 120 && ninja.ropeDart; i++) {
    ninja.update(1 / 60, target);
  }

  const releaseSpeed = Math.hypot(target.vx, target.vy);
  assert.ok(releaseSpeed > 0.9, `victim should not be left crawling after release, got ${releaseSpeed}`);
  // And it should never be flung faster than a sane top speed.
  assert.ok(releaseSpeed <= 1.45, `release speed should stay capped, got ${releaseSpeed}`);
});

test('Victim is freed (rope released) so it can move again', () => {
  const ninja = makeNinja();
  const target = makeDummy(360, 100);
  target.vx = -0.6;
  target.vy = 0;

  assert.ok(landDart(ninja, target));
  for (let i = 0; i < 200 && ninja.ropeDart; i++) {
    ninja.update(1 / 60, target);
  }

  assert.equal(ninja.ropeActive, false, 'rope should be inactive after release');
  assert.equal(ninja.ropeDart, null, 'dart should be cleared after release');
  assert.ok(Math.hypot(target.vx, target.vy) > 0.9, 'victim velocity should be restored, not zeroed');
});

test('Electric shock chains to a nearby fighter but not a distant one', () => {
  const ninja = makeNinja();
  ninja.setFixedEffect('electric');
  const target = makeDummy(360, 100);
  const near = makeDummy(460, 100);
  const far = makeDummy(900, 100);
  ninja.victims = [target, near, far];

  assert.ok(landDart(ninja, target));
  assert.equal(near.health, 500 - 3, 'the nearby fighter should take chain damage');
  assert.equal(far.health, 500, 'a fighter outside chain range should be untouched');
});

test('Electric chain stops after two jumps', () => {
  const ninja = makeNinja();
  ninja.setFixedEffect('electric');
  const target = makeDummy(360, 100);
  const first = makeDummy(460, 100);
  const second = makeDummy(560, 100);
  const third = makeDummy(660, 100);
  ninja.victims = [target, first, second, third];

  assert.ok(landDart(ninja, target));
  assert.equal(first.health, 500 - 3, 'first jump should hit');
  assert.equal(second.health, 500 - 3, 'second jump should hit');
  assert.equal(third.health, 500, 'a third jump should not happen');
});

