// The combat loop of one bout, shared by every mode.
//
// This is the ONE implementation of "advance every fighter by one frame". The live
// arena (Arena.jsx) and tournament bouts (tournament.js) both call it, so a
// tournament match and a free-for-all fight are literally the same simulation:
// same class AI, same targeting, same touch damage, same collisions, same death
// order. Anything mode-specific (the arena's HUD refresh, replay capture, audio)
// lives in the caller and is driven from what this function returns.
//
// Pure simulation: no React, no canvas, no DOM. It only reads and mutates the
// fighter instances it is handed.

import { CollisionSystem } from "./CollisionSystem.js";
import { DamageSystem } from "./DamageSystem.js";

// --- Targeting helpers (moved verbatim from Arena.jsx) -----------------------

// A fighter can only ever be a threat to someone else, so this is the single
// definition of "valid target" used by every check here.
//
//   - never the fighter itself (a fighter must NEVER target itself)
//   - never a corpse (dead fighters are removed from targeting immediately)
// Unreachable or invulnerable states are filtered by the callers below, so a
// class cannot lock onto a Tunneler mid-dive or a target it can never damage.
export function isValidTarget(candidate, self) {
  if (!candidate || candidate === self) return false;
  if (candidate.isDead || candidate.health <= 0) return false;
  return true;
}

// Every ranged class's declared attack type, with a name fallback for anything
// that reaches the arena without one. Kept explicit because the roster's own
// labels are inconsistent ("Rope-dart" vs "Projectile", "Bullet" vs "Spear")
// and a regex would silently misclassify a class.
const RANGED_ATTACK_TYPES = new Set([
  "Projectile",
  "Ranged",
  "Bullet",
  "Spear",
  "Rope-dart",
  "Arrow",
  "Laser",
  "Beam"
]);

const RANGED_CLASS_NAMES = new Set([
  "Gunner",
  "Spearman",
  "Fireball",
  "Solar Beam",
  "Mine Layer",
  "Meteor",
  "Black Hole",
  "Spider",
  "Snake"
]);

// A ranged fighter has to aim at whoever is closest, because anything else means
// firing a bolt, dart or potion across the arena while an opponent stands in its
// face. Nearest-target tracking is therefore DERIVED from the attack type rather
// than from a per-class flag, so a new ranged class inherits it automatically.
export function usesNearestTarget(fighter) {
  if (!fighter) return false;
  if (RANGED_CLASS_NAMES.has(fighter.name)) return true;
  const attackType = (fighter.attackType || "").toLowerCase();
  return RANGED_ATTACK_TYPES.has(fighter.attackType) || attackType.includes("projectile");
}

// With four fighters in a free-for-all, pure nearest-enemy selection makes the
// whole arena dogpile whoever happens to be closest, which reads as three
// fighters ganging up rather than a brawl. Instead each fighter keeps the target
// it already has while that target is still valid (with aiming spread across
// several opponents), and only re-acquires when it is knocked out. The first
// target is the nearest one, so nobody opens by charging a fighter on the far
// side of the arena, and `isUnderground` is treated as unreachable rather than
// dead so a Tunneler is dropped while submerged and re-acquired once it surfaces.
export function chooseTarget(fighters, index) {
  const self = fighters[index];
  if (!self) return null;
  const current = self.target;
  if (current && isValidTarget(current, self)) {
    if (usesNearestTarget(self)) {
      // Ranged classes track the nearest opponent every frame.
      let nearest = current;
      let nearestDistance = Infinity;
      for (const other of fighters) {
        if (!isValidTarget(other, self) || other.isUnderground) continue;
        const distance = Math.hypot(other.x - self.x, other.y - self.y);
        if (distance < nearestDistance) { nearestDistance = distance; nearest = other; }
      }
      return nearest;
    }
    return current;
  }

  let best = null;
  let bestDistance = Infinity;
  for (const other of fighters) {
    if (!isValidTarget(other, self) || other.isUnderground) continue;
    const distance = Math.hypot(other.x - self.x, other.y - self.y);
    if (distance < bestDistance) { bestDistance = distance; best = other; }
  }
  self.target = best;
  return best;
}

// "Can this attack actually land on this body?" - the targeting question (used by
// touch damage and mines) separate from "can this attack land".
export function canBeVictim(fighter, { overlapOnly = false } = {}) {
  if (!fighter || fighter.isDead || fighter.health <= 0) return false;
  return !(overlapOnly && fighter.isInvulnerable);
}

