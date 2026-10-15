import { FighterBase } from "../FighterBase.js";
import { DamageSystem } from "../../systems/DamageSystem.js";
import { EffectSystem } from "../../systems/EffectSystem.js";

export class Grappler extends FighterBase {
    constructor(data, x, y) {
        super(data, x, y);
        this.isHookActive = false;
        this.hookTimer = 0;
        this.cooldownDuration = data.cooldown || 4;
        this.latched = false;
    }

    update(dt, opponent) {
        super.update(dt, opponent);

        if (!this.isHookActive && this.cooldownTimer <= 0) {
            // The hook takes the nearest living fighter inside its reach, not only the one this class aimed at.
            let nearest = null;
            let nearestDistance = Infinity;
            for (const f of this.reachableVictims(opponent)) {
                const d = Math.hypot(f.x - this.x, f.y - this.y);
                if (d < 100 + f.radius && d < nearestDistance) {
                    nearest = f;
                    nearestDistance = d;
                }
            }
            if (nearest) {
                this.isHookActive = true;
                this.hookTarget = nearest;
                this.hookTimer = 2; // Duration
                this.latched = false;
                this.useAbility();
            }
        }

        // NB: the ability cooldown is already ticked down once by FighterBase.
        // Decrementing it here as well would run every cooldown at double speed.

        if (this.isHookActive) {
            this.hookTimer -= dt;
            const hooked = this.hookTarget;
            // A pin that has lost its victim (the target died to something else
            // mid-spin) must release cleanly rather than read a dead fighter.
            if (!hooked || hooked.isDead) {
                this.isHookActive = false;
                this.latched = false;
                this.cooldownTimer = this.cooldownDuration;
                return;
            }
            // Hook reaches out 100px and latches for 2 seconds while it spins the victim.
            const hookDistance = Math.hypot(hooked.x - this.x, hooked.y - this.y);
            if (hookDistance < 100 + hooked.radius) {
                hooked.isPinned = true;
                hooked.isStuck = true;
                hooked.pinTimer = this.hookTimer;
                hooked.x = this.x + Math.cos(this.hookTimer * 5) * Math.min(70, hookDistance);
                hooked.y = this.y + Math.sin(this.hookTimer * 5) * Math.min(70, hookDistance);
                // A grappled victim is held fast, so its attacks are frozen for as
                // long as the chain keeps it latched: spinning blades stop turning
                // and ranged volleys stop firing. The pause is refreshed every frame
                // so it lasts exactly as long as the pin and then lapses on its own.
                hooked.pauseAttacks?.(0.1);
                if (!this.latched) {
                    this.latched = true;
                    DamageSystem.applyDamage(this, hooked, this.damage, "Melee", { ignoreCooldown: true });
                    if (hooked.particleSystem) hooked.particleSystem.emitImpact(hooked.x, hooked.y, "#c77dff", 16);
                }
            }
            if (this.hookTimer <= 0) {
                this.isHookActive = false;
                this.latched = false;
                this.cooldownTimer = this.cooldownDuration;
                if (hooked) {
                    hooked.releasePin();
                    // Released at double momentum, then decays back when the effect ends.
                    hooked.vx *= 2;
                    hooked.vy *= 2;

                    // Add MomentumBoost
                    EffectSystem.addEffect(hooked, {
                        name: "MomentumBoost",
                        duration: 2.5,
                        onEnd: (fighter) => {
                            if (fighter.vx) fighter.vx /= 2;
                            if (fighter.vy) fighter.vy /= 2;
                        }
                    });
                }
            }
        }
    }

    draw(ctx) {
        super.draw(ctx);
        if (this.isDead || this.health <= 0) return;

        if (this.isHookActive) {
            ctx.save();
            const spinAngle = this.hookTimer * 5;
            const hookX = this.x + Math.cos(spinAngle) * 100;
            const hookY = this.y + Math.sin(spinAngle) * 100;

            // Faint spin ring showing the grapple's reach.
            ctx.strokeStyle = "rgba(210, 90, 230, 0.35)";
            ctx.lineWidth = 1.5;
            ctx.setLineDash([6, 8]);
            ctx.shadowBlur = 8;
            ctx.shadowColor = "#d25ae6";
            ctx.beginPath();
            ctx.arc(this.x, this.y, 100, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);

            // Chain: alternating oval links along the line.
            const links = 12;
            ctx.shadowBlur = 0;
            for (let i = 1; i <= links; i++) {
                const t = i / links;
                ctx.save();
                ctx.translate(this.x + (hookX - this.x) * t, this.y + (hookY - this.y) * t);
                ctx.rotate(spinAngle + (i % 2 ? Math.PI / 2 : 0));
                ctx.strokeStyle = i % 2 ? "#aab4c2" : "#6b7685";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.ellipse(0, 0, 4.5, 2.4, 0, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            }

            // Three-pronged grapnel head at the end of the chain.
            ctx.translate(hookX, hookY);
            ctx.rotate(spinAngle);
            ctx.shadowBlur = 14;
            ctx.shadowColor = "#d25ae6";
            const steel = ctx.createLinearGradient(0, -8, 0, 8);
            steel.addColorStop(0, "#f0f3f8");
            steel.addColorStop(1, "#5f6978");
            ctx.strokeStyle = steel;
            ctx.lineWidth = 3;
            ctx.lineCap = "round";
            for (const a of [-0.9, 0, 0.9]) {
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.quadraticCurveTo(8, a * 7, 14, a * 12);
                ctx.stroke();
            }
            ctx.fillStyle = "#d9dee6";
            ctx.beginPath();
            ctx.arc(0, 0, 4, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        }
    }
}
