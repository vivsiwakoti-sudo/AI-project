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
            // A thrown flask is a travelling hitbox: it bursts on the first victim it reaches.
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
                this.applyPotionEffect(potion, struck);
                // The flask is spent on impact, whether or not the hit lands.
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

    // Living fighters inside the blast. The struck fighter is always included.
    blastVictims(potion, struck) {
        const pool = this.victims?.length ? this.victims : [struck];
        return pool.filter(f => f && !f.isDead && (f === struck
            || Math.hypot(f.x - potion.x, f.y - potion.y) <= potion.impactRadius + f.radius));
    }

    // The flask bursts on `struck`. A parry on that hit stops the whole flask;
    // otherwise every fighter inside the blast takes the effect.
    applyPotionEffect(potion, struck) {
        const { effect } = potion;
        const blast = this.blastVictims(potion, struck);

        const burstColor = effect.type === "slow" ? "#63d9ff" : effect.type === "poison" ? "#75e35f" : effect.type === "stun" ? "#ffe066" : "#ff9f5a";
        this.particleSystem?.emit(potion.x, potion.y, burstColor, 20, { speed: 340, size: 3 });
        this.particleSystem?.ring(potion.x, potion.y, burstColor, { startRadius: 8, endRadius: potion.impactRadius * 1.6, life: 0.4, lineWidth: 4 });

        if (effect.type === "percent") {
            // The percentage is rolled PER VICTIM: splitting one roll between them
            // would make the potion weaker the more fighters it happened to catch.
            blast.forEach(victim => {
                const percentageDamage = victim.health * (0.1 + Math.random() * 0.15);
                DamageSystem.applyDamage(this, victim, percentageDamage, "AOE", { ignoreCooldown: true });
            });
            return;
        }

        // The struck fighter takes the flask's own hit, which a parry can stop.
        // The splash is area damage, so it is never parried.
        const landed = DamageSystem.applyDamage(this, struck, effect.damage, "Projectile", { projectile: potion, ignoreCooldown: true });
        if (!landed) return;
        this.applyStatus(effect, struck);

        blast.forEach(victim => {
            if (victim === struck) return;
            if (DamageSystem.applyDamage(this, victim, effect.damage, "AOE", { ignoreCooldown: true })) {
                this.applyStatus(effect, victim);
            }
        });

        if (effect.type === "vampire") {
            this.health = Math.min(this.maxHealth, this.health + 5);
        }
    }

    applyStatus(effect, victim) {
        if (effect.type === "slow") {
            EffectSystem.addEffect(victim, { name: "slow", duration: effect.duration });
        } else if (effect.type === "poison") {
            // The damage-over-time is applied to its own target. Applying it with
            // `this` as the attacker (as this used to) swung every tick from the
            // damage system's per-attacker cooldown, so a poison tick could block
            // the Alchemist's own next throw - and with four fighters it gated the
            // wrong fighter's attack entirely.
            EffectSystem.addEffect(victim, {
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
            EffectSystem.addEffect(victim, {
                name: "stun",
                duration: effect.duration,
                onUpdate: (fighter) => { fighter.isStuck = true; },
                onEnd: (fighter) => { fighter.isStuck = false; }
            });
            victim.isStuck = true;
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
