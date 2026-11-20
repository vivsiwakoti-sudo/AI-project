// Team membership for a fight. A summon fights for its summoner, so it inherits
// the summoner's side. A fighter with no `team` is a free-for-all entrant and is
// its own side, which keeps every FFA rule exactly as it was.
//
// Lives apart from BattleSimulation.js so DamageSystem can use the same rules
// without importing the simulation loop.

export function teamOf(fighter) {
  const root = fighter?.owner ?? fighter?.root ?? fighter;
  return root?.team ?? root;
}

// Colour for each side, shared by the arena ring and the HUD so a team reads the
// same everywhere. Team numbers are 0-based and at most six sides exist.
export const TEAM_COLORS = ["#ff4d6d", "#4dd2ff", "#ffd93d", "#6bff7a", "#ff9f43", "#c77dff"];

export function teamColor(team) {
  return TEAM_COLORS[team % TEAM_COLORS.length];
}

export function isTeammate(a, b) {
  return teamOf(a) === teamOf(b);
}

// True only inside a team battle. Teammates are protected from each other's
// damage only in that case, so FFA damage is untouched.
export function isTeamBattle(fighter) {
  const root = fighter?.owner ?? fighter?.root ?? fighter;
  return root?.team != null;
}
