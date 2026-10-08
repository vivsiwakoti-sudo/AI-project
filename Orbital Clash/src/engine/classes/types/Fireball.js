import { FighterBase } from "../FighterBase.js";
import { Projectile } from "../Projectile.js";
import { DamageSystem } from "../../systems/DamageSystem.js";
import { EffectSystem } from "../../systems/EffectSystem.js";

export class Fireball extends FighterBase {
    constructor(data, x, y) {
        super(data, x, y);
        this.projectiles = [];
        this.attackTimer = 0;
        this.shotsFired = 0;
        this.fireballId = 0;
    }

    update(dt, opponent) {
        super.update(dt, opponent);
        this.attackTimer -= dt;
        if (this.attackTimer <= 0 && opponent) {
            this.shotsFired++;
            const baseAngle = Math.atan2(opponent.y - this.y, opponent.x - this.x);
            // Fire increasing number of fireballs in a spread towards opponent
            for (let i = 0; i < this.shotsFired; i++) {
                const angle = baseAngle + (Math.random() - 0.5) * 0.5;
                const vx = Math.cos(angle) * 6;
                const vy = Math.sin(angle) * 6;
                this.projectiles.push(new Projectile(this.x, this.y, vx, vy, 5, this));
            }
            this.attackTimer = 3;
        }

        this.projectiles.forEach(p => {
            p.update(dt);
            // A fireball is a travelling hitbox, so it can strike any fighter it
            // crosses rather than only the one opponent reference handed over by
            // the arena.
            const candidates = this.victims?.length ? this.victims : (opponent ? [opponent] : []);
            const struck = candidates.find(f => f && !f.isDead
                && DamageSystem.checkHitbox({ x: p.x, y: p.y, radius: 5 }, f, "Body"));
            if (struck) {
                // The projectile is handed to the damage system so a parrying
                // target can turn this exact shot aside rather than merely void it.
                const landed = DamageSystem.applyDamage(this, struck, p.damage, "Projectile", { projectile: p });
                if (!landed) { p.active = false; return; }
                const MAX_BURNS = 5;
                const burns = struck.statusEffects.filter(e => e.name.startsWith("burn-"));
                // At the cap a new hit renews the oldest burn instead of stacking another.
                const burnName = burns.length >= MAX_BURNS ? burns[0].name : `burn-${this.fireballId++}`;
                EffectSystem.addEffect(struck, {
                    name: burnName,
                    duration: 5,
                    tickTimer: 0,
                    onUpdate: (fighter, effect, elapsed) => {
                        effect.tickTimer += elapsed;
                        if (effect.tickTimer >= 1 / 3) {
                            // Burn ticks are a damage-over-time source, not the
                            // class's attack, so they must not put the Fireball's
                            // own touch damage on cooldown.
                            DamageSystem.applyDamage(this, fighter, 1, "AOE", { ignoreCooldown: true });
                            effect.tickTimer = 0;
                        }
                    }
                });
                p.active = false;
            }
        });
        this.projectiles = this.projectiles.filter(p => p.active);
    }

    draw(ctx) {
        super.draw(ctx);
        
        // Draw projectiles with fire effects
        this.projectiles.forEach((p, index) => {
            const flicker = Math.sin(Date.now() / 50 + index) * 0.5 + 0.5;
            const speed = Math.hypot(p.vx, p.vy) || 1;
            const bx = -p.vx / speed;
            const by = -p.vy / speed;

            ctx.save();
            // Tapered comet tail, hottest at the head.
            for (let i = 5; i >= 1; i--) {
                const t = i / 5;
                ctx.globalAlpha = 0.5 * (1 - t) + 0.05;
                ctx.fillStyle = i > 3 ? "#ff4500" : "#ff8c1a";
                ctx.shadowBlur = 10;
                ctx.shadowColor = "#ff6a00";
                ctx.beginPath();
                ctx.arc(p.x + bx * i * 5, p.y + by * i * 5, 8 * (1 - t * 0.7), 0, Math.PI * 2);
                ctx.fill();
            }

            // Radial fireball: white-hot core fading to a soft orange halo.
            ctx.globalAlpha = 1;
            const r = 9 + flicker * 2;
            const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 1.8);
            grad.addColorStop(0, "rgba(255, 255, 235, 1)");
            grad.addColorStop(0.25, "rgba(255, 214, 80, 1)");
            grad.addColorStop(0.55, "rgba(255, 106, 0, 0.85)");
            grad.addColorStop(1, "rgba(255, 60, 0, 0)");
            ctx.shadowBlur = 22;
            ctx.shadowColor = "#ff6a00";
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(p.x, p.y, r * 1.8, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });
        
        // Draw charge indicator on main body
        if (this.shotsFired > 0) {
            ctx.save();
            ctx.translate(this.x, this.y);
            
            // Charge level indicator
            ctx.strokeStyle = "#FFD700";
            ctx.lineWidth = 2;
            const chargeAngle = (this.attackTimer / 3) * Math.PI * 2;
            ctx.beginPath();
            ctx.arc(0, 0, this.radius + 15, -Math.PI/2, -Math.PI/2 + chargeAngle);
            ctx.stroke();
            
            // Charge count (how many shots will fire)
            ctx.fillStyle = "#FFD700";
            ctx.font = "bold 10px Arial";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("x" + this.shotsFired, 0, -this.radius - 20);
            
            ctx.restore();
        }
    }
}
