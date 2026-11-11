import test from 'node:test';
import assert from 'node:assert/strict';
import { ParticleSystem } from './ParticleSystem.js';

test('shatter spawns shards and ground cracks that are drawn, then expire', () => {
  const particles = new ParticleSystem({ graphicsQuality: 'high' });
  particles.shatter(100, 100, '#e6f7ff', { radius: 100 });

  assert.ok(particles.shards.length > 0, 'ice shards are created');
  assert.ok(particles.cracks.length > 0, 'ground cracks are created');

  const calls = [];
  const ctx = new Proxy({}, {
    get: (_t, key) => (...args) => { calls.push([key, ...args]); return ctx; },
    set: () => true
  });
  particles.draw(ctx);
  assert.ok(calls.some(([k]) => k === 'stroke'), 'cracks are stroked');
  assert.ok(calls.some(([k]) => k === 'fill'), 'shards are filled');

  particles.update(3);
  assert.equal(particles.shards.length, 0, 'shards are gone after their lifetime');
  assert.equal(particles.cracks.length, 0, 'cracks fade out after their lifetime');
});
