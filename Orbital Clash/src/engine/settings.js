// Player preferences, persisted in localStorage. Volumes are 0-1 multipliers.

export const SETTINGS_KEY = "orbital-clash-settings";

export const DEFAULT_SETTINGS = Object.freeze({
  musicVolume: 1,
  sfxVolume: 1,
  performanceMode: false
});

function clampUnit(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : fallback;
}

// Fills in defaults and clamps values, so a hand-edited or stale entry cannot break the game.
function sanitize(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    musicVolume: clampUnit(source.musicVolume, DEFAULT_SETTINGS.musicVolume),
    sfxVolume: clampUnit(source.sfxVolume, DEFAULT_SETTINGS.sfxVolume),
    performanceMode: source.performanceMode === true
  };
}

function load() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return sanitize(null);
    return sanitize(JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || "null"));
  } catch {
    return sanitize(null);
  }
}

let current = load();

export function getSettings() {
  return current;
}

export function updateSettings(patch) {
  current = sanitize({ ...current, ...patch });
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(current));
    }
  } catch {
    /* storage disabled - settings still apply for this session */
  }
  return current;
}
