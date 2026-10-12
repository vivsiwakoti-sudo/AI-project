import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, updateSettings } from "./settings.js";

test("settings clamp volumes and coerce performance mode to a boolean", () => {
  const next = updateSettings({ musicVolume: 3, sfxVolume: -1, performanceMode: "yes" });
  assert.equal(next.musicVolume, 1);
  assert.equal(next.sfxVolume, 0);
  assert.equal(next.performanceMode, false);
});

test("settings accept a valid partial update and keep the other fields", () => {
  updateSettings(DEFAULT_SETTINGS);
  const next = updateSettings({ performanceMode: true, musicVolume: 0.4 });
  assert.equal(next.performanceMode, true);
  assert.equal(next.musicVolume, 0.4);
  assert.equal(next.sfxVolume, DEFAULT_SETTINGS.sfxVolume);
});
