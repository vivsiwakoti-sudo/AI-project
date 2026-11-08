import { test } from "node:test";
import assert from "node:assert/strict";
import { GRAPHICS_LEVELS, applyGlowScale, graphicsProfile } from "./graphics.js";
import { ParticleSystem } from "./systems/ParticleSystem.js";

// Stands in for CanvasRenderingContext2D, which exposes shadowBlur as a prototype accessor.
class FakeContext {
  constructor() { this._blur = 0; }
  get shadowBlur() { return this._blur; }
  set shadowBlur(value) { this._blur = value; }
}

test("each quality level is a profile, and higher levels do more work", () => {
  assert.deepEqual(GRAPHICS_LEVELS, ["low", "medium", "high"]);
  const [low, medium, high] = GRAPHICS_LEVELS.map(graphicsProfile);
  assert.ok(low.glowScale < medium.glowScale && medium.glowScale < high.glowScale);
  assert.ok(low.particleDensity < medium.particleDensity && medium.particleDensity < high.particleDensity);
  assert.ok(low.maxParticles < medium.maxParticles && medium.maxParticles < high.maxParticles);
  assert.ok(low.replayInterval > high.replayInterval);
  assert.equal(low.glowScale, 0);
});

test("an unknown or missing level falls back to high", () => {
  assert.equal(graphicsProfile("ultra"), graphicsProfile("high"));
  assert.equal(graphicsProfile(undefined), graphicsProfile("high"));
});

test("glow scale multiplies shadow blur, and zero removes it", () => {
  const ctx = new FakeContext();
  applyGlowScale(ctx, 0.5);
  ctx.shadowBlur = 10;
  assert.equal(ctx.shadowBlur, 5);

  applyGlowScale(ctx, 0);
  ctx.shadowBlur = 22;
  assert.equal(ctx.shadowBlur, 0);

  applyGlowScale(ctx, 1);
  ctx.shadowBlur = 6;
  assert.equal(ctx.shadowBlur, 6);
});

test("particle systems take their density and cap from the quality level", () => {
  const low = new ParticleSystem({ graphicsQuality: "low" });
  const high = new ParticleSystem({ graphicsQuality: "high" });
  assert.equal(low.maxParticles, graphicsProfile("low").maxParticles);
  assert.equal(high.densityScale, graphicsProfile("high").particleDensity);
  assert.ok(low.densityScale < high.densityScale);
});
