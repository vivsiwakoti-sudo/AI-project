const SLOW_MULTIPLIERS = { slow: 0.5, "web-slow": 0.4, "trail-slow": 0.5 };
// Permanent slows that multiply on top of the strongest timed slow instead of competing with it.
const COMPOUNDING_SLOWS = new Set(["web-weave"]);

export class EffectSystem {
  static updateEffects(fighter, dt) {
    fighter.statusEffects = fighter.statusEffects.filter(effect => {
      effect.duration -= dt;
      if (effect.onUpdate) effect.onUpdate(fighter, effect, dt);
      if (effect.duration <= 0) {
        if (effect.onEnd) effect.onEnd(fighter, effect);
        return false;
      }
      return true;
    });
  }

  static addEffect(fighter, effect) {
    const existing = fighter.statusEffects.find(e => e.name === effect.name);
    if (existing) {
      // Refreshing effects reset their timer without stacking.
      existing.duration = effect.duration;
      if (effect.multiplier != null) existing.multiplier = effect.multiplier;
      if (effect.onUpdate) existing.onUpdate = effect.onUpdate;
      if (effect.onEnd) existing.onEnd = effect.onEnd;
      if (effect.tickTimer != null) existing.tickTimer = effect.tickTimer;
      return existing;
    }

    const created = {
      ...effect,
      multiplier: effect.multiplier ?? SLOW_MULTIPLIERS[effect.name] ?? 1
    };
    fighter.statusEffects.push(created);
    return created;
  }

  static removeEffects(fighter, predicate) {
    const removed = fighter.statusEffects.filter(predicate);
    fighter.statusEffects = fighter.statusEffects.filter(effect => !predicate(effect));
    removed.forEach(effect => { if (effect.onEnd) effect.onEnd(fighter, effect); });
    return removed;
  }

  static has(fighter, name) {
    return (fighter.statusEffects || []).some(effect => effect.name === name);
  }

  static get(fighter, name) {
    return (fighter.statusEffects || []).find(effect => effect.name === name) || null;
  }

  static slowMultiplier(fighter) {
    const effects = fighter.statusEffects || [];
    const timedSlow = effects
      .filter(effect => SLOW_MULTIPLIERS[effect.name] != null)
      .reduce((slowest, effect) => Math.min(slowest, effect.multiplier ?? SLOW_MULTIPLIERS[effect.name] ?? 1), 1);
    const compounding = effects
      .filter(effect => COMPOUNDING_SLOWS.has(effect.name))
      .reduce((product, effect) => product * (effect.multiplier ?? 1), 1);
    return timedSlow * compounding;
  }
}
