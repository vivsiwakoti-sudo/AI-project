import { FighterBase } from "../FighterBase.js";
import { DamageSystem } from "../../systems/DamageSystem.js";
import { CollisionSystem } from "../../systems/CollisionSystem.js";

const CLONE_HEALTH = 15;
// Damage a clone takes from each new contact with any fighter.
const CLONE_TOUCH_DAMAGE = 3;

export class Duplicator extends FighterBase {
    constructor(data, x, y, generation = 0, initialHealth = null) {
        super(data, x, y);
        // Clones are constructed from the parent Duplicator, whose only name-like
        // property is `description2` - so `name` was lost and every clone went into
        // battle with it undefined. Other classes branch on `opponent.name` (and the
        // HUD reads `fighter.name`), so clones must carry the real class name.
        this.name = data?.name ?? "Duplicator";
        this.generation = generation;
        this.health = initialHealth ?? data.health;
        this.maxHealth = this.health;
        this.clones = [];
        this.touchingVictims = new Set(); // Victims in contact last frame; a clone spawns only when one newly enters contact.
        this.touchedBy = new Set();       // Fighters touching this clone last frame; each new contact deals CLONE_TOUCH_DAMAGE.
        this.root = null;          // Set to the original Duplicator for every clone.
        this.totalClones = 0;      // Shared clone cap across the whole swarm.
        this.cloneLimit = data.cloneLimit ?? 50;
    }

    checkTouchDamage(opponent) {
        // Touch damage is limited to one bite per cooldown, so a swarm cannot
        // deal damage hundreds of times per second.
        //
        // It sweeps EVERY overlapping opponent (f.touchVictims, published by the
        // arena) rather than only the single opponent this fighter was handed:
        // in a 3 or 4-way brawl the class only ever sees one of them, so the
        // others used to be able to sit inside the Duplicator for free.
        // `this.opponent` is the fallback for a fighter driven outside the arena.
        const victims = this.touchVictims?.length
            ? this.touchVictims
            : (opponent ? [opponent] : (this.opponent ? [this.opponent] : []));
        const touching = new Set();
        for (const victim of victims) {
            if (victim.isDead || victim.health <= 0) continue;
            if (!DamageSystem.checkHitbox(this, victim, "Overlap")) continue;
            touching.add(victim);
            // A clone spawns on each new contact regardless of whether the touch was
            // allowed to deal damage (parried, dodged, invulnerable...).
            const dealtDamage = this.damageCooldown <= 0
                ? DamageSystem.applyDamage(this, victim, this.damage, "Body")
                : false;
            this.onTouchOpponent(victim, dealtDamage, !this.touchingVictims.has(victim));
        }
        this.touchingVictims = touching;
    }

    onTouchOpponent(opponent, dealtDamage = true, isNewTouch = true) {
        // Only the impact sparks are tied to a real hit.
        if (dealtDamage && opponent.particleSystem) {
            opponent.particleSystem.emitImpact(opponent.x, opponent.y, this.color, 10);
        }
        // One clone per new touch: staying in contact does not spawn more.
        if (!isNewTouch) return;
        const root = this.root || this;
        // The clone cap is a hard stop: at 50 clones the chance to duplicate is 0%.
        if (root.totalClones >= this.cloneLimit) return;
        root.spawnClone();
    }


    killCloneTree(particleSystem = this.particleSystem) {
        // Each clone goes through die() so it gets the same death burst and sound as the original.
        this.clones.forEach(clone => {
            clone.die(particleSystem);
            clone.killCloneTree(particleSystem);
        });
        this.isDead = true;
        this.health = 0;
    }

    keepCloneInArena(clone) {
        const arenaSize = this.arenaSize ?? 800;
        const innerBoundary = 20;
        const min = innerBoundary + clone.radius;
        const max = arenaSize - innerBoundary - clone.radius;

        if (clone.x < min) {
            clone.x = min;
            clone.vx = Math.abs(clone.vx);
        } else if (clone.x > max) {
            clone.x = max;
            clone.vx = -Math.abs(clone.vx);
        }

        if (clone.y < min) {
            clone.y = min;
            clone.vy = Math.abs(clone.vy);
        } else if (clone.y > max) {
            clone.y = max;
            clone.vy = -Math.abs(clone.vy);
        }
    }

    // Any fighter that touches a clone deals CLONE_TOUCH_DAMAGE. It lands once per new
    // contact, the same event that spawns a clone, so a fighter resting against a clone
    // is not drained every frame.
    applyCloneContact(clone, victims) {
        const touching = new Set();
        for (const victim of victims) {
            if (clone.isDead) break;
            if (victim.isDead || victim.health <= 0) continue;
            if (!DamageSystem.checkHitbox(victim, clone, "Body")) continue;
            touching.add(victim);
            if (!clone.touchedBy.has(victim)) {
                // A clone's contact bite always costs 3 HP. Body fighters also land
                // their ordinary contact hit on the same touch.
                const damage = CLONE_TOUCH_DAMAGE
                    + (DamageSystem.isBodyAttacker(victim) ? (victim.damage || 0) : 0);
                DamageSystem.applyDamage(victim, clone, damage, "Body", { ignoreCooldown: true });
            }
            if (victim.name === "Berserker" && victim.rotationSpeed !== undefined) {
                victim.rotationSpeed *= 1.1;
            }
        }
        clone.touchedBy = touching;
    }

