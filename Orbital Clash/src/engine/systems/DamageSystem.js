import { audioManager } from "../audio/AudioManager.js";

// See DamageSystem.isBodyAttacker. Listed explicitly because a body class that
// reaches the arena without an attack type (a clone built from a parent object,
// a future subclass) must still body-check rather than sit harmlessly inside an
// opponent. Mahoraga is here for exactly that reason.
const BODY_CLASS_NAMES = new Set(["Duplicator", "Ghost", "Mutant", "Mahoraga"]);

// Contact slack for body/overlap hitboxes. The collision resolver separates two
// overlapping fighters to EXACTLY attacker.radius + victim.radius, so a strict `<`
// rejects the touch on the frame it happens (and re-rejects it every frame while
// bodies rest against each other). A sub-pixel tolerance makes "touching" mean
// contact rather than a knife-edge comparison, so a body class such as the Mutant
// deals damage reliably instead of intermittently doing nothing.
const CONTACT_TOLERANCE = 0.5;

// A hit reads as a "critical" - bigger, brighter, with extra feedback - when the
// attacker flagged it (options.crit) or when it lands a disproportionately large
// blow. The threshold is presentation only: it decides how loud the hit LOOKS,
// never how much it hurts. 18 damage is roughly a heavy melee blow, so routine
// chip damage and DOT ticks stay quiet while an Assassin dagger (25) or a
// Samurai finisher (15, flagged explicitly) pops.
export const CRIT_DAMAGE_THRESHOLD = 18;

export class DamageSystem {
    // The single source of truth for "is this fighter a Body attacker?"
    //
    // A Body attack is the fighter's own body dealing damage on contact, so both
    // the arena's touch pass and every class-level contact hook must ask the same
    // question and get the same answer. It reads the fighter's declared attack
    // category, with a name table for anything that arrives without one - the
    // roster's labels are inconsistent enough ("Bombs", "Area", "Rotating blade")
    // that only the classes whose physical body is genuinely the weapon are listed.
    // Mahoraga included: its fists are attached directly to its body, so it slams
    // rather than swings a weapon. Deriving both places from here means a body
    // class can never take touch damage in one and silently deal none in the other.
    static isBodyAttacker(fighter) {
        if (!fighter) return false;
        if ((fighter.attackType || "").toLowerCase() === "body") return true;
        const attackType = (fighter.attackType || "").toLowerCase();
        if (attackType) return false; // an unknown but EXPLICIT type is not a body
        return BODY_CLASS_NAMES.has(fighter.name);
    }

    static checkHitbox(attacker, victim, category) {
        // A body-vs-body contact test and the test touch damage uses are the SAME
        // geometry, so they share one branch. Splitting them meant a projectile or
        // a class could ask the wrong one and silently miss; resolving both here
        // guarantees they can never drift apart.
        if (category === "Body" || category === "Overlap") {
            const dx = attacker.x - victim.x;
            const dy = attacker.y - victim.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            // A small tolerance so a touch counts when the bodies are EXACTLY at
            // contact distance. The collision resolver pins overlapping fighters to
            // precisely attacker.radius + victim.radius, so a strict `<` failed on
            // the very frame the bodies met and touch damage landed only on a
            // floating-point rounding error - the cause of body classes like the
            // Mutant intermittently dealing no damage on contact.
            return dist <= (attacker.radius + victim.radius) + CONTACT_TOLERANCE;
        }
        if (category === "Melee") {
            // Weapon reach plus the victim's body, so a large Mutant is easier to
            // hit than a small Assassin and every class's melee connects fairly.
            const reach = attacker.radius + 30 + (victim.radius || 0);
            const dx = attacker.x - victim.x;
            const dy = attacker.y - victim.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            return dist < reach;
        }
        return false;
    }

    static checkBeamHit(source, angle, range, victim) {
        // Check if victim is within the beam line
        const beamEndX = source.x + Math.cos(angle) * range;
        const beamEndY = source.y + Math.sin(angle) * range;

        // Distance from victim to beam line
        const dx = beamEndX - source.x;
        const dy = beamEndY - source.y;
        const beamLengthSq = dx * dx + dy * dy;

        const vx = victim.x - source.x;
        const vy = victim.y - source.y;

        // Project victim position onto beam line
        let t = (vx * dx + vy * dy) / beamLengthSq;
        t = Math.max(0, Math.min(1, t));

        const closestX = source.x + t * dx;
        const closestY = source.y + t * dy;

        const distToBeam = Math.hypot(victim.x - closestX, victim.y - closestY);
        return distToBeam < victim.radius + 6; // 6px beam width
    }