export function countAlive(fighters) {
  let alive = 0;
  for (const fighter of fighters) {
    if (fighter && !fighter.isDead && fighter.health > 0) alive += 1;
  }
  return alive;
}

// --- One simulation frame ----------------------------------------------------

// Advances a whole bout by one frame. `options`:
//   - dt             simulated seconds this frame (speed and pause already applied)
//   - arenaSize      playable map size
//   - suddenDeathTick  true once per second during sudden death: every living
//                      fighter takes the 2-damage drain
//   - onSuddenDeath  (fighter) => void, called for each drained fighter so the
//                    caller can spawn its own death-drain particles
//   - onContact      ({ x, y }) => void, called when two bodies collide, for the
//                    caller's impact ring
//   - returnAlive    also hand back the living fighter list (the victory check)
//
// Returns { hardestImpact } (0 when nothing hard happened) and, when asked,
// `alive`. Deaths are NOT resolved here: the caller runs its own death sweep so
// placement/survival bookkeeping stays in one place per mode.
export function stepBattle(fighters, options = {}) {
  const {
    dt,
    arenaSize,
    suddenDeathTick = false,
    onSuddenDeath = null,
    onContact = null,
    returnAlive = false
  } = options;

  fighters.forEach((f, i) => {
    // With up to four fighters in the arena, every class targets one valid
    // living opponent (see chooseTarget). Each class's update() only ever
    // reads a single opponent, so this keeps their AI unchanged while
    // making free-for-alls work.
    const opponent = chooseTarget(fighters, i);
    f.opponent = opponent;
    // Other classes' target selection will overwrite f.target below; keep
    // the reference tally here so it stays an accurate "who is aiming at me".
    const aimedAtMe = (f.incomingTargets || 0) + ((opponent && opponent.target === f) ? 1 : 0);
    // The opponents THIS fighter may actually hit. A class only ever sees a
    // single opponent, so anything that has to reach every fighter (touch
    // damage, an explosion, a web) reads this list instead.
    f.victims = fighters.filter(other => other !== f && canBeVictim(other));
    // Who this fighter may body-check. Body attack type is the ONLY gate for
    // touch damage, and it is read through DamageSystem.isBodyAttacker so the
    // arena and the class-level contact hooks can never disagree about who is
    // a body class.
    f.touchVictims = DamageSystem.isBodyAttacker(f)
      ? f.victims.filter(other => !other.isInvulnerable)
      : [];
    if (suddenDeathTick) {
      // A null attacker means it hurts everyone equally and credits nobody.
      DamageSystem.applyDamage(null, f, 2, "AOE", { ignoreCooldown: true });
      onSuddenDeath?.(f);
    }
    f.update(dt, opponent);
    // The sponsored target pass below rewrites `target`, so add this
    // fighter's contribution first and hand the count to the tally that
    // survives it. Each body attack then uses it to spread its damage.
    if (!f.isDead && f.health > 0) f.incomingTargets = aimedAtMe;
  });

  // Commit this frame's target choices. `chooseTarget` writes `self.target`
  // as a side effect, and every class reads its opponent from the VALUE it
  // was handed, so the two can disagree for one frame without any class
  // behaving differently. Writing the fresh target back here settles it.
  fighters.forEach(f => {
    if (!f.isDead && f.health > 0) f.target = f.opponent ?? null;
  });

  // Dead fighters are skipped entirely: no wall collision, no body collision,
  // no hitbox. A corpse cannot shove a living fighter around or be hit again.
  fighters.forEach(f => { if (!f.isDead && f.health > 0) CollisionSystem.resolveFighterWall(f, arenaSize); });

  // Fighter-vs-fighter physics runs for EVERY pair of LIVING fighters, so a
  // 3 or 4-way brawl shoves and bounces exactly like a duel does.
  const alive = fighters.filter(f => !f.isDead && f.health > 0);
  let hardestImpact = 0;
  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      const f1 = alive[i];
      const f2 = alive[j];

      // Read the contact BEFORE resolving the physics. resolveFighterFighter
      // separates overlapping bodies to EXACTLY radius1 + radius2, so a hitbox
      // test run afterwards compares `dist < radius1 + radius2` against a
      // distance it just pinned to that sum - which made a body class
      // sometimes deal no touch damage at all.
      const overlapped = DamageSystem.checkHitbox(f1, f2, "Overlap");
      const touching = CollisionSystem.resolveFighterFighter(f1, f2);

      // Body contact only damages when the fighter's attack type is Body.
      // Contact is `overlapped` (pre-resolution geometry) OR `touching` (the
      // resolver's verdict). Either signal is enough for a genuine touch.
      const contact = overlapped || touching;
      const bodyAttackers = [];
      if (contact && DamageSystem.isBodyAttacker(f1) && f1.damageCooldown <= 0) bodyAttackers.push(f1);
      if (contact && DamageSystem.isBodyAttacker(f2) && f2.damageCooldown <= 0) bodyAttackers.push(f2);
      if (bodyAttackers.length > 0) {
        // Rotate which eligible attacker lands the touch, so several body
        // classes crushing one victim all get credit over time instead of
        // the first-checked pair always winning.
        const turn = bodyAttackers[(f1.incomingTargets ?? 0) % bodyAttackers.length];
        const target = turn === f1 ? f2 : f1;
        if (DamageSystem.applyDamage(turn, target, turn.damage, "Body")) {
          onContact?.({ x: target.x, y: target.y, hit: true });
        }
      }

      if (touching && onContact) onContact({ x: (f1.x + f2.x) / 2, y: (f1.y + f2.y) / 2 });

      // Hard fighter-vs-fighter bounces jolt the camera; both applyDeflection
      // calls already spawned sparks via the particle system.
      hardestImpact = Math.max(hardestImpact, f1.impactStrength || 0, f2.impactStrength || 0);
    }
  }

  return returnAlive ? { hardestImpact, alive } : { hardestImpact };
}

