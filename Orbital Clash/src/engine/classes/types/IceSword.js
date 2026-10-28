import { FighterBase } from "../FighterBase.js";
import { EffectSystem } from "../../systems/EffectSystem.js";
import { DamageSystem } from "../../systems/DamageSystem.js";
import { drawSword, weaponTrail } from "../../systems/Weapons.js";

// Shared by the hitbox and the drawn blade so they always agree.
const SWORD_LENGTH = 78.75;

export class IceSword extends FighterBase {
    constructor(data, x, y) {
        super(data, x, y);
        this.swordAngle = 0;
        // The blade is 12px wide, so it can hit the EDGE of an opponent as well as
        // the middle: the centre point being inside the body alone meant a grazing
        // pass that clearly touched never dealt damage.
        this.bladeEdgeRadius = 6;
    }

    update(dt, opponent) {
        super.update(dt, opponent);
        if (this.attackPauseTimer <= 0) this.swordAngle += dt * 7.5; // Rotate sword

        // Sword collision logic
        if (opponent && !this.isDead && !opponent.isDead) {
            const swordDistance = this.radius + SWORD_LENGTH;
            const swordX = this.x + Math.cos(this.swordAngle) * swordDistance;
            const swordY = this.y + Math.sin(this.swordAngle) * swordDistance;

            const target = this.bladeTouchTarget(swordX, swordY, opponent, this.bladeEdgeRadius);
            if (target) {
                // The blade may only connect once per sweep, not every frame it overlaps.
                if (this.cooldownTimer <= 0 && DamageSystem.applyDamage(this, target, this.damage, "Melee", { ignoreCooldown: true })) {
                    this.useAbility();
                    this.slashFlash = 1;
                    this.slashX = swordX;
                    this.slashY = swordY;
                    // Quick frost swipe arc in the direction the blade struck.
                    this.triggerSwing(this.swordAngle, { duration: 0.2, reach: 38, color: "#bfe9ff" });
                    EffectSystem.addEffect(target, {
                        name: "slow",
                        duration: 2,
                        onEnd: fighter => { fighter.slowVisual = false; }
                    });
                    target.slowVisual = true;
                    if (target.particleSystem) {
                        target.particleSystem.emitImpact(swordX, swordY, "#bfe9ff", 12);
                    }
                }
            }
        }
        this.slashFlash = Math.max(0, (this.slashFlash || 0) - dt * 4);
    }

    draw(ctx) {
        super.draw(ctx);
        if (this.isDead || this.health <= 0) return;

        ctx.save();
        ctx.translate(this.x, this.y);
        const swordLength = SWORD_LENGTH;
        weaponTrail(ctx, this.swordAngle, 1, this.radius + 8, this.radius + swordLength, "#7fdcff", { sweep: 1.1, alpha: 0.35 });
        ctx.rotate(this.swordAngle);

        drawSword(ctx, {
            start: this.radius,
            length: swordLength,
            width: 12,
            light: "#f4ffff",
            mid: "#6fd4ff",
            dark: "#1e78d8",
            glow: "#6fd4ff",
            glowBlur: 10,
            guardColor: "#8fa7b8",
            guardTrim: "#e8f7ff",
            gripColor: "#26384a",
            wrapColor: "#0d1824",
            pommelColor: "#8fa7b8",
            gem: "#bff3ff"
        });

        // Frost motes drifting off the blade.
        ctx.shadowBlur = 6;
        ctx.shadowColor = "#bff3ff";
        ctx.fillStyle = "rgba(220, 250, 255, 0.7)";
        for (let i = 0; i < 4; i++) {
            const px = this.radius + 12 + Math.random() * (swordLength - 16);
            const py = (Math.random() - 0.5) * 18;
            ctx.beginPath();
            ctx.arc(px, py, 0.8 + Math.random() * 1.2, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }
}
