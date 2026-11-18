import { FighterBase } from "../FighterBase.js";
import { DamageSystem } from "../../systems/DamageSystem.js";
import { drawAxeHead, weaponTrail } from "../../systems/Weapons.js";

export class Berserker extends FighterBase {
    constructor(data, x, y) {
        super(data, x, y);
        this.bladeAngle = 0;
        // 1 = the 100% baseline speed. It used to start at 2, which read as 200%
        // off the line - double the intended opening pace - before any hit had
        // even stacked it up.
        this.rotationSpeed = 1; // Initial speed: 100%
        // Axes swing FASTER as the fight goes on (each connect multiplies this by
        // 1.1 with no cap), so they must be clamped to the velocity limit on every
        // frame. Without this the blades accelerated without bound and simply
        // tunneled straight through anything they were crossing.
        this.maxRotationSpeed = 60;
        // The axe head is a solid disc of this radius, so a blade can hit the
        // EDGE of an opponent as well as the middle: the centre point only being
        // inside the body meant a grazing pass that clearly touched never dealt
        // damage at all.
        this.bladeEdgeRadius = 13;
    }

    update(dt, opponent) {
        super.update(dt, opponent);
        this.rotationSpeed = Math.min(this.rotationSpeed, this.maxRotationSpeed);
        if (this.attackPauseTimer <= 0) this.bladeAngle += this.rotationSpeed * dt * 5;

        // Blade collision logic
        if (opponent) {
            const bladeDistance = this.radius + 37.5;
            const blade1X = this.x + Math.cos(this.bladeAngle) * bladeDistance;
            const blade1Y = this.y + Math.sin(this.bladeAngle) * bladeDistance;
            const blade2X = this.x + Math.cos(this.bladeAngle + Math.PI) * bladeDistance;
            const blade2Y = this.y + Math.sin(this.bladeAngle + Math.PI) * bladeDistance;

            const blade1Target = this.bladeTouchTarget(blade1X, blade1Y, opponent, this.bladeEdgeRadius);
            const blade2Target = this.bladeTouchTarget(blade2X, blade2Y, opponent, this.bladeEdgeRadius);
            const blade1Hit = blade1Target !== null;
            const blade2Hit = blade2Target !== null;

            // Each blade may only connect once per pass so it cannot shred a stationary target.
            if (blade1Hit && !this.blade1Hot) {
                if (DamageSystem.applyDamage(this, blade1Target, this.damage, "Melee", { ignoreCooldown: true })) {
                    this.rotationSpeed *= 1.1; // Multiplicative stack
                    // Quick axe chop arc toward the target on each connect.
                    this.triggerSwing(Math.atan2(blade1Target.y - this.y, blade1Target.x - this.x), { duration: 0.18, reach: 40, color: "#ff4d4d" });
                    if (blade1Target.particleSystem) blade1Target.particleSystem.emitImpact(blade1X, blade1Y, "#ff4d4d", 12);
                }
                this.blade1Hot = true;
            } else if (!blade1Hit) {
                this.blade1Hot = false;
            }

            if (blade2Hit && !this.blade2Hot) {
                if (DamageSystem.applyDamage(this, blade2Target, this.damage, "Melee", { ignoreCooldown: true })) {
                    this.rotationSpeed *= 1.1; // Multiplicative stack
                    this.triggerSwing(Math.atan2(blade2Target.y - this.y, blade2Target.x - this.x), { duration: 0.18, reach: 40, color: "#ff4d4d" });
                    if (blade2Target.particleSystem) blade2Target.particleSystem.emitImpact(blade2X, blade2Y, "#ff4d4d", 12);
                }
                this.blade2Hot = true;
            } else if (!blade2Hit) {
                this.blade2Hot = false;
            }
        }
    }

    draw(ctx) {
        super.draw(ctx);
        if (this.isDead || this.health <= 0) return;

        ctx.save();
        ctx.translate(this.x, this.y);

        const distance = this.radius + 37.5;
        const intensity = Math.min(1, this.rotationSpeed / 12);
        const direction = 1;
        for (let blade = 0; blade < 2; blade++) {
            const angle = this.bladeAngle + (blade * Math.PI);
            weaponTrail(ctx, angle, direction, distance - 12, distance + 12, "#ff3a3a", { sweep: 0.5 + intensity * 0.9, alpha: 0.18 + intensity * 0.3 });
        }

        for (let blade = 0; blade < 2; blade++) {
            const angle = this.bladeAngle + (blade * Math.PI);
            ctx.save();
            ctx.translate(Math.cos(angle) * distance, Math.sin(angle) * distance);
            ctx.rotate(angle);
            drawAxeHead(ctx, { size: 9, intensity });
            ctx.restore();
        }

        ctx.restore();
    }
}
