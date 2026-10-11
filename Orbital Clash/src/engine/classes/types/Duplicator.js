import { FighterBase } from "../FighterBase.js";
import { DamageSystem } from "../../systems/DamageSystem.js";
import { CollisionSystem } from "../../systems/CollisionSystem.js";

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
        this.cloneCooldown = 0;
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
        const victims = this.touchVictims?.length ? this.touchVictims : (this.opponent ? [this.opponent] : []);
        for (const victim of victims) {
            if (victim.isDead || victim.health <= 0) continue;
            // A clone must spawn on contact regardless of whether the touch was
            // allowed to deal damage (parried, dodged, invulnerable...). The clone
            // spawn is gated only on the actual hitbox overlap below, so contact
            // always duplicates; `onTouchOpponent` is deliberately called even when
            // `applyDamage` refuses the hit.
            if (!DamageSystem.checkHitbox(this, victim, "Overlap")) continue;
            const dealtDamage = this.damageCooldown <= 0
                ? DamageSystem.applyDamage(this, victim, this.damage, "Body")
                : false;
            this.onTouchOpponent(victim, dealtDamage);
        }
    }

    onTouchOpponent(opponent, dealtDamage = true) {
        // Clone spawning is unconditional on contact: it is NOT gated on the touch
        // landing damage. Only the impact sparks are tied to a real hit.
        if (dealtDamage && opponent.particleSystem) {
            opponent.particleSystem.emitImpact(opponent.x, opponent.y, this.color, 10);
        }
        const root = this.root || this;
        // The clone cap is a designed limit, not a chance roll, so it is the only
        // remaining condition that can still suppress a spawn.
        if (root.totalClones >= this.cloneLimit) return;
        if (this.cloneCooldown > 0) return;
        root.spawnClone();
        this.cloneCooldown = 2;
    }

    killCloneTree() {
        this.isDead = true;
        this.health = 0;
        this.clones.forEach(clone => clone.killCloneTree());
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

    applyCloneCombatHits(clone, opponent) {
        if (clone.isDead || !opponent) return;

        if (opponent.name === "Berserker") {
            const bladeDistance = opponent.radius + 37.5;
            [opponent.bladeAngle, opponent.bladeAngle + Math.PI].forEach(angle => {
                const bladeX = opponent.x + Math.cos(angle) * bladeDistance;
                const bladeY = opponent.y + Math.sin(angle) * bladeDistance;
                if (opponent.bladeTouches(bladeX, bladeY, clone, opponent.bladeEdgeRadius)) {
                    DamageSystem.applyDamage(opponent, clone, 8, "Melee", { ignoreCooldown: true });
                    opponent.rotationSpeed *= 1.1;
                }
            });
        }

        if (DamageSystem.checkHitbox(opponent, clone, "Body")) {
            // Clone collisions happen on the opponent's behalf, so they must not
            // consume the opponent's attack cooldown against the real fighter.
            DamageSystem.applyDamage(opponent, clone, opponent.damage, "Body", { ignoreCooldown: true });
            if (opponent.name === "Berserker" && opponent.rotationSpeed !== undefined) {
                opponent.rotationSpeed *= 1.1;
            }
        }

        if (Array.isArray(opponent.projectiles)) {
            opponent.projectiles.forEach(projectile => {
                if (projectile.active && DamageSystem.checkHitbox({
                    x: projectile.x,
                    y: projectile.y,
                    radius: projectile.radius || 5
                }, clone, "Body")) {
                    DamageSystem.applyDamage(opponent, clone, projectile.damage, "Projectile");
                    projectile.active = false;
                }
            });
        }
    }

    update(dt, opponent) {
        if (this.isDead) {
            this.clones.forEach(clone => clone.killCloneTree());
            return;
        }
        super.update(dt, opponent);
        if (this.cloneCooldown > 0) this.cloneCooldown -= dt;

        this.checkTouchDamage(opponent);

        // A clone needs the same victim list and opponent reference as a real
        // fighter: without them it could only ever hit the one opponent the
        // parent was aiming at, and only when standing exactly on it.
        const cloneVictims = this.victims;
        const clones = this.clones.filter(c => !c.isDead && c.health > 0);
        clones.forEach(clone => {
            clone.victims = cloneVictims;
            const aim = opponent && !opponent.isDead ? opponent : cloneVictims?.find(v => !v.isDead) ?? null;
            clone.opponent = aim;
            clone.update(dt, aim);
            this.applyCloneCombatHits(clone, aim);
            // A clone's body is the same weapon as the original's.
            clone.checkTouchDamage(aim);
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
        // Each generation keeps 75% of its parent's health, per the class spec.
        const cloneHealth = Math.max(5, this.health * 0.75);
        const clone = new Duplicator(
            this,
            this.x + (Math.random() - 0.5) * 40,
            this.y + (Math.random() - 0.5) * 40,
            this.generation + 1,
            cloneHealth
        );
        clone.root = root;
        clone.arenaSize = this.arenaSize;
        clone.health = cloneHealth;
        clone.maxHealth = cloneHealth;
        root.clones.push(clone);
    }

    draw(ctx) {
        if (this.isDead || this.health <= 0) return;
        // Draw clones first (behind main body)
        this.clones.forEach(c => {
            ctx.globalAlpha = 0.3 + (1 - (c.generation * 0.1)) * 0.3;
            c.draw(ctx);
            
            // Connection line to parent
            if (this.clones.indexOf(c) < 3) { // Only show for first few clones
                ctx.strokeStyle = `rgba(100, 255, 100, ${0.2 * (1 - c.generation * 0.1)})`;
                ctx.lineWidth = 1;
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                ctx.moveTo(this.x, this.y);
                ctx.lineTo(c.x, c.y);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        });
        ctx.globalAlpha = 1.0;
        
        // Draw main body
        super.draw(ctx);
        
        // Draw generation indicator
        ctx.save();
        ctx.translate(this.x, this.y);
        
        // Generation badge (concentric circles)
        ctx.strokeStyle = "rgba(0, 255, 0, 0.6)";
        ctx.lineWidth = 1;
        for (let i = 0; i < Math.min(this.generation + 1, 3); i++) {
            ctx.beginPath();
            ctx.arc(0, 0, this.radius + 8 + i * 4, 0, Math.PI * 2);
            ctx.stroke();
        }
        
        // Clone count indicator (swarm size, shared across all generations)
        const swarmSize = (this.root || this).totalClones || this.clones.length;
        if (swarmSize > 0) {
            ctx.fillStyle = "rgba(0, 255, 0, 0.8)";
            ctx.font = "9px 'Share Tech Mono', 'Rajdhani', monospace";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("+" + Math.min(swarmSize, this.cloneLimit), 0, -this.radius - 12);
        }
        
        ctx.restore();
    }
}
