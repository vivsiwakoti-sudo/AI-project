import { FighterBase } from "../FighterBase.js";
import { Projectile } from "../Projectile.js";
import { DamageSystem } from "../../systems/DamageSystem.js";
import { audioManager } from "../../audio/AudioManager.js";

export class BlackHole extends FighterBase {
    constructor(data, x, y) {
        super(data, x, y);
        this.cooldownTimer = 0;
        this.activeHole = null; // {x, y, duration, damageTicks}
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

    update(dt, opponent) {
        super.update(dt, opponent);

        if (this.activeHole) {
            this.activeHole.duration -= dt;

            // Pull every living fighter near the event horizon, not just the one
            // opponent reference handed over by the arena. The vector was also
            // pointing the WRONG WAY: `hole -> fighter` added to the fighter's
            // velocity pushes them away from the hole, so the "gravity well" was
            // gently repelling its victims. It is now reversed, so they are dragged
            // in as intended.
            const pulled = (this.victims?.length ? this.victims : (opponent ? [opponent] : []))
                .filter(f => f && !f.isDead);
            const ticksDue = this.holeTicksLeft > 0 && this.holeTickAccumulator + dt >= 0.5;
            pulled.forEach(victim => {
                const dx = this.activeHole.x - victim.x;
                const dy = this.activeHole.y - victim.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const reach = 100 + victim.radius;
                if (dist < reach && dist > 5) {
                    victim.vx += (dx / dist) * 10 * dt;
                    victim.vy += (dy / dist) * 10 * dt;
                    victim.isPulledIn = true;
                } else {
                    victim.isPulledIn = false;
                }

                // Damage ticks (3 ticks of 5 damage over the life of the hole).
                // Any victim inside the horizon is crushed, whether or not it is
                // the fighter this class happens to be aiming at.
                if (dist < reach && ticksDue && this.holeTicksLeft > 0) {
                    this.holeTicksLeft--;
                    audioManager.playBlackHoleTick();
                    DamageSystem.applyDamage(this, victim, 5, "AOE", { ignoreCooldown: true });
                }
            });
            if (this.holeTicksLeft > 0) {
                this.holeTickAccumulator = (this.holeTickAccumulator || 0) + dt;
                if (this.holeTickAccumulator >= 0.5) this.holeTickAccumulator -= 0.5;
            }

            if (this.activeHole.duration <= 0) {
                this.activeHole = null;
                this.stopHoleLoop();
            }
            return;
        }

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
                this.activeHole = { x: projectile.x, y: projectile.y, duration: 1.8 };
                this.holeTicksLeft = 3;
                this.holeTickAccumulator = 0;
                projectile.active = false;
                // The event horizon tearing open: boom, then the sustained rumble.
                audioManager.playBlackHoleOpen();
                this.startHoleLoop();
                if (this.particleSystem) {
                    this.particleSystem.emit(projectile.x, projectile.y, "#c77dff", 40, { speed: 420, size: 3.4 });
                    this.particleSystem.ring(projectile.x, projectile.y, "#8a2be2", { startRadius: 8, endRadius: 200, life: 0.6, lineWidth: 6 });
                }
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
            ctx.arc(0, 0, 100, 0, Math.PI * 2);
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
