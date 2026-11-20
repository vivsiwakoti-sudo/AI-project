// Every battle is a free-for-all unless a team mode is chosen. This lives in the
// engine (not a UI component) because it is a game rule that both the roster and
// the arena read. Nothing else hard-codes a fighter count.
export const MAX_FIGHTERS = 6;


// The minimum needed to make a fight meaningful.
export const MIN_FIGHTERS = 2;

// Selectable square map sizes, in world units. The pre-match picker offers these.
export const ARENA_SIZE_OPTIONS = [600, 700, 800, 900, 1000];
export const DEFAULT_ARENA_SIZE = 800;

export const FIGHTER_CONFIG = {
  // ... other fighters
  "Mine Layer": {
      speed: null // MISSING VALUE: The specification does not provide a speed value for Mine Layer.
  }
};
