import { FighterBase } from "../FighterBase.js";
import { Projectile } from "../Projectile.js";
import { EffectSystem } from "../../systems/EffectSystem.js";
import { DamageSystem } from "../../systems/DamageSystem.js";

class Potion extends Projectile {
    constructor(x, y, vx, vy, owner, effect) {
        super(x, y, vx, vy, effect.damage, owner);
        this.effect = effect;
        this.impactRadius = 48;
    }
}

export class Alchemist extends FighterBase {
    constructor(data, x, y) {
        super(data, x, y);
        this.projectiles = [];
        this.cooldownTimer = 0;
        this.potionAngle = 0;
        this.throwAnimation = 0;
        this.throwAngle = 0;
        this.impactEffects = [];
    }

    update(dt, opponent) {
        super.update(dt, opponent);
        // cooldownTimer is ticked by FighterBase; do not decrement it again here.
        this.potionAngle += dt * 4; // Rotate potions around body
        this.throwAnimation = Math.max(0, this.throwAnimation - dt);
        this.impactEffects = this.impactEffects.filter(effect => {
            effect.timer -= dt;
            return effect.timer > 0;
        });

        if (this.cooldownTimer <= 0 && opponent) {
            this.throwPotion(opponent);
            this.cooldownTimer = this.cooldown;
        }

        this.projectiles.forEach(potion => {
            potion.update(dt);
            // A thrown flask is a travelling hitbox, so it can smash onto any
            // fighter it reaches. The landed-on victim is captured here and the
            // splash is then applied to EVERY fighter inside the blast radius
            // (see applyPotionEffect) instead of only the one opponent the arena
            // handed over.
            const candidates = this.victims?.length ? this.victims : (opponent ? [opponent] : []);
            const struck = candidates.find(f => f && !f.isDead
                && DamageSystem.checkHitbox({ x: potion.x, y: potion.y, radius: 7 }, f, "Body"));
            if (struck) {
                this.impactEffects.push({
                    x: potion.x,
                    y: potion.y,
                    radius: potion.impactRadius,
                    timer: 0.35,
                    color: potion.effect.type === "slow" ? "#63d9ff" : potion.effect.type === "poison" ? "#75e35f" : "#ff9f5a"
                });
                this.hitPotion = potion;
                this.applyPotionEffect(potion.effect, potion.x, potion.y, potion.impactRadius);
                // A parried potion is knocked away untouched, so its splash and all
                // its status effects are skipped entirely.
                potion.active = false;
            }
        });
        this.projectiles = this.projectiles.filter(potion => potion.active);
    }

    throwPotion(opponent) {
        const effects = [
            { type: "slow", damage: 5, duration: 2 },
            { type: "poison", damage: 10 },
            { type: "stun", damage: 7, duration: 1 },
            { type: "percent", damage: 0 }, // Handled specially
            { type: "vampire", damage: 8 }
        ];
        const effect = effects[Math.floor(Math.random() * effects.length)];

        const angle = Math.atan2(opponent.y - this.y, opponent.x - this.x);
        const p = new Potion(this.x, this.y, Math.cos(angle)*5, Math.sin(angle)*5, this, effect);
        this.throwAngle = angle;
        this.throwAnimation = 0.35;
        this.projectiles.push(p);
    }

    applyPotionEffect(effect, impactX, impactY, impactRadius) {
        // `this.opponent` is the arena's victim list for THIS fighter, so the
        // splash reaches everyone standing in the blast - not just the single
        // opponent this class is aiming at.
        const splash = (this.opponent?.victims?.length ? this.opponent.victims : [])
            .filter(f => f && !f.isDead && Math.hypot(f.x - impactX, f.y - impactY) <= impactRadius + f.radius);
        if (splash.length === 0) return;
        const opponent = splash[0];

        const burstColor = effect.type === "slow" ? "#63d9ff" : effect.type === "poison" ? "#75e35f" : effect.type === "stun" ? "#ffe066" : "#ff9f5a";
        this.particleSystem?.emit(impactX, impactY, burstColor, 20, { speed: 340, size: 3 });
        this.particleSystem?.ring(impactX, impactY, burstColor, { startRadius: 8, endRadius: impactRadius * 1.6, life: 0.4, lineWidth: 4 });

        if (effect.type === "percent") {
            // Percentage damage bypasses resistances and is applied through the damage system
            // so record keeping, hit feedback and death handling all stay consistent.
            // The percentage is rolled PER VICTIM: splitting one roll between them
            // would make the potion weaker the more fighters it happened to catch.
            splash.forEach(victim => {
                const percentageDamage = victim.health * (0.1 + Math.random() * 0.15);
                DamageSystem.applyDamage(this, victim, percentageDamage, "AOE", { ignoreCooldown: true });
            });
            return;
        }

        // The potion is passed in so a parry can hurl the flask itself aside.
        const landed = DamageSystem.applyDamage(this, opponent, effect.damage, "Projectile", { projectile: this.hitPotion });
        if (!landed) return;
        if (effect.type === "slow") {
            EffectSystem.addEffect(opponent, { name: "slow", duration: effect.duration });
        } else if (effect.type === "poison") {
            // The damage-over-time is applied to its own target. Applying it with
            // `this` as the attacker (as this used to) swung every tick from the
            // damage system's per-attacker cooldown, so a poison tick could block
            // the Alchemist's own next throw - and with four fighters it gated the
            // wrong fighter's attack entirely.
            EffectSystem.addEffect(opponent, {
                name: "poison",
                duration: 5,
                onUpdate: (fighter, status, elapsed) => {
                    status.tick = (status.tick || 0) + elapsed;
                    if (status.tick >= 1) {
                        DamageSystem.applyDamage(null, fighter, 2, "AOE", { ignoreCooldown: true });
                        status.tick = 0;
                    }
                }
            });
        } else if (effect.type === "stun") {
            EffectSystem.addEffect(opponent, {
                name: "stun",
                duration: effect.duration,
                onUpdate: (fighter) => { fighter.isStuck = true; },
                onEnd: (fighter) => { fighter.isStuck = false; }
            });
            opponent.isStuck = true;
        } else if (effect.type === "vampire") {
            this.health = Math.min(this.maxHealth, this.health + 5);
        }
    }

