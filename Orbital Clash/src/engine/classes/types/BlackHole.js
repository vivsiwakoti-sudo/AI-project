import { FighterBase } from "../FighterBase.js";
import { Projectile } from "../Projectile.js";
import { DamageSystem } from "../../systems/DamageSystem.js";
import { audioManager } from "../../audio/AudioManager.js";

// Same inset as the inner border in CollisionSystem.resolveFighterWall.
const WALL_INSET = 20;
const PULL_RANGE = 200;
// The opening blast: anyone caught inside the hole during its first
// INITIAL_BURST_SECONDS takes INITIAL_TICKS ticks of INITIAL_TICK_DAMAGE, spaced
// INITIAL_TICK_INTERVAL apart - always three ticks, however long they stay in.
const INITIAL_BURST_SECONDS = 0.3;
const INITIAL_TICKS = 3;
const INITIAL_TICK_DAMAGE = 5;
const INITIAL_TICK_INTERVAL = 0.1;
// Anyone caught after that blast takes one heavy hit and is flung out of the hole.
const LATE_CATCH_DAMAGE = 10;

export class BlackHole extends FighterBase {
    constructor(data, x, y) {
        super(data, x, y);
        this.cooldownTimer = 0;
        // {x, y, duration, age, struck, ejected}
        // struck: victim -> pending blast ticks; ejected: victims already flung out.
        this.activeHole = null;
        this.projectiles = [];
        this.holeLoopStop = null; // stopper for the looped gravity rumble
    }

    // Starts the looping pull hum when the event horizon opens, and silences it
    // the moment the hole collapses. Guarded so a double-call can never stack
    // two loops on top of each other.
    startHoleLoop() {
        if (this.holeLoopStop) return;
        this.holeLoopStop = audioManager.startBlackHoleLoop();
    }

    stopHoleLoop() {
        if (!this.holeLoopStop) return;
        this.holeLoopStop();
        this.holeLoopStop = null;
    }

    // Opens an event horizon at (x, y). Used both when a singularity strikes a
    // fighter and when it reaches the arena wall.
    openHole(x, y, projectile) {
        this.activeHole = { x, y, duration: 1.8, age: 0, struck: new Map(), ejected: new Set() };
        projectile.active = false;
        // The event horizon tearing open: boom, then the sustained rumble.
        audioManager.playBlackHoleOpen();
        this.startHoleLoop();
        if (this.particleSystem) {
            this.particleSystem.emit(x, y, "#c77dff", 40, { speed: 420, size: 3.4 });
            this.particleSystem.ring(x, y, "#8a2be2", { startRadius: 8, endRadius: PULL_RANGE, life: 0.6, lineWidth: 6 });
        }
    }

    // A fighter that wanders into the hole after the opening blast takes one heavy
    // hit and is thrown straight out of it. AOE damage deliberately has no
    // knockback of its own (see DamageSystem), so the shove is done here: the
    // victim's heading points away from the hole, and it is exempt from the pull
    // for the rest of this hole so it is not simply dragged back in. The throw
    // happens whether or not the damage was dodged - it is the blast, not the hit.
    flingOut(hole, victim, dx, dy, dist) {
        hole.ejected.add(victim);
        audioManager.playBlackHoleTick();
        DamageSystem.applyDamage(this, victim, LATE_CATCH_DAMAGE, "AOE", { ignoreCooldown: true });
        victim.vx = dist > 0 ? -dx / dist : 1;
        victim.vy = dist > 0 ? -dy / dist : 0;
        if (victim.particleSystem) victim.particleSystem.emitImpact(victim.x, victim.y, "#c77dff", 14);
    }

