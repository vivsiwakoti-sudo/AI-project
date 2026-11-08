import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, sanitizeSettings, updateSettings } from "./settings.js";

test("settings clamp volumes and fall back to high for an unknown graphics level", () => {
  const next = updateSettings({ musicVolume: 3, sfxVolume: -1, graphicsQuality: "ultra" });
  assert.equal(next.musicVolume, 1);
  assert.equal(next.sfxVolume, 0);
  assert.equal(next.graphicsQuality, "high");
});

test("settings accept a valid partial update and keep the other fields", () => {
  updateSettings(DEFAULT_SETTINGS);
  const next = updateSettings({ graphicsQuality: "low", musicVolume: 0.4 });
  assert.equal(next.graphicsQuality, "low");
  assert.equal(next.musicVolume, 0.4);
  assert.equal(next.sfxVolume, DEFAULT_SETTINGS.sfxVolume);
});

test("a saved performance mode flag migrates to the matching graphics level", () => {
  assert.equal(sanitizeSettings({ performanceMode: true }).graphicsQuality, "low");
  assert.equal(sanitizeSettings({ performanceMode: false }).graphicsQuality, "high");
  assert.equal(sanitizeSettings({ performanceMode: true, graphicsQuality: "medium" }).graphicsQuality, "medium");
  assert.equal(sanitizeSettings(null).graphicsQuality, DEFAULT_SETTINGS.graphicsQuality);
});