    draw(ctx) {
        super.draw(ctx);

        // Throwing arm and release flash.
        if (this.throwAnimation > 0) {
            const progress = 1 - this.throwAnimation / 0.35;
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.throwAngle);
            ctx.strokeStyle = `rgba(255, 220, 150, ${1 - progress * 0.5})`;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(this.radius * 0.35, 0);
            ctx.lineTo(this.radius + 16 + progress * 10, 0);
            ctx.stroke();
            ctx.fillStyle = `rgba(255, 245, 190, ${1 - progress})`;
            ctx.beginPath();
            ctx.arc(this.radius + 18, 0, 5 + progress * 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        this.projectiles.forEach(potion => {
            const potionColors = { slow: "#63d9ff", poison: "#75e35f", stun: "#ffd45c", percent: "#ff5f7a", vampire: "#d94bff" };
            const color = potionColors[potion.effect.type] || "#8BE9FD";
            ctx.save();
            ctx.translate(potion.x, potion.y);
            ctx.rotate((potion.age || Date.now() / 1000) * 8);
            // Glass flask with glowing liquid, neck and cork.
            ctx.shadowBlur = 16;
            ctx.shadowColor = color;
            const liquid = ctx.createRadialGradient(-2, -2, 1, 0, 0, 8);
            liquid.addColorStop(0, "#ffffff");
            liquid.addColorStop(0.4, color);
            liquid.addColorStop(1, "rgba(20,20,30,0.85)");
            ctx.fillStyle = liquid;
            ctx.beginPath();
            ctx.arc(0, 2, 7, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.fillStyle = "rgba(220,240,255,0.55)";
            ctx.fillRect(-2.5, -9, 5, 6);
            ctx.fillStyle = "#8b5a2b";
            ctx.fillRect(-3, -11, 6, 3);
            ctx.strokeStyle = "rgba(255,255,255,0.8)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(0, 2, 7, Math.PI * 1.1, Math.PI * 1.55);
            ctx.stroke();
            ctx.restore();
        });

        // Expanding AOE impact rings.
        this.impactEffects.forEach(effect => {
            const progress = 1 - effect.timer / 0.35;
            ctx.strokeStyle = effect.color;
            ctx.globalAlpha = effect.timer / 0.35;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(effect.x, effect.y, effect.radius * progress, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
        });
        
        // Draw rotating potion bottles around the alchemist
        ctx.save();
        ctx.translate(this.x, this.y);
        
        for (let i = 0; i < 3; i++) {
            const angle = this.potionAngle + (i * (Math.PI * 2 / 3));
            const distance = this.radius + 15;
            const potionX = Math.cos(angle) * distance;
            const potionY = Math.sin(angle) * distance;
            
            // Potion bottle: glowing liquid in a glass flask with a cork.
            const color = ["#FF6B6B", "#4ECDC4", "#95E77D"][i];
            ctx.save();
            ctx.translate(potionX, potionY);
            ctx.rotate(angle + Math.PI / 2);
            ctx.shadowBlur = 12;
            ctx.shadowColor = color;
            const liquid = ctx.createLinearGradient(0, -6, 0, 7);
            liquid.addColorStop(0, "#ffffff");
            liquid.addColorStop(0.3, color);
            liquid.addColorStop(1, "rgba(15,15,25,0.9)");
            ctx.fillStyle = liquid;
            ctx.beginPath();
            ctx.arc(0, 2, 5.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.fillStyle = "rgba(220,240,255,0.6)";
            ctx.fillRect(-1.8, -6, 3.6, 4);
            ctx.fillStyle = "#8b5a2b";
            ctx.fillRect(-2.4, -8, 4.8, 2.4);
            ctx.strokeStyle = "rgba(255,255,255,0.75)";
            ctx.lineWidth = 0.9;
            ctx.beginPath();
            ctx.arc(0, 2, 5.5, Math.PI * 1.1, Math.PI * 1.55);
            ctx.stroke();
            ctx.restore();
        }
        
        ctx.restore();
    }
}
