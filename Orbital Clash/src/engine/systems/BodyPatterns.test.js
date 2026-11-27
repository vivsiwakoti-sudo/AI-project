import test from 'node:test';
import assert from 'node:assert/strict';
import { drawBodyPattern } from './BodyPatterns.js';
import { FIGHTER_CLASSES } from '../fighterDefinitions.js';
import { outlineColorFor } from '../classes/FighterBase.js';

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
      calls.push(['set', prop, value]);
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

test('pattern colours take the outline colour when one is given', () => {
  for (const name of Object.keys(FIGHTER_CLASSES)) {
    const { ctx, calls } = recordingContext();
    drawBodyPattern(ctx, name, 20, '#123456');
    const styles = calls
      .filter(([op, prop, value]) => op === 'set' && (prop === 'fillStyle' || prop === 'strokeStyle') && typeof value === 'string')
      .map(([, , value]) => value);
    assert.ok(styles.length > 0, `${name} set no string colours`);
    for (const style of styles) {
      assert.match(style, /^rgba\(18, 52, 86, [\d.]+\)$/, `${name} strayed from the outline colour: ${style}`);
    }
  }
});

test('an unknown class name draws nothing', () => {
  const { ctx, calls } = recordingContext();
  drawBodyPattern(ctx, 'Not A Real Class', 20);
  assert.equal(calls.length, 0);
});

test('no two classes render with nearly the same body colour', () => {
  const MIN_DISTANCE = 15;
  const rendered = Object.values(FIGHTER_CLASSES).map(c => ({
    name: c.name,
    rgb: outlineColorFor(c.color).match(/\d+/g).map(Number),
  }));
  for (let i = 0; i < rendered.length; i++) {
    for (let j = i + 1; j < rendered.length; j++) {
      const a = rendered[i], b = rendered[j];
      const distance = Math.hypot(...a.rgb.map((v, k) => v - b.rgb[k]));
      assert.ok(distance >= MIN_DISTANCE, `${a.name} and ${b.name} look too alike (distance ${distance.toFixed(1)})`);
    }
  }
});
