import test from 'node:test';
import assert from 'node:assert/strict';

import { FighterBase } from '../FighterBase.js';
import { Spider } from './Spider.js';
import { EffectSystem } from '../../systems/EffectSystem.js';

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

test('Web bites for 1 damage on touch then 1 damage per second', () => {
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

  // First frame inside the web: exactly 1 damage from the touch bite.
  spider.update(1 / 60, target);
  const afterTouch = startHealth - target.health;
  assert.equal(afterTouch, 1, `touch should deal exactly 1 damage, dealt ${afterTouch}`);

  // A further 1.5s inside should add 1-2 damage (1/sec), not the old 5 per tick.
  for (let i = 0; i < 90; i++) spider.update(1 / 60, target);
  const total = startHealth - target.health;
  assert.ok(total >= 2 && total <= 3, `1.5s in the web should total ~2-3 damage, got ${total}`);
});

test('Leaving a web lets it bite again on re-entry', () => {
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
  spider.update(1 / 60, target);       // enters -> 1 touch damage
  target.x = 2000;                      // steps out
  spider.update(1 / 60, target);
  target.x = 700;                       // steps back in
  spider.update(1 / 60, target);

  assert.equal(spider.webs[0].touched, true, 'web should register the fresh touch');
  assert.equal(100 - target.health, 2, 'two separate touches should deal 2 total');
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
