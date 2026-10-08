import { FighterBase } from "../FighterBase.js";
import { Projectile } from "../Projectile.js";
import { DamageSystem } from "../../systems/DamageSystem.js";
import { drawBolt } from "../../systems/Weapons.js";

export class Gunner extends FighterBase {
    constructor(data, x, y) {
        super(data, x, y);
        this.projectiles = [];
        this.cooldownTimer = 0;
        this.lastShotTime = 0;
        this.gunBarrelAngle = 0;
    }

    update(dt, opponent) {
        super.update(dt, opponent);
        // cooldownTimer is ticked by FighterBase; do not decrement it again here.
        this.lastShotTime -= dt;
        this.muzzleFlash = Math.max(0, (this.muzzleFlash || 0) - dt * 4);

        if (opponent) {
            this.gunBarrelAngle = Math.atan2(opponent.y - this.y, opponent.x - this.x);
        }

        if (this.cooldownTimer <= 0 && opponent) {
            this.shoot(opponent);
        }

        // Update projectiles
        this.projectiles.forEach(p => {
            p.update(dt);
            if (this.particleSystem && Math.random() < 0.35) {
                this.particleSystem.emit(p.x, p.y, "#ffd76a", 1, { speed: 30, size: 1.8, life: 0.28 });
            }
            // A bullet is a travelling hitbox: it has to be able to strike ANY
            // fighter it crosses, not only the one opponent this class happens to
            // be aiming at. Otherwise the other two fighters of a four-way brawl
            // could stand in the line of fire and never be hit.
            const struck = this.projectileVictims(opponent, p, 3);
            if (struck) {
                // A parry deflects the bullet itself, so a reflected shot keeps
                // flying; only a bullet that did not connect is spent.
                if (DamageSystem.applyDamage(this, struck, p.damage, "Projectile", { projectile: p })) {
                    p.active = false;
                }
            }
        });
        this.projectiles = this.projectiles.filter(p => p.active);
    }

    // The first live fighter whose body the projectile is currently inside.
    projectileVictims(opponent, projectile, hitRadius) {
        const candidates = this.victims?.length ? this.victims : (opponent ? [opponent] : []);
        for (const victim of candidates) {
            if (victim.isDead || victim.health <= 0) continue;
            if (DamageSystem.checkHitbox({ x: projectile.x, y: projectile.y, radius: hitRadius }, victim, "Body")) {
                return victim;
            }
        }
        return null;
    }

    shoot(opponent) {
        const rand = Math.random();
        let bullets = 1;
        let accuracy = 0.5; // Spread
        let cooldown = 2;
        let damage = 5;

        if (rand < 0.4) { // Weak/Inaccurate
            damage = 4;
            accuracy = 0.5;
            cooldown = 2;
            bullets = 4;
        } else if (rand < 0.8) { // Strong/Inaccurate
            damage = 6.5;
            accuracy = 0.5;
            cooldown = 4;
            bullets = 4;
        } else if (rand < 0.95) { // Weak/Accurate
            damage = 4;
            accuracy = 0.1;
            cooldown = 3;
        } else { // Strong/Accurate (Spray)
            damage = 6;
            accuracy = 0.05;
            cooldown = 8;
            bullets = 4;
        }

        // AIM AT OPPONENT, THEN FIRE
        const baseAngle = Math.atan2(opponent.y - this.y, opponent.x - this.x);

        for (let i = 0; i < bullets; i++) {
            const angle = baseAngle + (Math.random() - 0.5) * accuracy;
            const vx = Math.cos(angle) * 11;
            const vy = Math.sin(angle) * 11;
            this.projectiles.push(new Projectile(this.x, this.y, vx, vy, damage, this));
        }

        this.cooldownTimer = cooldown;
        this.lastShotTime = 0.2;
        this.muzzleFlash = 1;
        if (this.particleSystem) {
            this.particleSystem.emit(
                this.x + Math.cos(baseAngle) * (this.radius + 12),
                this.y + Math.sin(baseAngle) * (this.radius + 12),
                "#ffd76a", 8, { angle: baseAngle, spread: 0.8, speed: 320, size: 2.4 }
            );
        }
    }

    draw(ctx) {
        super.draw(ctx);
        if (this.isDead || this.health <= 0) return;

        this.projectiles.forEach(p => drawBolt(ctx, p.x, p.y, p.vx, p.vy, { color: "#ffd54a", radius: 4.5, tail: Math.min(48, Math.hypot(p.vx, p.vy) * 8) }));

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.gunBarrelAngle);

        // Ammunition belt behind the body.
        for (let i = 0; i < 4; i++) {
            ctx.fillStyle = i % 2 ? "#c9972b" : "#ffd54a";
            ctx.fillRect(-this.radius - 6, -8 + i * 4, 8, 2.6);
        }

        // Gun barrel: gunmetal gradient, heat vents, bright rim and muzzle brake.
        const metal = ctx.createLinearGradient(0, -5, 0, 5);
        metal.addColorStop(0, "#6b7280");
        metal.addColorStop(0.5, "#2b2f38");
        metal.addColorStop(1, "#14161b");
        ctx.fillStyle = metal;
        ctx.fillRect(this.radius - 4, -4.5, 24, 9);
        ctx.fillStyle = "#0b0c0f";
        for (let i = 0; i < 3; i++) ctx.fillRect(this.radius + 4 + i * 5, -4.5, 1.6, 9);
        ctx.fillStyle = "#8b93a1";
        ctx.fillRect(this.radius + 18, -5.5, 5, 11);
        ctx.strokeStyle = "rgba(255,255,255,0.45)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(this.radius - 4, -4);
        ctx.lineTo(this.radius + 18, -4);
        ctx.stroke();

        // Muzzle flash on a recent shot.
        if (this.lastShotTime > 0) {
            const k = this.lastShotTime / 0.2;
            const flash = ctx.createRadialGradient(this.radius + 23, 0, 0, this.radius + 23, 0, 16 * k + 4);
            flash.addColorStop(0, `rgba(255, 255, 220, ${k})`);
            flash.addColorStop(0.4, `rgba(255, 190, 60, ${k * 0.8})`);
            flash.addColorStop(1, "rgba(255, 120, 0, 0)");
            ctx.shadowBlur = 16;
            ctx.shadowColor = "#ffb43c";
            ctx.fillStyle = flash;
            ctx.beginPath();
            ctx.arc(this.radius + 23, 0, 16 * k + 4, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }
}
