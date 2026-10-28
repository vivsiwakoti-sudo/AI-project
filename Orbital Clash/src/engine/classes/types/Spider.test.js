import test from 'node:test';
import assert from 'node:assert/strict';

import { FighterBase } from '../FighterBase.js';
import { Spider } from './Spider.js';
import { EffectSystem } from '../../systems/EffectSystem.js';
import { installTestAudio } from '../../audio/testAudioStub.js';

installTestAudio();

test('Spider lays webs where it moves instead of shooting them', () => {
  const spider = new Spider({
    name: 'Spider',
    color: '#7CFF6B',
    health: 85,
    damage: 5,
    speed: 5,
    bodySize: 36,
    attackType: 'Area',
    cooldown: 4,
    description: 'Lays webs to slow and damage.'
  }, 100, 100);

  const target = new FighterBase({
    name: 'Dummy',
    color: '#fff',
    health: 100,
    damage: 10,
    speed: 8,
    bodySize: 20,
    attackType: 'Melee',
    cooldown: 0,
    description: 'Dummy'
  }, 700, 100); // far away so no damage/effects interfere

  // Move the spider and step the sim; webs should appear along its path.
  spider.vx = 1; spider.vy = 0;
  for (let i = 0; i < 30; i++) {
    spider.update(1 / 60, target);
  }

  assert.ok(spider.webs.length > 0, 'Spider should leave webs behind as it moves');
  assert.equal(spider.webProjectiles, undefined, 'Spider should no longer shoot projectiles');
});

test('A web bites once for 3 damage and is then spent', () => {
  const spider = new Spider({
    name: 'Spider',
    color: '#7CFF6B',
    health: 85,
    damage: 5,
    speed: 5,
    bodySize: 36,
    attackType: 'Area',
    cooldown: 4,
    description: 'Lays webs to slow and damage.'
  }, 100, 100);

  const target = new FighterBase({
    name: 'Dummy',
    color: '#fff',
    health: 100,
    damage: 10,
    speed: 8,
    bodySize: 20,
    attackType: 'Melee',
    cooldown: 0,
    description: 'Dummy'
  }, 700, 100);

  // A single web sitting where the target will stand.
  spider.createWeb(700, 100);
  const startHealth = target.health;

  // First frame inside the web: exactly 3 damage from the touch bite.
  spider.update(1 / 60, target);
  const afterTouch = startHealth - target.health;
  assert.equal(afterTouch, 3, `touch should deal exactly 3 damage, dealt ${afterTouch}`);
  assert.equal(spider.webs.some(w => w.x === 700 && w.y === 100), false, 'a touched web should be spent');

  // Staying inside afterwards must not bite again.
  for (let i = 0; i < 90; i++) spider.update(1 / 60, target);
  assert.equal(startHealth - target.health, 3, 'a spent web should not keep biting');
});

test('Re-entering a spent web does not bite; a fresh web does', () => {
  const spider = new Spider({
    name: 'Spider',
    color: '#7CFF6B',
    health: 85,
    damage: 5,
    speed: 5,
    bodySize: 36,
    attackType: 'Area',
    cooldown: 4,
    description: 'Lays webs to slow and damage.'
  }, 100, 100);

  const target = new FighterBase({
    name: 'Dummy',
    color: '#fff',
    health: 100,
    damage: 10,
    speed: 8,
    bodySize: 20,
    attackType: 'Melee',
    cooldown: 0,
    description: 'Dummy'
  }, 700, 100);

  spider.createWeb(700, 100);
  spider.update(1 / 60, target);       // enters -> 3 touch damage, web spent
  target.x = 2000;                      // steps out
  spider.update(1 / 60, target);
  target.x = 700;                       // steps back in onto the spent web
  spider.update(1 / 60, target);
  assert.equal(100 - target.health, 3, 'a spent web must not bite on re-entry');

  spider.createWeb(700, 100);           // a freshly laid web bites again
  spider.update(1 / 60, target);
  assert.equal(100 - target.health, 6, 'each fresh web should bite once');
});

test('Web slow effects apply a 60% movement reduction', () => {
  const fighter = new FighterBase({
    name: 'Dummy',
    color: '#fff',
    health: 100,
    damage: 10,
    speed: 10,
    bodySize: 20,
    attackType: 'Melee',
    cooldown: 0,
    description: 'Dummy'
  }, 0, 0);

  EffectSystem.addEffect(fighter, { name: 'slow', duration: 2, multiplier: 0.4 });
  fighter.vx = 1; fighter.vy = 0;

  fighter.update(1, { x: 1000, y: 0, radius: 10, health: 100, speed: 10, statusEffects: [], isDead: false, die() {} });

  assert.ok(Math.abs(fighter.x - 240) < 1, 'Slow effect should reduce movement by 60%');
});

const dummy = (x, y) => new FighterBase({
  name: 'Dummy',
  color: '#fff',
  health: 1000,
  damage: 10,
  speed: 8,
  bodySize: 20,
  attackType: 'Melee',
  cooldown: 0,
  description: 'Dummy'
}, x, y);

const spiderAt = (x, y) => new Spider({
  name: 'Spider',
  color: '#7CFF6B',
  health: 85,
  damage: 5,
  speed: 5,
  bodySize: 36,
  attackType: 'Area',
  cooldown: 4,
  description: 'Lays webs to slow and damage.'
}, x, y);

test('An untouched web fades after 25 seconds', () => {
  const spider = spiderAt(100, 100);
  const target = dummy(2000, 100); // far away, never touches the web
  spider.dropTimer = 1000;         // stop the spider from laying more webs
  spider.createWeb(700, 100);

  for (let i = 0; i < 24 * 60; i++) spider.update(1 / 60, target);
  assert.equal(spider.webs.length, 1, 'the web should still be standing at 24 seconds');

  for (let i = 0; i < 2 * 60; i++) spider.update(1 / 60, target);
  assert.equal(spider.webs.length, 0, 'the web should be gone after 25 seconds');
});

test('Each touched web adds a permanent 5% slow that stacks', () => {
  const spider = spiderAt(100, 100);
  const target = dummy(700, 100);
  spider.dropTimer = 1000;

  spider.createWeb(700, 100);
  spider.update(1 / 60, target);
  assert.ok(Math.abs(EffectSystem.slowMultiplier(target) - 0.4 * 0.95) < 1e-9, 'one web: 60% slow times 5% weave');

  spider.createWeb(700, 100);
  spider.update(1 / 60, target);
  assert.ok(Math.abs(EffectSystem.slowMultiplier(target) - 0.4 * 0.9) < 1e-9, 'two webs: 60% slow times 10% weave');
});

test('The 5% weave outlasts the 2 second web slow', () => {
  const spider = spiderAt(100, 100);
  const target = dummy(700, 100);
  spider.dropTimer = 1000;

  spider.createWeb(700, 100);
  spider.update(1 / 60, target);
  spider.createWeb(700, 100);
  spider.update(1 / 60, target);

  for (let i = 0; i < 3 * 60; i++) {
    spider.update(1 / 60, target);
    EffectSystem.updateEffects(target, 1 / 60);
  }

  assert.ok(Math.abs(EffectSystem.slowMultiplier(target) - 0.9) < 1e-9, 'the 10% weave should remain');
});

test('Stacked web slow never drops below a full stop', () => {
  const spider = spiderAt(100, 100);
  const target = dummy(700, 100);
  spider.dropTimer = 1000;

  for (let i = 0; i < 25; i++) {
    spider.createWeb(700, 100);
    spider.update(1 / 60, target);
  }
  assert.equal(EffectSystem.slowMultiplier(target), 0);
});