    update(dt, opponent) {
        super.update(dt, opponent);

        if (this.activeHole) {
            const hole = this.activeHole;
            hole.duration -= dt;
            hole.age += dt;
            const inOpeningBlast = hole.age <= INITIAL_BURST_SECONDS;

            // Pull every living fighter near the event horizon, not just the one
            // opponent reference handed over by the arena. The vector is reversed
            // from a repulsion (`hole -> fighter`), so victims are dragged in.
            const pulled = (this.victims?.length ? this.victims : (opponent ? [opponent] : []))
                .filter(f => f && !f.isDead);
            pulled.forEach(victim => {
                const dx = hole.x - victim.x;
                const dy = hole.y - victim.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const inRange = dist < PULL_RANGE;

                // Each fighter is dealt with once per event horizon, the first time
                // it is inside it. It is recorded even if the hit is dodged or
                // parried, so a fighter that stays in range is never re-rolled.
                if (inRange && !hole.struck.has(victim) && !hole.ejected.has(victim)) {
                    if (inOpeningBlast) {
                        // Caught by the opening blast: three ticks of 5, first one now.
                        hole.struck.set(victim, { ticksLeft: INITIAL_TICKS, timer: 0 });
                    } else {
                        this.flingOut(hole, victim, dx, dy, dist);
                    }
                }

                if (inRange && dist > 5 && !hole.ejected.has(victim)) {
                    victim.vx += (dx / dist) * 10 * dt;
                    victim.vy += (dy / dist) * 10 * dt;
                    victim.isPulledIn = true;
                } else {
                    victim.isPulledIn = false;
                }
            });

            // Opening-blast ticks. They finish even if the victim is dragged or
            // flung out of range meanwhile - that is what makes it always three.
            for (const [victim, blast] of hole.struck) {
                if (blast.ticksLeft <= 0 || victim.isDead) continue;
                blast.timer -= dt;
                if (blast.timer > 0) continue;
                blast.timer += INITIAL_TICK_INTERVAL;
                blast.ticksLeft -= 1;
                audioManager.playBlackHoleTick();
                DamageSystem.applyDamage(this, victim, INITIAL_TICK_DAMAGE, "AOE", { ignoreCooldown: true });
            }

            if (this.activeHole.duration <= 0) {
                pulled.forEach(victim => { victim.isPulledIn = false; });
                this.activeHole = null;
                this.stopHoleLoop();
            }
            return;
        }

        const arenaSize = this.arenaSize ?? 800;
        this.projectiles.forEach(projectile => {
            projectile.update(dt);
            if (opponent && DamageSystem.checkHitbox({ x: projectile.x, y: projectile.y, radius: 10 }, opponent, "Body")) {
                // The singularity is a ranged shot, so a parry can swat the whole
                // projectile away before it ever opens its event horizon.
                const spawnsHole = opponent.getParryChance ? opponent.getParryChance("Projectile") : 0;
                if (spawnsHole > 0 && Math.random() < spawnsHole) {
                    if (opponent.onParried) opponent.onParried(this, "Projectile", projectile);
                    return;
                }
                this.openHole(projectile.x, projectile.y, projectile);
                return;
            }
            // A singularity that reaches the wall collapses there instead, so the
            // hole is clamped to the inset edge. The <= / >= checks also catch a
            // projectile that Projectile.update already deactivated past the edge.
            const atWall = projectile.x <= WALL_INSET || projectile.x >= arenaSize - WALL_INSET
                || projectile.y <= WALL_INSET || projectile.y >= arenaSize - WALL_INSET;
            if (atWall) {
                const x = Math.min(Math.max(projectile.x, WALL_INSET), arenaSize - WALL_INSET);
                const y = Math.min(Math.max(projectile.y, WALL_INSET), arenaSize - WALL_INSET);
                this.openHole(x, y, projectile);
            }
        });
        this.projectiles = this.projectiles.filter(projectile => projectile.active);

        // cooldownTimer is ticked by FighterBase; do not decrement it again here.
        if (this.cooldownTimer <= 0 && opponent) {
            const targetAngle = Math.atan2(opponent.y - this.y, opponent.x - this.x);
            const misses = Math.random() < 0.25;
            const launchAngle = misses
                ? targetAngle + (Math.random() - 0.5) * 1.2
                : targetAngle;
            this.projectiles.push(new Projectile(
                this.x,
                this.y,
                Math.cos(launchAngle) * 7,
                Math.sin(launchAngle) * 7,
                0,
                this
            ));
            // A launched singularity whooshes as it leaves the fighter.
            audioManager.playBlackHoleLaunch();
            this.cooldownTimer = this.cooldown;
        }
    }

    draw(ctx, time = 0) {
        super.draw(ctx);
        if (this.isDead || this.health <= 0) return;

        this.projectiles.forEach(projectile => {
            ctx.save();
            const halo = ctx.createRadialGradient(projectile.x, projectile.y, 4, projectile.x, projectile.y, 18);
            halo.addColorStop(0, "rgba(181, 107, 255, 0.7)");
            halo.addColorStop(1, "rgba(138, 43, 226, 0)");
            ctx.fillStyle = halo;
            ctx.beginPath();
            ctx.arc(projectile.x, projectile.y, 18, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#05000a";
            ctx.shadowBlur = 18;
            ctx.shadowColor = "#8A2BE2";
            ctx.beginPath();
            ctx.arc(projectile.x, projectile.y, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "#d2a8ff";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(projectile.x, projectile.y, 9.5, time * 4, time * 4 + Math.PI * 1.3);
            ctx.stroke();
            ctx.restore();
        });

        if (this.activeHole) {
            const { x, y } = this.activeHole;
            const diskOpacity = 1 - (this.activeHole.duration / 3);
            ctx.save();

            // Gravity-well glow drawn under the disk.
            const well = ctx.createRadialGradient(x, y, 20, x, y, 110);
            well.addColorStop(0, `rgba(120, 60, 220, ${0.35 * diskOpacity + 0.1})`);
            well.addColorStop(1, "rgba(60, 20, 140, 0)");
            ctx.fillStyle = well;
            ctx.beginPath();
            ctx.arc(x, y, 110, 0, Math.PI * 2);
            ctx.fill();

            // Accretion disk: tilted glowing ellipses that rotate.
            ctx.translate(x, y);
            ctx.rotate(time * 0.6);
            for (let i = 0; i < 4; i++) {
                ctx.strokeStyle = `rgba(${150 + i * 25}, ${90 + i * 20}, 255, ${(0.35 + diskOpacity * 0.5) * (1 - i / 5)})`;
                ctx.lineWidth = 4 - i * 0.8;
                ctx.shadowBlur = 14;
                ctx.shadowColor = "#a56bff";
                ctx.beginPath();
                ctx.ellipse(0, 0, 40 + i * 14, 14 + i * 5, 0, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.rotate(-time * 0.6);

            // Event horizon with a lit rim.
            ctx.shadowBlur = 24;
            ctx.shadowColor = "#9b6bff";
            ctx.fillStyle = "#000";
            ctx.beginPath();
            ctx.arc(0, 0, 30, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.strokeStyle = `rgba(190, 150, 255, ${0.5 + diskOpacity * 0.4})`;
            ctx.lineWidth = 2;
            ctx.stroke();

            // Pull-range indicator.
            ctx.strokeStyle = `rgba(130, 80, 230, ${diskOpacity * 0.5})`;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([5, 7]);
            ctx.beginPath();
            ctx.arc(0, 0, PULL_RANGE, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.restore();
        }
    }

    die(particleSystem) {
        // Never leave the gravity hum running after the fighter is gone.
        this.stopHoleLoop();
        super.die(particleSystem);
    }
}
