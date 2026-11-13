import { FighterBase } from "../FighterBase.js";
import { Projectile } from "../Projectile.js";
import { EffectSystem } from "../../systems/EffectSystem.js";
import { DamageSystem } from "../../systems/DamageSystem.js";
import { audioManager } from "../../audio/AudioManager.js";

const DIE_SIZE = 44;
const DIE_RADIUS = DIE_SIZE / 2;
// Projectile.update moves vx * dt * 100 px per step, so vx 3 is 5 px per frame at 60 fps.
const DIE_SPEED = 3;
const DIE_DAMAGE = 15;
const STUN_DURATION = 2;
const BURN_DURATION = 5;
const BURN_TICK_INTERVAL = 1;
const BURN_TICK_DAMAGE = 1;
const MAX_BURNS = 5;
const PERCENT_DAMAGE = 0.15;
const HEAL_AMOUNT = 15;

// One entry per face of the die. Each face is rolled with equal (1/6) chance.
const FACES = [
    { id: "stun", good: true },
    { id: "burn", good: true },
    { id: "percent", good: true },
    { id: "heal", good: false },
    { id: "selfPercent", good: false },
    { id: "selfBurn", good: false }
];

let burnSerial = 0;

class Die extends Projectile {
    constructor(x, y, vx, vy, owner) {
        super(x, y, vx, vy, DIE_DAMAGE, owner);
        this.spin = 0;
    }
}

export class Gambler extends FighterBase {
    constructor(data, x, y) {
        super(data, x, y);
        this.dice = [];
        this.cooldownTimer = 0;
    }

    update(dt, opponent) {
        super.update(dt, opponent);

        if (this.cooldownTimer <= 0 && opponent) {
            this.throwDie(opponent);
            this.cooldownTimer = this.cooldown;
        }

        this.dice.forEach(die => {
            die.update(dt);
            if (!die.active) return;
            die.spin += dt * 8;
            // A die is a travelling hitbox: it resolves on the first fighter it reaches.
            const candidates = this.victims?.length ? this.victims : (opponent ? [opponent] : []);
            const struck = candidates.find(f => f && !f.isDead
                && DamageSystem.checkHitbox({ x: die.x, y: die.y, radius: DIE_RADIUS }, f, "Body")) || null;
            if (!struck) return;

            die.active = false;
            this.resolveImpact(die, struck);
        });
        this.dice = this.dice.filter(die => die.active);
    }

    throwDie(opponent) {
        const angle = Math.atan2(opponent.y - this.y, opponent.x - this.x);
        this.dice.push(new Die(this.x, this.y, Math.cos(angle) * DIE_SPEED, Math.sin(angle) * DIE_SPEED, this));
        audioManager.playShotSfx("Gambler");
    }

    // A parried or dodged die deals nothing and does not roll, so the gamble only
    // happens when the die actually lands.
    resolveImpact(die, struck) {
        const landed = DamageSystem.applyDamage(this, struck, DIE_DAMAGE, "Projectile", { projectile: die, ignoreCooldown: true });
        if (!landed) return;

        const face = FACES[Math.floor(Math.random() * FACES.length)];
        this.particleSystem?.emit(die.x, die.y, face.good ? "#f2c94c" : "#8a8f98", 16, { speed: 300, size: 3 });
        this.applyFace(face.id, struck);
    }

    applyFace(faceId, victim) {
        switch (faceId) {
            case "stun":
                if (!victim.isDead) this.stunVictim(victim);
                break;
            case "burn":
                if (!victim.isDead) this.applyBurn(victim, this);
                break;
            case "percent":
                DamageSystem.applyDamage(this, victim, victim.maxHealth * PERCENT_DAMAGE, "AOE", { ignoreCooldown: true });
                break;
            case "heal":
                if (!victim.isDead) {
                    victim.health = Math.min(victim.maxHealth, victim.health + HEAL_AMOUNT);
                    victim.triggerHealFlash?.();
                }
                break;
            case "selfPercent":
                // The Gambler is both attacker and victim here, so it has no attacker to pass in.
                DamageSystem.applyDamage(null, this, this.maxHealth * PERCENT_DAMAGE, "AOE", { ignoreCooldown: true });
                break;
            case "selfBurn":
                this.applyBurn(this, null);
                break;
        }
    }

    stunVictim(victim) {
        EffectSystem.addEffect(victim, {
            name: "stun",
            duration: STUN_DURATION,
            onUpdate: (fighter) => { fighter.isStuck = true; },
            onEnd: (fighter) => { fighter.isStuck = false; }
        });
        victim.isStuck = true;
    }

    // Same burn as the Fireball: 1 damage every second for 5 seconds, capped at 5 stacks.
    // `source` is the attacker for the ticks, or null for self-burn (a self-hit needs no attacker).
    applyBurn(victim, source) {
        const burns = victim.statusEffects.filter(e => e.name.startsWith("burn-"));
        const name = burns.length >= MAX_BURNS ? burns[0].name : `burn-${burnSerial++}`;
        EffectSystem.addEffect(victim, {
            name,
            duration: BURN_DURATION,
            tickTimer: 0,
            onUpdate: (fighter, effect, elapsed) => {
                effect.tickTimer += elapsed;
                if (effect.tickTimer >= BURN_TICK_INTERVAL) {
                    DamageSystem.applyDamage(source, fighter, BURN_TICK_DAMAGE, "AOE", { ignoreCooldown: true });
                    effect.tickTimer = 0;
                }
            }
        });
    }

    draw(ctx) {
        super.draw(ctx);
        this.dice.forEach(die => this.drawDie(ctx, die));
    }

    drawDie(ctx, die) {
        const half = DIE_SIZE / 2;
        const pip = (px, py) => {
            ctx.beginPath();
            ctx.arc(px, py, 3, 0, Math.PI * 2);
            ctx.fill();
        };
        ctx.save();
        ctx.translate(die.x, die.y);
        ctx.rotate(die.spin);
        ctx.fillStyle = "#fff8e7";
        ctx.strokeStyle = "#1b1b1b";
        ctx.lineWidth = 2;
        ctx.fillRect(-half, -half, DIE_SIZE, DIE_SIZE);
        ctx.strokeRect(-half, -half, DIE_SIZE, DIE_SIZE);
        ctx.fillStyle = "#c62828";
        const edge = half * 0.55;
        [[-edge, -edge], [edge, -edge], [0, 0], [-edge, edge], [edge, edge]].forEach(([px, py]) => pip(px, py));
        ctx.restore();
    }
}