    // Returns true when damage actually landed, false when the hit was ignored,
    // avoided or blocked. Every damage source in the game must go through here so
    // invulnerability, adaptation, avoidance, death handling and stat keeping are
    // applied identically for every class.
    static applyDamage(attacker, victim, damage, category, options = {}) {
        if (!victim) return false;
        // A corpse can neither be hit again nor deal damage.
        if (victim.isDead || victim.health <= 0) return false;
        if (attacker === victim && !options.allowSelfDamage) return false;
        // A corpse cannot keep dealing damage either, but a field or a hazard that
        // has no owner at all must still be able to apply its damage.
        if (attacker && attacker.isDead && !options.allowSelfDamage) return false;
        if (attacker && attacker !== victim && attacker.attackPauseTimer > 0) return false;
        if (attacker && attacker.damageCooldown > 0 && !options.ignoreCooldown) return false;
        if (victim.isInvulnerable || victim.isUntargetable) return false;
        // An untouchable victim (God Mode / God Mode A.I. in the HUD) can neither
        // take nor deal damage, whatever the source is - including this world
        // hazard damage that carries no attacker.
        if (victim.isUntouchable) return false;
        if (attacker && attacker !== victim && attacker.isUntouchable) return false;

        let hitResponse;
        if (victim.onHitTaken) {
            hitResponse = victim.onHitTaken(category, damage);
            if (hitResponse === false) return false;
        }

        let finalDamage = typeof hitResponse === "number" ? hitResponse : damage;
        if (typeof hitResponse !== "number" && victim.getDamageMultiplier) {
            finalDamage *= victim.getDamageMultiplier(category);
        }

        // Parry / deflection. Each class decides for itself which categories it
        // can answer: the Knight turns both ranged bolts and melee blows aside,
        // while Mahoraga only swats projectiles once it has adapted to them. Body
        // slams, beams and AOE are never parried, so no class can block its way
        // out of the categories it is meant to be weak to. The projectile itself
        // is knocked aside by the class's own onParried hook.
        if (victim.getParryChance) {
            const parryChance = victim.getParryChance(category);
            if (parryChance > 0 && Math.random() < parryChance) {
                if (victim.onParried) victim.onParried(attacker, category, options.projectile);
                return false;
            }
        }

        // Dodge style avoidance (Vampire wings, Samurai invisibility) for the
        // categories that are not handled by the projectile parry above.
        const avoidance = victim.getAvoidanceChance ? victim.getAvoidanceChance(category) : 0;
        if ((avoidance > 0 && Math.random() < avoidance) ||
            (victim.dodgeChance > 0 && Math.random() < victim.dodgeChance)) {
            if (victim.onAvoidedHit) victim.onAvoidedHit(attacker, category);
            return false;
        }

        const appliedDamage = Math.max(0, finalDamage);

        // How hard the blow reads. An explicit crit flag always wins; otherwise a
        // blow that lands well above an ordinary hit is promoted to one so the
        // feedback matches the number even for classes that never roll a crit.
        const isCrit = options.crit === true || appliedDamage >= CRIT_DAMAGE_THRESHOLD;

        victim.health -= appliedDamage;
        // Per-fighter statistics. Damage received is tracked on the victim so the
        // results screen can show it for every fighter, not just the winner.
        victim.totalDamageTaken = (victim.totalDamageTaken || 0) + appliedDamage;
        if (victim.onDamaged) victim.onDamaged(appliedDamage, category, { crit: isCrit });

        // Presentation-only impact feedback. Every source funnels through here, so
        // crit star-bursts, knockback impulses and the camera jolt are applied
        // identically whether the blow came from a blade, a bullet or a body slam.
        // These never mutate combat state.
        if (isCrit && typeof victim.triggerCriticalFlash === "function") {
            victim.triggerCriticalFlash();
        }
        DamageSystem.applyImpactFeedback(attacker, victim, appliedDamage, category, isCrit, options);

        // Death is resolved before crediting stats so the killer is recorded even
        // when the killing blow comes from a DOT, an AOE field or a clone.
        const lethal = victim.health <= 0;
        if (attacker) {
            // `+=` with no guard produced NaN the moment a fighter had not been
            // initialised with the stat (a clone, a class that resets its own
            // stats, or anything built outside FighterBase), and NaN then poisoned
            // every later addition. Coercing to a number keeps the totals finite.
            attacker.totalDamageDealt = (attacker.totalDamageDealt || 0) + appliedDamage;
            // A "hit" is a landed attack, counted per attack rather than per point
            // of damage, so a chip-damage class does not out-score a heavy hitter.
            attacker.totalHits = (attacker.totalHits || 0) + 1;
            if (lethal) attacker.totalKills = (attacker.totalKills || 0) + 1;
            if (!options.ignoreCooldown) attacker.damageCooldown = 0.5;
            if (attacker.onHit) attacker.onHit(victim);
        }

        if (lethal) {
            victim.die(attacker?.particleSystem);
            victim.killedBy = attacker || null;
        }
        // The attacker's class name selects a weapon-specific impact sound; when a
        // hit has no attacker (fields, sudden death) it falls back to the category.
        audioManager.playHitSfx(category, attacker?.name || null);
        return true;
    }