// Decays screen shake for every fighter. Kept next to the step so both modes
// shake for exactly the same length of time.
export function decayScreenShake(fighters, dt) {
  fighters.forEach(f => { if (f.screenShake > 0) f.screenShake = Math.max(0, f.screenShake - dt); });
}

// --- Shared rendering --------------------------------------------------------

// Draws one frame of a bout: the playable-area stage, the fighters and their
// particles. The live arena draws with its own camera (zoom, arena floor art),
// so this is the tournament's draw pass; it paints exactly what makes a fight
// readable - bodies, weapons, auras, hit feedback and every particle the classes
// spawn - inside the same 20px border the collision system bounces fighters off.
//
// A fighter whose draw() throws is reported once and skipped, so one broken
// class cannot blank the whole stage.
const GRID_CELL = 40;
const GRID_STROKE = "rgba(0, 242, 255, 0.12)";

// Caller must clip to the playable area first.
export function drawGridLines(ctx, arenaSize) {
  const inner = 20;
  const end = arenaSize - inner;
  ctx.save();
  ctx.strokeStyle = GRID_STROKE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let p = inner; p <= end; p += GRID_CELL) {
    ctx.moveTo(p + 0.5, inner);
    ctx.lineTo(p + 0.5, end);
    ctx.moveTo(inner, p + 0.5);
    ctx.lineTo(end, p + 0.5);
  }
  ctx.stroke();
  ctx.restore();
}

export function drawBattleFrame(ctx, {
  fighters,
  particles,
  arenaSize,
  time,
  suddenDeath = false,
  deadBodyFade = null,
  onFighterError = null
}) {
  const inner = 20;
  const innerSize = arenaSize - inner * 2;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.shadowBlur = 0;
  ctx.clearRect(0, 0, arenaSize, arenaSize);
  ctx.fillStyle = "#02030a";
  ctx.fillRect(0, 0, arenaSize, arenaSize);

  ctx.save();
  ctx.strokeStyle = "rgba(0, 242, 255, 0.4)";
  ctx.lineWidth = 2;
  ctx.strokeRect(inner, inner, innerSize, innerSize);
  ctx.beginPath();
  ctx.rect(inner, inner, innerSize, innerSize);
  ctx.clip();
  drawGridLines(ctx, arenaSize);

  if (suddenDeath) {
    const pulse = 0.10 + 0.06 * Math.sin(time * 6);
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.fillStyle = "#ff2d55";
    ctx.fillRect(inner, inner, innerSize, innerSize);
    ctx.restore();
  }

  fighters.forEach(f => {
    if (!f) return;
    const dead = f.isDead || f.health <= 0;
    // A corpse has already exploded into particles; the only exception is the
    // brief fade-out of the body that was just knocked out this frame.
    if (dead && !deadBodyFade) return;

    ctx.save();
    ctx.beginPath();
    ctx.rect(inner, inner, innerSize, innerSize);
    ctx.clip();
    ctx.globalAlpha = dead ? deadBodyFade : 1;
    ctx.globalCompositeOperation = "source-over";
    try {
      f.draw(ctx, time);
    } catch (error) {
      onFighterError?.(f, error);
    }
    ctx.restore();
  });

  particles?.draw(ctx);
  ctx.restore();
}
