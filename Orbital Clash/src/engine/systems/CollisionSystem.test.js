import test from 'node:test';
import assert from 'node:assert/strict';

import { CollisionSystem } from './CollisionSystem.js';

const ARENA_SIZE = 800;
const INNER_BOUNDARY = 20;
const RIGHT_WALL = ARENA_SIZE - INNER_BOUNDARY;

// Minimal stand-in for a fighter: a body circle with an optional wallMargin and
// the velocity fields resolveFighterWall / _reflectVelocity read.
const makeFighter = (overrides = {}) => ({
  x: 400,
  y: 400,
  vx: 1,
  vy: 0,
  speed: 5,
  radius: 20,
  wallMargin: 0,
  ...overrides
});

test('a fighter with no wallMargin bounces with its BODY touching the border', () => {
  const fighter = makeFighter({ x: 900 });

  CollisionSystem.resolveFighterWall(fighter, ARENA_SIZE);

  assert.equal(fighter.x, RIGHT_WALL - fighter.radius);
  assert.equal(CollisionSystem.visualMargin(fighter), 0);
});

test('a visualMargin holds back only the weapon overhang, not a whole weapon length', () => {
  // Knight: bodySize 56 (radius 28) and a shield dome of radius + 10.
  const knight = makeFighter({ x: 900, radius: 28, wallMargin: 10 });
  CollisionSystem.resolveFighterWall(knight, ARENA_SIZE);

  // The body edge may reach inside the border by its margin, but no further: the
  // centre must sit within one body radius of the wall, not a blade length away.
  const bodyEdge = knight.x + knight.radius;
  assert.ok(bodyEdge > RIGHT_WALL - 20, `body stopped ${RIGHT_WALL - bodyEdge}px short of the border`);
  assert.equal(knight.x, RIGHT_WALL - knight.radius - 10);
});

test('the margin a class reports never exceeds what its body can absorb', () => {
  // Guards the regression directly: a margin larger than the body radius means
  // the fighter deflects off empty space, a full body-width from the border.
  const mahoraga = { radius: 23, wallMargin: 0 };
  // Mahoraga's wheel overhang: radius + 22 + wheelRadius - radius, minus radius.
  const wheelRadius = 23 * 0.72;
  const wheelOverhang = 23 + 22 + wheelRadius - 23;
  mahoraga.wallMargin = Math.max(0, wheelOverhang - 23);

  assert.ok(
    mahoraga.wallMargin < mahoraga.radius,
    `wallMargin ${mahoraga.wallMargin} must stay below the body radius ${mahoraga.radius}`
  );
});

test('a wallMargin that clips past the border is clamped into the arena', () => {
  // Even with an oversized margin the fighter must stay a legal distance inside,
  // and the clamp must not flip it to the far side of the arena.
  const fighter = makeFighter({ x: 900, radius: 20, wallMargin: 200 });
  CollisionSystem.resolveFighterWall(fighter, ARENA_SIZE);

  assert.equal(fighter.x, RIGHT_WALL - 20 - 200);
  assert.ok(fighter.x > INNER_BOUNDARY);
  assert.ok(fighter.x < ARENA_SIZE - INNER_BOUNDARY);
});

test('a cleared margin lets the body reach the border again', () => {
  const fighter = makeFighter({ x: 400, radius: 28, wallMargin: 10 });
  CollisionSystem.resolveFighterWall(fighter, ARENA_SIZE);
  assert.equal(fighter.x, 400);

  const freed = makeFighter({ x: 900, radius: 28, wallMargin: 0 });
  CollisionSystem.resolveFighterWall(freed, ARENA_SIZE);
  assert.equal(freed.x, RIGHT_WALL - 28);
});