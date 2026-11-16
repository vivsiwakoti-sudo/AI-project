import test from 'node:test';
import assert from 'node:assert/strict';
import { createFighterAssembly } from './FighterAssembly.js';

function withSeededRandom(seed, run) {
  const original = Math.random;
  let state = seed;
  Math.random = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
  try {
    return run();
  } finally {
    Math.random = original;
  }
}

const distanceFrom = fighter => p => Math.hypot(p.x - fighter.x, p.y - fighter.y);

test('particles drift in from outside the body and settle inside it', () => {
  const fighter = { x: 300, y: 300, radius: 16, color: '#FF4500' };
  const assembly = withSeededRandom(7, () => createFighterAssembly([fighter], { arenaSize: 600, duration: 1 }));
  const distance = distanceFrom(fighter);

  const early = assembly.sample(0.2);
  assert.ok(early.length > 0, 'some particles are already on their way');
  assert.ok(Math.max(...early.map(distance)) > fighter.radius, 'early particles are still outside the body');

  const settled = assembly.sample(1);
  assert.ok(settled.length > 0, 'particles are present when the assembly ends');
  assert.ok(settled.every(p => distance(p) <= fighter.radius), 'settled particles sit inside the body');
});

test('particles are shades of the fighter color', () => {
  const fighter = { x: 300, y: 300, radius: 16, color: '#FF4500' };
  const assembly = withSeededRandom(11, () => createFighterAssembly([fighter], { arenaSize: 600, duration: 1 }));
  // Shading blends each channel at most 25% toward white or 20% toward black.
  const [r0, g0, b0] = [0xff, 0x45, 0x00];
  const within = (channel, base) => channel >= Math.floor(base * 0.8) && channel <= Math.round(base + (255 - base) * 0.25);

  assembly.sample(1).forEach(p => {
    const [r, g, b] = p.color.match(/\d+/g).map(Number);
    assert.ok(within(r, r0) && within(g, g0) && within(b, b0), `${p.color} is a shade of ${fighter.color}`);
  });
});

test('particles settle on the silhouette points they are given, in each point\'s color', () => {
  const fighter = { x: 300, y: 300, radius: 16, color: '#87CEFA' };
  const targets = [
    { x: -5, y: 3, color: 'rgb(1, 2, 3)' },
    { x: 6, y: -2, color: 'rgb(4, 5, 6)' },
  ];
  const assembly = withSeededRandom(5, () => createFighterAssembly([fighter], {
    arenaSize: 600,
    duration: 1,
    sampleTargets: () => targets,
  }));

  const settled = assembly.sample(1);
  assert.equal(settled.length, targets.length);
  settled.forEach((p, i) => {
    assert.ok(Math.abs(p.x - fighter.x - targets[i].x) < 1e-9, 'x matches the target');
    assert.ok(Math.abs(p.y - fighter.y - targets[i].y) < 1e-9, 'y matches the target');
    assert.equal(p.color, targets[i].color);
  });
});

test('the fighter body stays hidden until its particles have formed it', () => {
  const fighter = { x: 300, y: 300, radius: 16, color: '#87CEFA' };
  const assembly = withSeededRandom(3, () => createFighterAssembly([fighter], { arenaSize: 600, duration: 1 }));

  assert.equal(assembly.hidesFighter(fighter), true);
  assert.equal(assembly.hidesFighter({}), false, 'fighters outside the assembly are never hidden');
  assembly.advance(0.5);
  assert.equal(assembly.hidesFighter(fighter), true);
  assembly.advance(0.5);
  assert.equal(assembly.hidesFighter(fighter), false);
});

test('the assembly completes after its fade-out', () => {
  const fighter = { x: 300, y: 300, radius: 16, color: '#87CEFA' };
  const assembly = createFighterAssembly([fighter], { arenaSize: 600, duration: 1 });

  assembly.advance(1.2);
  assert.equal(assembly.isComplete(), false);
  assembly.advance(0.5);
  assert.equal(assembly.isComplete(), true);
});
