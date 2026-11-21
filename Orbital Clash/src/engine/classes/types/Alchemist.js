import { FighterBase } from "../FighterBase.js";
import { Projectile } from "../Projectile.js";
import { EffectSystem } from "../../systems/EffectSystem.js";
import { DamageSystem } from "../../systems/DamageSystem.js";
import { audioManager } from "../../audio/AudioManager.js";
import { notifyStatusEvent } from "../../systems/StatusVisuals.js";

// Same inset as the inner border in CollisionSystem.resolveFighterWall.
const WALL_INSET = 20;

// The flask is drawn at this multiple of its base shape. Its hitbox scales with it
// so what you see is what collides.
const FLASK_SCALE = 3;
const FLASK_HITBOX_RADIUS = 7 * FLASK_SCALE;
const FLASK_SPEED = 5 * 1.75;

class Potion extends Projectile {
    constructor(x, y, vx, vy, owner, effect) {
        super(x, y, vx, vy, effect.damage, owner);
        this.effect = effect;
        this.impactRadius = 40;
        this.hitboxRadius = FLASK_HITBOX_RADIUS;
    }
}

const POTIONS = [
    { type: "slow", damage: 5, duration: 3 },
    { type: "poison", damage: 10 },
    { type: "stun", damage: 7, duration: 3 },
    { type: "percent", damage: 0 }, // Handled specially
    { type: "vampire", damage: 10, heal: 7 }
];

export class Alchemist extends FighterBase {
    constructor(data, x, y) {
        super(data, x, y);
        this.projectiles = [];
        this.cooldownTimer = 0;
        this.potionAngle = 0;
        this.throwAnimation = 0;
        this.throwAngle = 0;
        this.impactEffects = [];
        // Potion type (from POTIONS) every flask uses, or null for a random pick.
        this.fixedPotion = null;
    }

    setFixedPotion(type) {
        this.fixedPotion = type;
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
            // A thrown flask is a travelling hitbox: it bursts on the first victim it reaches,
            // or on the arena wall if it gets there first. A reflected flask only ever
            // bursts on its launcher, never on the wall.
            const reflected = potion.isReflected(this);
            const candidates = reflected ? [this]
                : this.victims?.length ? this.victims : (opponent ? [opponent] : []);
            const struck = candidates.find(f => f && !f.isDead && !potion.dodgedVictims?.has(f)
                && DamageSystem.checkHitbox({ x: potion.x, y: potion.y, radius: potion.hitboxRadius }, f, "Body")) || null;
            if (!struck && (reflected || !this.touchesWall(potion))) return;
            // The flask is spent on impact, unless a parry turned it back toward its launcher.
            potion.active = this.applyPotionEffect(potion, struck);
        });
        this.projectiles = this.projectiles.filter(potion => potion.active);
    }

    throwPotion(opponent) {
        const effect = POTIONS.find(potion => potion.type === this.fixedPotion)
            ?? POTIONS[Math.floor(Math.random() * POTIONS.length)];

        const angle = Math.atan2(opponent.y - this.y, opponent.x - this.x);
        const p = new Potion(this.x, this.y, Math.cos(angle) * FLASK_SPEED, Math.sin(angle) * FLASK_SPEED, this, effect);
        this.throwAngle = angle;
        this.throwAnimation = 0.35;
        this.projectiles.push(p);
        audioManager.playShotSfx("Alchemist");
    }

    // True when the flask has reached the playable border.
    touchesWall(potion) {
        const size = this.arenaSize ?? 800;
        return potion.x <= WALL_INSET || potion.x >= size - WALL_INSET
            || potion.y <= WALL_INSET || potion.y >= size - WALL_INSET;
    }

    // Living fighters whose body reaches within impactRadius of the burst.
    // The struck fighter, if there is one, is always included. A reflected flask
    // bursts on its launcher alone.
    blastVictims(potion, struck) {
        const pool = potion.isReflected(this) ? [struck]
            : this.victims?.length ? this.victims : (struck ? [struck] : []);
        return pool.filter(f => f && !f.isDead && (f === struck
            || Math.hypot(f.x - potion.x, f.y - potion.y) <= potion.impactRadius + f.radius));
    }

    // `struck` is the fighter the flask hit, or null for a wall burst. A parry on a
    // direct hit stops the whole flask; otherwise every fighter inside the blast takes the effect.
    // Returns true when a parry turned the flask back toward its launcher and it keeps flying.
    applyPotionEffect(potion, struck) {
        const { effect } = potion;
        // Damage and healing are credited to whoever currently owns the flask: the
        // thrower, or the fighter that parried it back.
        const source = potion.owner;
        const blast = this.blastVictims(potion, struck);

        // A direct hit is the flask's own strike, which a parry can stop. A parried
        // flask keeps flying and shows no burst.
        let struckHit = false;
        if (struck && effect.type !== "percent") {
            struckHit = DamageSystem.applyDamage(source, struck, potion.damage, "Projectile", { projectile: potion, ignoreCooldown: true });
            if (!struckHit && potion.keepsFlying(this, struck)) return true;
        }

        this.impactEffects.push({
            x: potion.x,
            y: potion.y,
            radius: potion.impactRadius,
            timer: 0.35,
            color: effect.type === "slow" ? "#63d9ff" : effect.type === "poison" ? "#75e35f" : "#ff9f5a"
        });
        const burstColor = effect.type === "slow" ? "#63d9ff" : effect.type === "poison" ? "#75e35f" : effect.type === "stun" ? "#ffe066" : "#ff9f5a";
        this.particleSystem?.emit(potion.x, potion.y, burstColor, 20, { speed: 340, size: 3 });
        this.particleSystem?.ring(potion.x, potion.y, burstColor, { startRadius: 8, endRadius: potion.impactRadius * 1.6, life: 0.4, lineWidth: 4 });

        if (effect.type === "percent") {
            blast.forEach(victim => {
                const percentageDamage = victim.health * 0.2;
                if (DamageSystem.applyDamage(source, victim, percentageDamage, "AOE", { ignoreCooldown: true })) {
                    notifyStatusEvent(victim, "percent");
                }
            });
            return false;
        }

        // A dodged direct hit spends the flask without splash.
        if (struck && !struckHit) return false;

        let hits = 0;
        if (struck) {
            this.applyStatus(effect, struck);
            hits++;
        }

        // The splash is area damage, so it is never parried.
        blast.forEach(victim => {
            if (victim === struck) return;
            if (DamageSystem.applyDamage(source, victim, effect.damage, "AOE", { ignoreCooldown: true })) {
                this.applyStatus(effect, victim);
                hits++;
            }
        });

        if (effect.type === "vampire" && hits > 0) {
            source.health = Math.min(source.maxHealth, source.health + effect.heal);
            notifyStatusEvent(source, "heal");
        }
        return false;
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
            this.cooldownTimer = this.cooldown / 2;
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
            ctx.scale(FLASK_SCALE, FLASK_SCALE);
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
