// Team plans for roster battles. Pure logic, no React.
//
// A plan maps each selected fighter (by roster order) to a team index 0..k-1.
// Free-for-all returns no plan at all, so FFA battles carry no team data.
//
// Preset sizes (2v2, 3v3): the number of teams is ceil(count / perTeam), but never
// fewer than 2. Fighters are dealt round-robin, so team sizes differ by at most one
// and teammates are never seated next to each other. Examples:
//   2 in 2v2 -> 1v1         3 in 2v2 -> 2 + 1        5 in 3v3 -> 3 + 2
//   4 in 3v3 -> 2 + 2       5 in 2v2 -> 2 + 2 + 1    6 in 2v2 -> 2 + 2 + 2

export const TEAM_MODE_IDS = ["ffa", "2v2", "3v3", "custom"];

export const TEAM_MODES = {
  ffa: { id: "ffa", label: "FREE FOR ALL", perTeam: null },
  "2v2": { id: "2v2", label: "2 V 2", perTeam: 2 },
  "3v3": { id: "3v3", label: "3 V 3", perTeam: 3 },
  custom: { id: "custom", label: "CUSTOM TEAMS", perTeam: null }
};

export function presetTeamCount(count, perTeam) {
  return Math.max(2, Math.ceil(count / perTeam));
}

// Team sizes for a preset, in team order, e.g. [3, 2].
export function presetSizes(count, perTeam) {
  const teams = presetTeamCount(count, perTeam);
  const sizes = Array.from({ length: teams }, () => 0);
  for (let i = 0; i < count; i += 1) sizes[i % teams] += 1;
  return sizes;
}

// Turns a team pick for each fighter into a normalized plan. Custom team numbers are
// arbitrary labels from the picker, so they are re-indexed to 0..k-1 in ascending
// order. A custom battle needs at least two sides.
export function planTeams(mode, count, customTeams = null) {
  if (mode === "ffa") return { teams: null, sizes: null, error: null };

  if (mode === "custom") {
    if (!customTeams || customTeams.length !== count) {
      return { teams: null, sizes: null, error: "Assign every fighter to a team." };
    }
    const distinct = [...new Set(customTeams)].sort((a, b) => a - b);
    if (distinct.length < 2) {
      return { teams: null, sizes: null, error: "Use at least two teams." };
    }
    const indexOf = new Map(distinct.map((value, index) => [value, index]));
    const teams = customTeams.map(value => indexOf.get(value));
    const sizes = distinct.map(() => 0);
    teams.forEach(index => { sizes[index] += 1; });
    return { teams, sizes, error: null };
  }

  const preset = TEAM_MODES[mode];
  if (!preset?.perTeam) {
    return { teams: null, sizes: null, error: `Unknown team mode: ${mode}` };
  }
  const teamCount = presetTeamCount(count, preset.perTeam);
  const teams = Array.from({ length: count }, (_, i) => i % teamCount);
  return { teams, sizes: presetSizes(count, preset.perTeam), error: null };
}

// "3 + 2" style summary used by the picker and the HUD.
export function describeSizes(sizes) {
  return sizes ? sizes.join(" + ") : "";
}

// Whether a fighter won with the placement-1 fighter. Free-for-all has no sides, so
// only the winner himself counts; a team battle counts everyone on the winner's team.
export function onWinningSide(fighter, winner) {
  if (winner.team == null) return fighter === winner;
  return fighter.team === winner.team;
}

// Names of everyone on the winning side.
export function winningSideNames(results) {
  const winner = results?.find(f => f.placement === 1);
  if (!winner) return [];
  return results.filter(f => onWinningSide(f, winner)).map(f => f.name);
}