    update(dt, opponent) {
        if (this.isDead) {
            this.clones.forEach(clone => clone.killCloneTree());
            return;
        }
        super.update(dt, opponent);

        this.checkTouchDamage(opponent);
        this.updateClones(dt, opponent);
    }

    updateClones(dt, opponent) {
        // A clone is hit by and touches every fighter the parent can, not only the
        // one it aims at, so every contact is checked against the same victim list.
        const cloneVictims = this.victims ?? [];
        // Set fresh each frame: a clone copies its parent's fields at spawn, which
        // would otherwise leave it with a stale touch list.
        const touchVictims = cloneVictims.filter(v => !v.isInvulnerable);
        const clones = this.clones.filter(c => !c.isDead && c.health > 0);
        clones.forEach(clone => {
            clone.victims = cloneVictims;
            clone.touchVictims = touchVictims;
            const aim = opponent && !opponent.isDead ? opponent : cloneVictims.find(v => !v.isDead) ?? null;
            clone.opponent = aim;
            // update() also runs the clone's own touch check (its outgoing bite).
            clone.update(dt, aim);
            this.applyCloneContact(clone, cloneVictims);
            this.keepCloneInArena(clone);
        });
        this.resolveCloneCollisions(clones, cloneVictims);
        // A clone can be dead without health having been driven to exactly 0
        // (killCloneTree sets it, a lethal hit leaves it negative), so test both.
        // Dropping the filter here would leave dead clones updating forever.
        this.clones = this.clones.filter(c => c.health > 0 && !c.isDead);
    }

    // Clones are solid bodies: they bounce off every living fighter, this
    // Duplicator and each other, like any arena fighter does.
    resolveCloneCollisions(clones, victims) {
        const solids = (victims || []).filter(v => v && !v.isDead && v.health > 0 && v !== this);
        for (let i = 0; i < clones.length; i++) {
            const clone = clones[i];
            if (clone.isDead) continue;
            solids.forEach(solid => CollisionSystem.resolveFighterFighter(clone, solid));
            CollisionSystem.resolveFighterFighter(clone, this);
            for (let j = i + 1; j < clones.length; j++) {
                if (!clones[j].isDead) CollisionSystem.resolveFighterFighter(clone, clones[j]);
            }
            this.keepCloneInArena(clone);
        }
    }

    spawnClone() {
        const root = this.root || this;
        if (root.totalClones >= this.cloneLimit) return;
        root.totalClones = (root.totalClones || 0) + 1;
        const clone = new Duplicator(
            this.name === "Mimic" ? {
                name: "Duplicator",
                color: this.color,
                health: this.health,
                damage: this.damage,
                speed: this.speed,
                bodySize: this.bodySize,
                shape: this.shape,
                attackType: "Body",
                cooldown: this.cooldown,
                cloneLimit: this.cloneLimit
            } : this,
            this.x + (Math.random() - 0.5) * 40,
            this.y + (Math.random() - 0.5) * 40,
            this.generation + 1,
            CLONE_HEALTH
        );
        clone.root = root;
        clone.arenaSize = this.arenaSize;
        clone.particleSystem = this.particleSystem ?? root.particleSystem;
        clone.health = CLONE_HEALTH;
        clone.maxHealth = CLONE_HEALTH;
        root.clones.push(clone);
    }

    draw(ctx) {
        if (this.isDead || this.health <= 0) return;
        this.drawClones(ctx);

        // Draw main body
        super.draw(ctx);
        
        // Draw generation indicator
        ctx.save();
        ctx.translate(this.x, this.y);
        
        // Same badge on every Duplicator, so a clone looks exactly like the original.
        ctx.strokeStyle = "rgba(0, 255, 0, 0.6)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius + 8, 0, Math.PI * 2);
        ctx.stroke();
        
        // Swarm size is shown once, on the original only.
        const swarmSize = (this.root || this).totalClones || this.clones.length;
        if (!this.root && swarmSize > 0) {
            ctx.fillStyle = "rgba(0, 255, 0, 0.8)";
            ctx.font = "9px 'Share Tech Mono', 'Rajdhani', monospace";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("+" + Math.min(swarmSize, this.cloneLimit), 0, -this.radius - 12);
        }
        
        ctx.restore();
    }

    drawClones(ctx) {
        this.clones.forEach(c => c.draw(ctx));
    }
}
