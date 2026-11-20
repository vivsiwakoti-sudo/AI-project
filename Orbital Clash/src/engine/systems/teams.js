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

export function isTeammate(a, b) {
  return teamOf(a) === teamOf(b);
}

// True only inside a team battle. Teammates are protected from each other's
// damage only in that case, so FFA damage is untouched.
export function isTeamBattle(fighter) {
  const root = fighter?.owner ?? fighter?.root ?? fighter;
  return root?.team != null;
}
