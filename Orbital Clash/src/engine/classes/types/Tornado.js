import { FighterBase } from "../FighterBase.js";
import { DamageSystem } from "../../systems/DamageSystem.js";

export class Tornado extends FighterBase {
    constructor(data, x, y) {
        super(data, x, y);
        this.cooldownTimer = 0;
        this.aoeActive = false;
        this.aoeTimer = 0;
        this.burstDuration = 0.4;
        this.radiusReach = 150;
    }

    update(dt, opponent) {
        super.update(dt, opponent);

        if (this.aoeActive) {
            this.aoeTimer -= dt;
            if (this.aoeTimer <= 0) {
                this.aoeActive = false;
            }

            // One burst of damage per victim per release (was a per-frame trickle).
            // The ring of wind is an AoE, so it hits every living fighter inside it
            // rather than only the single opponent reference handed over by the
            // arena - the other two fighters of a four-way brawl used to be able
            // to stand in the middle of the burst untouched.
            const inRange = (this.victims?.length ? this.victims : [opponent])
                .filter(f => f && !f.isDead && Math.hypot(f.x - this.x, f.y - this.y) < this.radiusReach + f.radius);
            for (const victim of inRange) {
                if (!DamageSystem.applyDamage(this, victim, this.damage, "AOE", { ignoreCooldown: true })) continue;
                const angle = Math.atan2(victim.y - this.y, victim.x - this.x);
                victim.vx = Math.cos(angle);
                victim.vy = Math.sin(angle);
                if (victim.particleSystem) victim.particleSystem.emitImpact(victim.x, victim.y, "#a8f0ff", 18);
            }
            this.burstHit = true;
            if (this.particleSystem) {
                for (let i = 0; i < 2; i++) {
                    const angle = Math.random() * Math.PI * 2;
                    this.particleSystem.emit(this.x, this.y, "#cdf6ff", 1, {
                        angle,
                        spread: 0.4,
                        speed: 420,
                        size: 2.6,
                        life: 0.4
                    });
                }
            }
            return;
        }

        // cooldownTimer is ticked by FighterBase; do not decrement it again here.
        if (this.cooldownTimer <= 0) {
            this.aoeActive = true;
            this.aoeTimer = this.burstDuration;
            this.cooldownTimer = this.cooldown;
            this.burstHit = false;
            this.useAbility();
            this.emitBurst("#cdf6ff", 20, 420);
            if (this.particleSystem) {
                this.particleSystem.ring(this.x, this.y, "#9fe8ff", { startRadius: 10, endRadius: this.radiusReach, life: 0.4, lineWidth: 5 });
            }
        }
    }

    draw(ctx) {
        super.draw(ctx);
        if (this.isDead || this.health <= 0) return;

        if (this.aoeActive) {
            ctx.save();
            ctx.lineCap = "round";

            // Center-originating wind rings expand outward and fade away.
            const windStrength = 1 - (this.aoeTimer / 0.5);
            ctx.shadowBlur = 14;
            ctx.shadowColor = "#38d8ff";
            for (let i = 0; i < 3; i++) {
                const ringProgress = Math.max(0, windStrength - i * 0.18);
                const ringRadius = this.radius + ringProgress * (150 - this.radius);
                const opacity = (1 - ringProgress) * (1 - i / 4) * 0.75;
                ctx.strokeStyle = `rgba(120, 230, 255, ${opacity})`;
                ctx.lineWidth = 4 - i;
                ctx.beginPath();
                ctx.arc(this.x, this.y, ringRadius, 0, Math.PI * 2);
                ctx.stroke();
            }

            // Swirling wind arcs that rotate and taper.
            const spin = windStrength * 6;
            for (let s = 0; s < 6; s++) {
                const base = spin + s * (Math.PI * 2 / 6);
                const r0 = this.radius + 6 + windStrength * 20;
                const r1 = this.radius + 30 + windStrength * 110;
                ctx.strokeStyle = `rgba(200, 245, 255, ${(1 - windStrength * 0.6) * 0.55})`;
                ctx.lineWidth = 3;
                ctx.beginPath();
                for (let k = 0; k <= 12; k++) {
                    const t = k / 12;
                    const a = base + t * 1.6;
                    const r = r0 + (r1 - r0) * t;
                    if (k === 0) ctx.moveTo(this.x + Math.cos(a) * r, this.y + Math.sin(a) * r);
                    else ctx.lineTo(this.x + Math.cos(a) * r, this.y + Math.sin(a) * r);
                }
                ctx.stroke();
            }

            // Bright center vortex releases the outward pulse.
            const core = this.radius + (1 - windStrength) * 14;
            const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, core);
            g.addColorStop(0, `rgba(255, 255, 255, ${(1 - windStrength) * 0.7})`);
            g.addColorStop(1, "rgba(0, 220, 255, 0)");
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(this.x, this.y, core, 0, Math.PI * 2);
            ctx.fill();

            // Wind particles
            ctx.fillStyle = `rgba(220, 255, 255, ${windStrength * 0.7})`;
            for (let i = 0; i < 10; i++) {
                const angle = (i / 10) * Math.PI * 2 + spin * 0.5;
                const particleDistance = this.radius + windStrength * (150 - this.radius);
                ctx.beginPath();
                ctx.arc(this.x + Math.cos(angle) * particleDistance, this.y + Math.sin(angle) * particleDistance, 2.2, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.restore();
        }
    }
}
