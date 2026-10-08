import { FighterBase } from "../FighterBase.js";
import { DamageSystem } from "../../systems/DamageSystem.js";
import { drawScythe, weaponTrail } from "../../systems/Weapons.js";

export class Reaper extends FighterBase {
    constructor(data, x, y) {
        super(data, x, y);
        this.currentDamage = data.damage;
        this.scytheAngle = 0;
        this.scytheBladeLength = 72; // 50% larger than the original 48px
        // The scythe multiplies its own damage by 1.25 on every landed hit with no
        // cap, so by late game it swings for thousands and simply tunnels straight
        // through whoever it is aimed at. This ceiling is far above any health pool
        // a fighter can ever reach, so the snowball still lands as the one-hit
        // killer the class is built to be.
        this.maxDamage = 10000;
    }

    update(dt, opponent) {
        super.update(dt, opponent);
        if (this.attackPauseTimer <= 0) this.scytheAngle += dt * 8; // Faster scythe rotation speed

        // Scythe collision
        if (opponent && !opponent.isDead) {
            // Sample the blade along its length so the hitbox matches the enlarged
            // scythe: the tip reaches `bladeLength` past the body, not just the hilt.
            const scytheDistance = this.radius + 30;
            const scytheX = this.x + Math.cos(this.scytheAngle) * scytheDistance;
            const scytheY = this.y + Math.sin(this.scytheAngle) * scytheDistance;
            const tipDistance = this.radius + 5 + this.scytheBladeLength;
            const tipX = this.x + Math.cos(this.scytheAngle) * tipDistance;
            const tipY = this.y + Math.sin(this.scytheAngle) * tipDistance;

            if (this.bladeTouches(tipX, tipY, opponent, 12) && this.cooldownTimer <= 0) {
                const dealt = DamageSystem.applyDamage(this, opponent, this.currentDamage, "Melee", { ignoreCooldown: true });
                // Only a *successful* hit scales the scythe, so a miss or dodge costs nothing.
                if (dealt) {
                    this.useAbility();
                    // Multiply damage on hit, clamped so a long fight cannot push the
                    // stored value to Infinity.
                    this.currentDamage = Math.min(this.maxDamage, this.currentDamage * 1.25);
                    this.reapFlash = 1;
                    // Heavy scythe sweep arc, longer reach to match the bigger blade.
                    this.triggerSwing(this.scytheAngle, { duration: 0.28, reach: 54, color: "#d49aff" });
                    if (opponent.particleSystem) {
                        opponent.particleSystem.emitImpact(scytheX, scytheY, "#d49aff", 24);
                        opponent.particleSystem.ring(this.x, this.y, "#8b2cff", { startRadius: this.radius, endRadius: 120, life: 0.4, lineWidth: 4 });
                    }
                }
            }
        }
        this.reapFlash = Math.max(0, (this.reapFlash || 0) - dt * 3);
    }

    draw(ctx) {
        super.draw(ctx);
        if (this.isDead || this.health <= 0) return;

        ctx.save();
        ctx.translate(this.x, this.y);

        // Death aura (gets stronger with damage multiplier), drawn under the blade.
        const auraIntensity = Math.min(0.5, this.currentDamage / 50);
        const aura = ctx.createRadialGradient(0, 0, this.radius, 0, 0, this.radius + 38);
        aura.addColorStop(0, `rgba(139, 44, 255, ${auraIntensity * 0.7})`);
        aura.addColorStop(1, "rgba(139, 44, 255, 0)");
        ctx.fillStyle = aura;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius + 38, 0, Math.PI * 2);
        ctx.fill();

        weaponTrail(ctx, this.scytheAngle, 1, this.radius + 10, this.radius + 5 + this.scytheBladeLength, "#b57cff", { sweep: 1.2, alpha: 0.4 });
        ctx.rotate(this.scytheAngle);
        drawScythe(ctx, {
            start: this.radius,
            length: this.scytheBladeLength,
            intensity: Math.min(1, this.currentDamage / 200)
        });

        ctx.restore();
    }
}