    // Knockback + camera shake for a landed hit. Kept separate from applyDamage so
    // the geometry of "who got hit" and the feel of "how it landed" can be tuned
    // independently, and so a future caller can ask for the damage without the
    // shove. Everything here is presentation: a missing field on either fighter
    // simply skips that channel rather than throwing.
    static applyImpactFeedback(attacker, victim, damage, category, isCrit, options = {}) {
        if (!victim || victim.isDead) return;

        // How strong the shove / shake is. Scales gently with damage so a chip hit
        // nudges and a crit punctuates, with the crit flag adding a deliberate pop.
        const base = Math.min(1.4, 0.18 + damage / 60) + (isCrit ? 0.5 : 0);
        const strength = options.impact ?? base;

        // Only a direct, aimed blow shoves the victim. AOE fields, beams and body/
        // contact damage are passive or area sources (webs, poison, slams, sudden
        // death) - knocking fighters away from those would fight the very trap or
        // hug that applied them, and would make a DOT field permanently repel its
        // victim instead of holding them in it.
        const knockbackCategory = category !== "AOE" && category !== "Beam" && category !== "Body" && category !== "Overlap";

        if (attacker && attacker !== victim && knockbackCategory) {
            const angle = Math.atan2(victim.y - attacker.y, victim.x - attacker.x);
            // A short outward nudge plus a squash, so the victim visibly recoils
            // along the blow instead of only flashing. vx/vy are a normalised
            // direction (magnitude ~1) that the mover scales by `speed`, so the
            // shove re-normalises after adding - a raw +2.2 would both blow past a
            // unit vector and make the recoil depend on which way the victim moved.
            const shove = (isCrit ? 0.35 : 0.18) * Math.min(1.6, strength);
            const nvx = (victim.vx || 0) + Math.cos(angle) * shove;
            const nvy = (victim.vy || 0) + Math.sin(angle) * shove;
            const magnitude = Math.hypot(nvx, nvy) || 1;
            victim.vx = nvx / magnitude;
            victim.vy = nvy / magnitude;
            // The squash/spark/ring vocabulary belongs to applyDeflection, so reuse
            // it - but only for hits strong enough to be worth a visible recoil.
            // A stream of 1-3 damage DOT ticks must not rattle the body every frame.
            if (strength > 0.35 && typeof victim.applyDeflection === "function") {
                victim.applyDeflection(-Math.cos(angle), -Math.sin(angle), Math.min(1.6, strength), {
                    source: "fighter",
                    other: attacker
                });
            }
            // A critical hit jolts the camera, so the blow is felt as well as seen.
            if (isCrit) {
                victim.screenShake = Math.max(victim.screenShake || 0, 0.12);
            }
        }

        // Beams, body slams and AOE already draw their own area/contact tell; the
        // extra spark burst is reserved for the single-target blows where a crit
        // should read as focused.
        if (isCrit && victim.particleSystem && knockbackCategory) {
            const color = victim.hitColor || attacker?.hitColor || attacker?.color || victim.color;
            victim.particleSystem.ring(victim.x, victim.y, "#ffd166", {
                startRadius: victim.radius,
                endRadius: victim.radius + 70,
                life: 0.32,
                lineWidth: 3,
                alpha: 0.85
            });
            victim.particleSystem.emit(victim.x, victim.y, color, isCrit ? 12 : 6, {
                speed: isCrit ? 460 : 320,
                size: 2.6,
                life: 0.5
            });
        }
    }
}
