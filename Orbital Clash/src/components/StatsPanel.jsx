function formatNumber(value) {
  if (!Number.isFinite(value)) return "--";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function getCooldown(fighter) {
  const timers = [fighter.cooldownTimer, fighter.spearCooldown, fighter.attackTimer, fighter.mineCooldown, fighter.cloneCooldown]
    .filter(value => Number.isFinite(value) && value > 0);
  return timers.length ? Math.max(...timers) : 0;
}

function getAbilityState(fighter) {
  if (fighter.isDead) return { label: "OFFLINE", detail: "DEFEATED" };
  if (fighter.isStuck || fighter.isStunned) return { label: "ACTIVE", detail: "PINNED" };
  if (fighter.beamActive || fighter.ropeActive || fighter.isHookActive || fighter.aoeActive) return { label: "ACTIVE", detail: "ENGAGED" };
  if (fighter.isCharging || fighter.targetZone || fighter.isUntargetable) return { label: "CHARGING", detail: "LOCKED" };
  const cooldown = getCooldown(fighter);
  return cooldown > 0 ? { label: "COOLDOWN", detail: `${cooldown.toFixed(1)}s` } : { label: "READY", detail: "STANDBY" };
}

function getCooldownProgress(fighter) {
  const current = getCooldown(fighter);
  const maximum = Number.isFinite(fighter.cooldown) && fighter.cooldown > 0 ? fighter.cooldown : 1;
  return Math.max(0, Math.min(100, ((maximum - current) / maximum) * 100));
}

function getSpecialRows(fighter) {
  switch (fighter.name) {
    case "Reaper": return [["SCYTHE DAMAGE", formatNumber(fighter.currentDamage)]];
    case "Berserker": return [["BLADE SPEED", `${formatNumber(fighter.rotationSpeed * 100)}%`]];
    case "Solar Beam": return [["BEAM STATE", fighter.beamActive ? "FIRING" : fighter.isCharging ? "CHARGING" : "STANDBY"]];
    case "Vampire": return [["EVOLUTION", `STAGE ${Math.max(1, (fighter.evolutionLevel || 0) + 1)}`], ["BLOOD DASH", fighter.dashState === "drain" ? "DRAINING" : fighter.dashState === "dash" ? "DASHING" : (fighter.evolutionLevel || 0) >= 1 ? "READY" : "STAGE 2"]];
    case "Mahoraga": return [["ADAPTATIONS", `${fighter.adaptedCategories?.length || 0}/5`]];
    case "Mutant": return [["CURRENT HP MAX", formatNumber(fighter.maxHealth)], ["MUTATION", `${formatNumber(fighter.mutationTimer)}s`]];
    case "Spider": return [["WEBS ACTIVE", String(fighter.webs?.length || 0)]];
    case "Tunneler": return [["TUNNEL STATUS", fighter.isUntargetable ? "UNDERGROUND" : "READY"]];
    case "Ninja": return [["ROPE DART", fighter.ropeActive ? "IN FLIGHT" : "READY"]];
    case "Snake": return [["TRAIL SEGMENTS", String(fighter.trail?.length || 0)]];
    case "Duplicator": return [["CLONES ACTIVE", String(fighter.clones?.length || 0)], ["GENERATION", String(fighter.generation || 0)]];
    case "Knight": return [["SHIELD", fighter.shieldActive ? "ACTIVE" : "READY"]];
    case "Ghost": return [["GHOST MODE", fighter.isGhost ? "ACTIVE" : "READY"]];
    default: return [];
  }
}

export default function StatsPanel({ fighter, index, battleTime, suddenDeath }) {
  if (!fighter) return null;

  // A fighter is out once it is dead or its HP is exhausted. With four fighters
  // in a free-for-all it must be obvious at a glance who is still in the fight,
  // so an eliminated fighter is shown as defeated rather than as a live panel
  // sitting on a negative health value.
  const isEliminated = fighter.isDead || fighter.health <= 0;
  const healthPercent = isEliminated
    ? 0
    : Math.max(0, Math.min(100, (fighter.health / fighter.maxHealth) * 100));
  const ability = getAbilityState(fighter);
  const cooldown = getCooldown(fighter);
  const specialRows = getSpecialRows(fighter);
  const effects = fighter.statusEffects || [];
  // Cap the list so the HUD does not get cluttered when many effects stack.
  const MAX_VISIBLE_EFFECTS = 5;
  const visibleEffects = effects.slice(0, MAX_VISIBLE_EFFECTS);
  const hiddenEffectCount = effects.length - visibleEffects.length;
  const iconText = fighter.name.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase();

  return (
    <section className={`hud-panel ${isEliminated ? "hud-panel-defeated" : healthPercent <= 25 ? "hud-panel-critical" : ""}`} style={{ "--fighter-accent": fighter.color }}>
      <header className="hud-header">
        <div className="hud-kicker">FIGHTER {String(index + 1).padStart(2, "0")}</div>
        <div className={`hud-battle-time ${suddenDeath ? "hud-battle-time-danger" : ""}`}><span>{suddenDeath ? "SUDDEN DEATH" : "BATTLE TIME"}</span><strong>{battleTime}</strong></div>
        <div className="hud-header-row">
          <div className="hud-icon" aria-hidden="true">{iconText}</div>
          <div><h2>{fighter.name}</h2><div className="hud-attack-type">{isEliminated ? "ELIMINATED" : fighter.attackType}</div></div>
        </div>
      </header>

      <div className="hud-section hud-health-section">
        <div className="hud-section-title"><span>HEALTH</span><strong>{isEliminated ? `0 / ${Math.ceil(fighter.maxHealth)}` : `${Math.ceil(fighter.health)} / ${Math.ceil(fighter.maxHealth)}`}</strong></div>
        <div className="hud-health-track"><div className="hud-health-fill" style={{ width: `${healthPercent}%` }} /></div>
      </div>

      <div className="hud-section hud-stats-grid">
        <div><span>DAMAGE</span><strong>{formatNumber(fighter.damage)}</strong></div>
        <div><span>SPEED</span><strong>{formatNumber(fighter.speed)}</strong></div>
        <div><span>SIZE</span><strong>{formatNumber(fighter.radius * 2)}</strong></div>
        <div><span>DEALT</span><strong>{formatNumber(fighter.totalDamageDealt)}</strong></div>
      </div>

      <div className="hud-section">
        <div className="hud-section-title"><span>ABILITY</span><strong className={`hud-state hud-state-${ability.label.toLowerCase()}`}>{ability.label}</strong></div>
        <div className="hud-ability-name">{fighter.attackType}</div>
        <div className="hud-cooldown-row"><span>{ability.detail}</span><span>{cooldown > 0 ? `${cooldown.toFixed(1)}s` : "●"}</span></div>
        <div className="hud-progress"><div style={{ width: `${cooldown > 0 ? getCooldownProgress(fighter) : 100}%` }} /></div>
      </div>

      <div className="hud-section">
        <div className="hud-section-title"><span>ACTIVE EFFECTS</span><strong>{effects.length}</strong></div>
        <div className="hud-effects">
          {effects.length ? visibleEffects.map((effect, effectIndex) => <div className="hud-effect" key={`${effect.name}-${effectIndex}`}><i style={{ backgroundColor: fighter.color }} /><span>{effect.name.toUpperCase()}</span><b>{Number.isFinite(effect.duration) ? `${effect.duration.toFixed(1)}s` : "ACTIVE"}</b></div>) : <div className="hud-empty">NO ACTIVE EFFECTS</div>}
          {hiddenEffectCount > 0 && <div className="hud-empty hud-effects-more">+{hiddenEffectCount} MORE</div>}
        </div>
      </div>

      {specialRows.length > 0 && <div className="hud-section hud-special"><div className="hud-section-title"><span>SPECIAL</span><strong>LIVE</strong></div>{specialRows.map(([label, value]) => <div className="hud-special-row" key={label}><span>{label}</span><b>{value}</b></div>)}</div>}
    </section>
  );
}
