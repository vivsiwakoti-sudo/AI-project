import test from 'node:test';
import assert from 'node:assert/strict';
import { drawBodyPattern } from './BodyPatterns.js';
import { FIGHTER_CLASSES } from '../fighterDefinitions.js';

const PAINT_OPS = new Set(['fill', 'stroke', 'fillRect']);

function recordingContext() {
  const calls = [];
  const target = {};
  const ctx = new Proxy(target, {
    get(obj, prop) {
      if (prop in obj) return obj[prop];
      if (prop === 'createRadialGradient' || prop === 'createLinearGradient') {
        return () => ({ addColorStop() {} });
      }
      return (...args) => {
        calls.push([prop, ...args]);
        return undefined;
      };
    },
    set(obj, prop, value) {
      obj[prop] = value;
      return true;
    }
  });
  return { ctx, calls };
}

test('every fighter class paints at least one pattern stroke or fill', () => {
  for (const name of Object.keys(FIGHTER_CLASSES)) {
    const { ctx, calls } = recordingContext();
    drawBodyPattern(ctx, name, 20);
    assert.ok(calls.some(([op]) => PAINT_OPS.has(op)), `${name} drew nothing`);
  }
});

test('an unknown class name draws nothing', () => {
  const { ctx, calls } = recordingContext();
  drawBodyPattern(ctx, 'Not A Real Class', 20);
  assert.equal(calls.length, 0);
});
