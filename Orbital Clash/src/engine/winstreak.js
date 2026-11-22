// A streak of this many consecutive roster wins or more gets the orange card glow.
export const STREAK_GLOW_MIN = 2;

// A win extends the streak and a loss resets it. Draws and aborted battles never
// reach this, so they leave the streak as it was.
export function nextStreak(current, didWin) {
  const value = Math.max(0, Math.floor(Number(current) || 0));
  return didWin ? value + 1 : 0;
}
