import { FighterBase } from "../FighterBase.js";
import { DamageSystem } from "../../systems/DamageSystem.js";
import { drawStake, weaponTrail } from "../../systems/Weapons.js";

export class Vampire extends FighterBase {
    constructor(data, x, y) {
        super(data, x, y);
        this.successfulHeals = 0;
        this.evolutionLevel = 0;
        this.hasWings = false;
        this.clawCooldown = 0;
        this.clawTimer = 0;
        // The blood stake orbits continuously; 50% longer than the old 25px.
        this.weaponSpin = 8.05;
        this.weaponReach = (this.radius + 16) * 2.25;
        // Blood Dash (stage 2+): idle -> dash -> drain.
        this.dashState = "idle";
        this.dashRoll = 2;
        this.dashTimer = 0;
        this.dashTarget = null;
        this.drainTimer = 0;
        this.drainTick = 0;
        this.drainTicks = 0;
        this.drainAngle = 0;
        this.dashTrail = [];
    }

    // Every 2s a stage-2 Vampire has a 35% chance to launch at the opponent,
    // latch on and drain 4 HP/s for 3s, healing the 12 HP it takes.
    updateBloodDash(dt, opponent) {
        this.dashTrail = this.dashTrail.filter(p => (p.life -= dt) > 0);
        if (this.isDead || this.health <= 0) { this.endBloodDash(false); return; }

        if (this.dashState === "idle") {
            if (this.evolutionLevel < 1 || !opponent || opponent.isDead || this.isStunned) return;
            if (Math.hypot(opponent.x - this.x, opponent.y - this.y) > 175) return;
            this.dashRoll -= dt;
            if (this.dashRoll > 0) return;
            this.dashRoll = 2;
            if (Math.random() >= 0.35) return;
            this.dashState = "dash";
            this.dashTimer = 1.2;
            this.dashTarget = opponent;
            this.speedMultiplier = 3;
            this.evolveFlash = 0.3;
            this.emitBurst("#ff2038", 18, 380);
            return;
        }

        const target = this.dashTarget;
        if (!target || target.isDead || target.health <= 0) { this.endBloodDash(true); return; }
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const dist = Math.hypot(dx, dy) || 1;

        if (this.dashState === "dash") {
            this.vx = dx / dist;
            this.vy = dy / dist;
            this.lastAngle = Math.atan2(dy, dx);
            this.dashTrail.push({ x: this.x, y: this.y, life: 0.35 });
            this.dashTimer -= dt;
            if (dist <= this.radius + target.radius + 4) {
                this.dashState = "drain";
                this.drainTimer = 3;
                this.drainTick = 0;
                this.drainTicks = 0;
                this.drainAngle = Math.atan2(-dy, -dx);
                this.speedMultiplier = 1;
                this.emitBurst("#ff2038", 26, 420);
                if (this.particleSystem) this.particleSystem.ring(target.x, target.y, "#ff2038", { startRadius: target.radius, endRadius: target.radius + 50, life: 0.35, lineWidth: 4 });
            } else if (this.dashTimer <= 0 || dist > 175) {
                this.endBloodDash(true);
            }
            return;
        }

        // Latched: ride the victim's edge while the drain ticks.
        this.vx = 0;
        this.vy = 0;
        const hold = this.radius + target.radius - 2;
        this.x = target.x + Math.cos(this.drainAngle) * hold;
        this.y = target.y + Math.sin(this.drainAngle) * hold;
        this.drainTimer -= dt;
        this.drainTick -= dt;
        if (this.drainTick <= 0 && this.drainTicks < 3) {
            this.drainTick += 1;
            this.drainTicks++;
            if (DamageSystem.applyDamage(this, target, 4, "AOE", { ignoreCooldown: true })) {
                this.health = Math.min(this.maxHealth, this.health + 4);
                if (this.particleSystem) {
                    this.particleSystem.emit(target.x, target.y, "#ff2038", 10, { angle: this.drainAngle, spread: 0.6, speed: 200, size: 2.6 });
                }
            }
        }
        if (this.drainTimer <= 0) this.endBloodDash(true);
    }

