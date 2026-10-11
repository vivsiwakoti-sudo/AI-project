// Every battle is a 4-way free-for-all. This lives in the engine (not a UI
// component) because it is a game rule that both the roster and the arena read.
// A future mode (2v2, or a different player count) changes this one number plus
// the team rules; nothing else hard-codes a fighter count.
export const MAX_FIGHTERS = 4;

// The minimum needed to make a fight meaningful.
export const MIN_FIGHTERS = 2;

// Selectable square map sizes, in world units. The pre-match picker offers these.
export const ARENA_SIZE_OPTIONS = [700, 800, 900, 1000];
export const DEFAULT_ARENA_SIZE = 800;

export const FIGHTER_CONFIG = {
  // ... other fighters
  "Mine Layer": {
      speed: null // MISSING VALUE: The specification does not provide a speed value for Mine Layer.
  }
};
