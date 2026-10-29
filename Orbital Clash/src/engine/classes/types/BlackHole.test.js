import test from 'node:test';
import assert from 'node:assert/strict';

import { FighterBase } from '../FighterBase.js';
import { Projectile } from '../Projectile.js';
import { BlackHole } from './BlackHole.js';
import { installTestAudio } from '../../audio/testAudioStub.js';

installTestAudio();

const stats = (name) => ({
  name,
  color: '#fff',
  health: 100,
  damage: 10,
  speed: 6,
  bodySize: 40,
  attackType: 'Ranged',
  cooldown: 4,
  description: name
});

// Fires a singularity into the left wall so it collapses on the inset edge.
const collapseAtLeftWall = (blackHole) => {
  blackHole.cooldownTimer = 99; // stop the black hole launching its own shots
  blackHole.projectiles.push(new Projectile(21, 400, -1, 0, 0, blackHole));
  blackHole.update(1 / 60, null);
};

test('A singularity that reaches the wall opens a hole on the inset edge', () => {
  const blackHole = new BlackHole(stats('Black Hole'), 400, 400);

  collapseAtLeftWall(blackHole);

  assert.ok(blackHole.activeHole, 'the wall strike should open an event horizon');
  assert.equal(blackHole.activeHole.x, 20, 'the hole should be clamped to the wall inset');
  assert.equal(blackHole.activeHole.y, 400);
  assert.equal(blackHole.projectiles.length, 0, 'the singularity should be consumed');
});

test('Fighters caught by the opening blast take exactly 3 ticks of 5', () => {
  const blackHole = new BlackHole(stats('Black Hole'), 400, 400);
  const near = new FighterBase(stats('Near'), 170, 400); // 150px from the hole
  const far = new FighterBase(stats('Far'), 270, 400);   // 250px from the hole
  // Fighters spawn with a random drift, so start both from rest to read the pull.
  [near, far].forEach(f => { f.vx = 0; f.vy = 0; });
  blackHole.victims = [near, far];

  collapseAtLeftWall(blackHole);
  blackHole.update(0.05, null);
  assert.equal(near.totalDamageTaken, 5, 'the first tick lands the moment the hole opens');

  for (let i = 0; i < 40; i++) blackHole.update(0.05, null);

  assert.equal(near.isPulledIn, false, 'the pull flag is cleared once the hole has collapsed');
  assert.equal(near.totalDamageTaken, 15, 'always three ticks of 5, never more');
  assert.equal(far.isPulledIn, false, 'a fighter 250px away should be outside the pull');
  assert.equal(far.vx, 0);
  assert.equal(far.totalDamageTaken, 0, 'a fighter outside the pull should take no damage');
});

test('The opening blast still finishes its 3 ticks if the victim leaves the hole', () => {
  const blackHole = new BlackHole(stats('Black Hole'), 400, 400);
  const near = new FighterBase(stats('Near'), 170, 400);
  near.vx = 0; near.vy = 0;
  blackHole.victims = [near];

  collapseAtLeftWall(blackHole);
  blackHole.update(0.05, null); // first tick
  near.x = 600;                 // gone, well outside the 200px pull
  for (let i = 0; i < 40; i++) blackHole.update(0.05, null);

  assert.equal(near.totalDamageTaken, 15, 'all three ticks still land');
});

test('Anyone caught after the opening blast takes 10 once and is sent outwards', () => {
  const blackHole = new BlackHole(stats('Black Hole'), 400, 400);
  const late = new FighterBase(stats('Late'), 270, 400); // starts 250px out
  late.vx = 0; late.vy = 0;
  blackHole.victims = [late];

  collapseAtLeftWall(blackHole);
  for (let i = 0; i < 8; i++) blackHole.update(0.05, null); // 0.4s: the blast is over
  assert.equal(late.totalDamageTaken, 0, 'nothing happens while it stays outside');

  late.x = 170; // wanders in, 150px from the hole
  blackHole.update(0.05, null);

  assert.equal(late.totalDamageTaken, 10, 'a late catch takes a single 10 damage hit');
  assert.ok(late.vx > 0, 'it is sent outwards, away from the hole in the left wall');
  assert.equal(late.isPulledIn, false, 'and is not dragged back in');

  for (let i = 0; i < 30; i++) blackHole.update(0.05, null);
  assert.equal(late.totalDamageTaken, 10, 'it is never hit again by the same hole');
  assert.ok(late.vx > 0, 'the pull does not turn it back around');
});

test('A fighter already hit by the opening blast is not also thrown out later', () => {
  const blackHole = new BlackHole(stats('Black Hole'), 400, 400);
  const caught = new FighterBase(stats('Caught'), 170, 400);
  caught.vx = 0; caught.vy = 0;
  blackHole.victims = [caught];

  collapseAtLeftWall(blackHole);
  for (let i = 0; i < 20; i++) blackHole.update(0.05, null);

  assert.equal(caught.totalDamageTaken, 15, 'only the opening blast ticks, no extra 10');
  assert.ok(caught.vx < 0, 'it stays in the pull toward the hole');
});

test('Each new event horizon can damage the same fighter again', () => {
  const blackHole = new BlackHole(stats('Black Hole'), 400, 400);
  const near = new FighterBase(stats('Near'), 170, 400);
  blackHole.victims = [near];

  collapseAtLeftWall(blackHole);
  for (let i = 0; i < 40; i++) blackHole.update(0.05, null); // 2s clears the 1.8s hole

  assert.equal(blackHole.activeHole, null, 'the first hole should collapse');
  assert.equal(near.totalDamageTaken, 15);

  near.x = 170; near.y = 400;
  collapseAtLeftWall(blackHole);
  for (let i = 0; i < 20; i++) blackHole.update(0.05, null);

  assert.equal(near.totalDamageTaken, 30, 'a second hole should hit the fighter with a fresh 3 ticks');
});