    endBloodDash(relaunch) {
        if (this.dashState === "idle") return;
        this.dashState = "idle";
        this.dashTarget = null;
        this.speedMultiplier = 1;
        this.dashRoll = 4;
        if (relaunch) {
            const angle = Math.random() * Math.PI * 2;
            this.vx = Math.cos(angle);
            this.vy = Math.sin(angle);
        }
    }

    registerClawHit() {
        this.health = Math.min(this.maxHealth, this.health + 5);
        this.successfulHeals++;

        if (this.successfulHeals >= 3 && this.evolutionLevel < 3) {
            this.evolve();
            this.successfulHeals = 0;
        }
    }

    update(dt, opponent) {
        this.updateBloodDash(dt, opponent);
        super.update(dt, opponent);
        this.clawCooldown = Math.max(0, this.clawCooldown - dt);
        this.clawTimer = Math.max(0, this.clawTimer - dt);
        this.evolveFlash = Math.max(0, (this.evolveFlash || 0) - dt);
        // The stake only exists while the fighter is alive: left ticking after
        // death it could still land a lifesteal and even earn an evolution from
        // inside the corpse, so a dead Vampire came back to full health.
        if (this.isDead) return;

        if (!opponent) return;

        // Constant spinning stake: it sweeps the ring and drains whoever it
        // crosses. The heal (and therefore evolution) is paced by the orbit so a
        // blade parked on a target cannot lifesteal every frame.
        const [tip] = this.meleeSpinUpdate(dt);
        const reaching = this.bladeTouches(tip.x, tip.y, opponent, 8);
        if (reaching && !this.weaponHot && this.clawCooldown <= 0) {
            this.weaponHot = true;
            this.lastAngle = tip.angle;
            this.clawTimer = 0.18;
            this.clawCooldown = 0.25;
            this.triggerSwing(tip.angle, { duration: 0.18, reach: 34, color: "#ff2d55" });
            // The hit is not gated on the damage landing any more. A deflected or
            // resisted stake used to leave the fighter unable to heal or evolve for
            // the whole rest of the fight, because `registerClawHit` only ran when
            // `applyDamage` returned true.
            const landed = DamageSystem.applyDamage(this, opponent, this.damage, "Melee", { ignoreCooldown: true });
            this.registerClawHit();
            if (landed && opponent.particleSystem) opponent.particleSystem.emitImpact(opponent.x, opponent.y, "#ff2d55", 14);
        } else if (!reaching) {
            this.weaponHot = false;
        }
    }

    evolve() {
        this.evolutionLevel++;
        this.speed = Math.min(13, this.speed + 2);
        this.damage += 2;
        if (this.evolutionLevel >= 1) {
            this.hasWings = true;
            this.dodgeChance = 0.25;
        }
        this.evolveFlash = 0.6;
        this.emitBurst("#ff2038", 34, 460);
        if (this.particleSystem) {
            this.particleSystem.ring(this.x, this.y, "#ff2038", { startRadius: this.radius, endRadius: 160, life: 0.6, lineWidth: 5 });
        }
    }

