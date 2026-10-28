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

test('Fighters within 200px are pulled in and take 10 damage once', () => {
  const blackHole = new BlackHole(stats('Black Hole'), 400, 400);
  const near = new FighterBase(stats('Near'), 170, 400); // 150px from the hole
  const far = new FighterBase(stats('Far'), 270, 400);   // 250px from the hole
  // Fighters spawn with a random drift, so start both from rest to read the pull.
  [near, far].forEach(f => { f.vx = 0; f.vy = 0; });
  blackHole.victims = [near, far];

  collapseAtLeftWall(blackHole);
  for (let i = 0; i < 20; i++) blackHole.update(0.05, null);

  assert.equal(near.isPulledIn, true, 'a fighter 150px away should be pulled');
  assert.ok(near.vx < 0, 'the pull should drag the near fighter toward the hole');
  assert.equal(near.totalDamageTaken, 10, 'a pulled-in fighter should take 10 damage once');

  assert.equal(far.isPulledIn, false, 'a fighter 250px away should be outside the pull');
  assert.equal(far.vx, 0);
  assert.equal(far.totalDamageTaken, 0, 'a fighter outside the pull should take no damage');
});

test('Each new event horizon can damage the same fighter again', () => {
  const blackHole = new BlackHole(stats('Black Hole'), 400, 400);
  const near = new FighterBase(stats('Near'), 170, 400);
  blackHole.victims = [near];

  collapseAtLeftWall(blackHole);
  for (let i = 0; i < 40; i++) blackHole.update(0.05, null); // 2s clears the 1.8s hole

  assert.equal(blackHole.activeHole, null, 'the first hole should collapse');
  assert.equal(near.totalDamageTaken, 10);

  collapseAtLeftWall(blackHole);
  for (let i = 0; i < 20; i++) blackHole.update(0.05, null);

  assert.equal(near.totalDamageTaken, 20, 'a second hole should hit the fighter once more');
});
