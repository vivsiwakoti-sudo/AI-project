import { ADAPTATION_STEPS } from "./classes/types/Mahoraga.js";

// Milestone steps. A fighter is announced once per step it crosses, so the feed
// stays quiet between thresholds no matter how often the underlying value moves.
export const FIREBALL_VOLLEY_STEP = 5;
export const REAPER_DAMAGE_STEP = 10;
export const BERSERKER_SPEED_STEP = 100;

// Mahoraga's stage is the highest adaptation step reached by any of its attacks
// (or by a pre-adapted test setup). The step table lists resistances in order, so
// a step's position is its stage: 0 means no adaptation yet.
function mahoragaStage(fighter) {
  const resistances = [fighter.preAdaptResistance ?? 0, ...(fighter.adaptedAttacks ?? []).map(a => a.resistance)];
  return Math.max(0, ...resistances.map(resistance => ADAPTATION_STEPS.findIndex(step => step.resistance === resistance) + 1));
}

// `read` returns the fighter's current value for a milestone (or null if the
// fighter is not that class), `level` turns the value into the step it has
// reached, and `text` describes that step. Berserker speed is a percentage, and
// its level is floored with a small epsilon so repeated multiplication can't
// leave a crossing just short of its step.
const MILESTONES = [
  {
    read: f => (f.name === "Vampire" ? f.evolutionLevel ?? 0 : null),
    level: value => value,
    text: level => `Vampire reached stage ${level}`
  },
  {
    read: f => (f.name === "Mahoraga" ? mahoragaStage(f) : null),
    level: value => value,
    text: level => `Mahoraga reached stage ${level}`
  },
  {
    // shotsFired is the size of the latest volley, growing by one each volley, so it hits every multiple of the step.
    read: f => (f.name === "Fireball" ? f.shotsFired ?? 0 : null),
    level: value => Math.floor(value / FIREBALL_VOLLEY_STEP),
    text: level => `Fireball is shooting ${level * FIREBALL_VOLLEY_STEP} fireballs`
  },
  {
    read: f => (f.name === "Reaper" ? f.currentDamage ?? null : null),
    level: value => Math.floor(value / REAPER_DAMAGE_STEP),
    text: level => `Reaper reached ${level * REAPER_DAMAGE_STEP} damage`
  },
  {
    read: f => (f.name === "Berserker" && f.rotationSpeed != null ? f.rotationSpeed * 100 : null),
    level: value => Math.floor(value / BERSERKER_SPEED_STEP + 1e-9),
    text: level => `Berserker reached ${level * BERSERKER_SPEED_STEP}% speed`
  }
];

export function createLiveFeed() {
  return { nextId: 1, fighters: new Map() };
}

// Compares each fighter with what the feed last saw and returns the new feed
// events. The first sighting of a fighter is a baseline, so a battle's starting
// state (a Berserker's 100%, a Reaper's base damage) is never announced. Each
// death is announced once, credited to whoever landed the killing blow.
export function observeLiveFeed(feed, fighters) {
  const events = [];
  const emit = (text, color) => events.push({ id: feed.nextId++, text, color });

  for (const fighter of fighters) {
    if (!fighter) continue;
    let record = feed.fighters.get(fighter);
    if (!record) {
      record = { destroyed: false, levels: MILESTONES.map(() => null) };
      feed.fighters.set(fighter, record);
    }

    if (!record.destroyed && fighter.eliminatedAt != null) {
      record.destroyed = true;
      const killer = fighter.killedBy && fighter.killedBy !== fighter ? fighter.killedBy : null;
      if (killer) emit(`${killer.name} destroyed ${fighter.name}`, killer.color);
      else emit(`${fighter.name} was destroyed`, fighter.color);
    }

    MILESTONES.forEach((milestone, index) => {
      const value = milestone.read(fighter);
      if (value == null) return;
      const level = milestone.level(value);
      const last = record.levels[index];
      if (last === null) {
        record.levels[index] = level;
        return;
      }
      if (level > last) {
        record.levels[index] = level;
        emit(milestone.text(level), fighter.color);
      }
    });
  }

  return events;
}