    draw(ctx) {
        super.draw(ctx);
        if (this.isDead || this.health <= 0) return;

        // Blood Dash afterimages: fading crimson silhouettes along the dash line.
        this.dashTrail.forEach(p => {
            ctx.save();
            ctx.globalAlpha = Math.max(0, p.life / 0.35) * 0.45;
            ctx.fillStyle = "#b3001f";
            ctx.shadowBlur = 16;
            ctx.shadowColor = "#ff2038";
            ctx.beginPath();
            ctx.arc(p.x, p.y, this.radius * (0.6 + 0.4 * (p.life / 0.35)), 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });

        // Blood Dash drain: pulsing tendrils with droplets flowing into the Vampire.
        const drained = this.dashState === "drain" ? this.dashTarget : null;
        if (drained && !drained.isDead) {
            const now = Date.now() / 1000;
            ctx.save();
            ctx.lineCap = "round";
            ctx.shadowBlur = 14;
            ctx.shadowColor = "#ff2038";
            for (let strand = -1; strand <= 1; strand++) {
                const mx = (drained.x + this.x) / 2 + Math.cos(this.drainAngle + Math.PI / 2) * (strand * 14 + Math.sin(now * 9 + strand) * 6);
                const my = (drained.y + this.y) / 2 + Math.sin(this.drainAngle + Math.PI / 2) * (strand * 14 + Math.sin(now * 9 + strand) * 6);
                ctx.strokeStyle = `rgba(200, 10, 40, ${0.55 - Math.abs(strand) * 0.15})`;
                ctx.lineWidth = 3 - Math.abs(strand);
                ctx.beginPath();
                ctx.moveTo(drained.x, drained.y);
                ctx.quadraticCurveTo(mx, my, this.x, this.y);
                ctx.stroke();
                const t = (now * 1.6 + strand * 0.33) % 1;
                const bx = (1 - t) * (1 - t) * drained.x + 2 * (1 - t) * t * mx + t * t * this.x;
                const by = (1 - t) * (1 - t) * drained.y + 2 * (1 - t) * t * my + t * t * this.y;
                ctx.fillStyle = "#ff6b86";
                ctx.beginPath();
                ctx.arc(bx, by, 3, 0, Math.PI * 2);
                ctx.fill();
            }
            const pulse = 0.5 + 0.5 * Math.sin(now * 10);
            ctx.strokeStyle = `rgba(255, 32, 56, ${0.35 + pulse * 0.4})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius + 8 + pulse * 4, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(drained.x, drained.y, drained.radius + 6 - pulse * 3, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
        // Visual: Evolving wings
        if (this.hasWings) {
            ctx.save();
            ctx.translate(this.x, this.y);

            const wingSize = 15 + (this.evolutionLevel * 3);

            // Left wing
            ctx.fillStyle = "rgba(139, 0, 0, 0.7)";
            ctx.beginPath();
            ctx.ellipse(-this.radius - 5, 0, wingSize / 2, wingSize, -Math.PI / 6, 0, Math.PI * 2);
            ctx.fill();

            // Right wing
            ctx.beginPath();
            ctx.ellipse(this.radius + 5, 0, wingSize / 2, wingSize, Math.PI / 6, 0, Math.PI * 2);
            ctx.fill();

            // Wing veins
            ctx.strokeStyle = "rgba(220, 20, 60, 0.5)";
            ctx.lineWidth = 1;
            for (let i = 0; i < 3; i++) {
                ctx.beginPath();
                ctx.moveTo(-this.radius - 5, -wingSize / 2 + i * (wingSize / 3));
                ctx.lineTo(-this.radius - 15, -wingSize / 2 + i * (wingSize / 3) + 5);
                ctx.stroke();

                ctx.beginPath();
                ctx.moveTo(this.radius + 5, -wingSize / 2 + i * (wingSize / 3));
                ctx.lineTo(this.radius + 15, -wingSize / 2 + i * (wingSize / 3) + 5);
                ctx.stroke();
            }

            ctx.restore();
        }

        // Visual: Blood stake
        ctx.save();
        ctx.translate(this.x, this.y);
        weaponTrail(ctx, this.weaponAngle, Math.sign(this.weaponSpin) || 1, this.radius + 6, this.weaponReach + 4, "#ff2038", { sweep: 1, alpha: 0.3 });
        // The stake spins around the body rather than pointing at the target.
        ctx.rotate(this.weaponAngle);

        // Claw slash appears only during close-range attacks.
        if (this.clawTimer > 0) {
            const opacity = this.clawTimer / 0.18;
            ctx.strokeStyle = `rgba(255, 45, 70, ${opacity})`;
            ctx.shadowBlur = 14;
            ctx.shadowColor = "#ff2038";
            ctx.lineWidth = 4;
            ctx.lineCap = "round";
            for (let claw = -1; claw <= 1; claw++) {
                ctx.beginPath();
                ctx.arc(this.radius + 12, claw * 6, 15, -Math.PI * 0.65, Math.PI * 0.12);
                ctx.stroke();
            }
            ctx.shadowBlur = 0;
        }

        drawStake(ctx, { start: this.radius, length: 56.25 });

        ctx.restore();
    }
}
