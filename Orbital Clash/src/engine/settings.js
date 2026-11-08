// Player preferences, persisted in localStorage. Volumes are 0-1 multipliers.
import { DEFAULT_GRAPHICS_QUALITY, GRAPHICS_LEVELS } from "./graphics.js";

export const SETTINGS_KEY = "orbital-clash-settings";

export const DEFAULT_SETTINGS = Object.freeze({
  musicVolume: 1,
  sfxVolume: 1,
  graphicsQuality: DEFAULT_GRAPHICS_QUALITY
});

function clampUnit(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : fallback;
}

// Older saves stored a performanceMode flag; it maps to the low level.
function graphicsFrom(source) {
  if (GRAPHICS_LEVELS.includes(source.graphicsQuality)) return source.graphicsQuality;
  return source.performanceMode === true ? "low" : DEFAULT_SETTINGS.graphicsQuality;
}

// Fills in defaults and clamps values, so a hand-edited or stale entry cannot break the game.
export function sanitizeSettings(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    musicVolume: clampUnit(source.musicVolume, DEFAULT_SETTINGS.musicVolume),
    sfxVolume: clampUnit(source.sfxVolume, DEFAULT_SETTINGS.sfxVolume),
    graphicsQuality: graphicsFrom(source)
  };
}

function load() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return sanitizeSettings(null);
    return sanitizeSettings(JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || "null"));
  } catch {
    return sanitizeSettings(null);
  }
}

let current = load();

export function getSettings() {
  return current;
}

export function updateSettings(patch) {
  current = sanitizeSettings({ ...current, ...patch });
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(current));
    }
  } catch {
    /* storage disabled - settings still apply for this session */
  }
  return current;
}
