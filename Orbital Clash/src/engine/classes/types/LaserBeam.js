import { FighterBase } from "../FighterBase.js";
import { DamageSystem } from "../../systems/DamageSystem.js";

const LASER_SPEED = 900; // px per second the tip travels
const LASER_HALF_WIDTH = 4;
const LASER_FIXED_SECONDS = 5;
const LASER_FADE_SECONDS = 0.5;
const TOUCH_DAMAGE = 5;
const TICK_DAMAGE = 1;
const TICK_SECONDS = 0.25;
const WALL_INSET = 20; // matches the arena's inner border in CollisionSystem
const AIM_EPSILON = 1e-9;

// Distance from a point to the closest point on the segment ab.
function distanceToSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
    return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

// Distance along a ray from (x, y) until it reaches the inner wall.
function distanceToWall(x, y, angle, arenaSize) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const high = arenaSize - WALL_INSET;
    let limit = Infinity;
    if (cos > AIM_EPSILON) limit = Math.min(limit, (high - x) / cos);
    else if (cos < -AIM_EPSILON) limit = Math.min(limit, (WALL_INSET - x) / cos);
    if (sin > AIM_EPSILON) limit = Math.min(limit, (high - y) / sin);
    else if (sin < -AIM_EPSILON) limit = Math.min(limit, (WALL_INSET - y) / sin);
    return Math.max(0, limit);
}

export class LaserBeam extends FighterBase {
    constructor(data, x, y) {
        super(data, x, y);
        this.lasers = [];
        this.animTime = 0;
    }

    update(dt, opponent) {
        this.animTime += dt;
        super.update(dt, opponent);
        if (this.isDead) {
            this.lasers = [];
            return;
        }
        const victims = (this.victims?.length ? this.victims : [opponent]).filter(f => f && !f.isDead);
        this.updateLaunch(opponent);
        this.lasers = this.lasers.filter(laser => this.updateLaser(laser, dt, victims));
    }

    // Frozen, stunned or attack-paused fighters hold their next laser.
    updateLaunch(opponent) {
        const held = this.isFrozen || this.isStunned || this.attackPauseTimer > 0;
        if (held || this.cooldownTimer > 0 || !opponent || opponent.isDead) return;
        const arenaSize = this.arenaSize ?? 800;
        this.lasers.push({
            x: this.x,
            y: this.y,
            angle: this.lastAngle,
            length: 0,
            maxLength: distanceToWall(this.x, this.y, this.lastAngle, arenaSize),
            fixed: false,
            fixedTimer: LASER_FIXED_SECONDS,
            touching: new Map() // victim -> seconds in contact since the last tick
        });
        this.useAbility();
    }

    // Returns false once the laser has finished and should be removed.
    updateLaser(laser, dt, victims) {
        if (!laser.fixed) {
            laser.length = Math.min(laser.length + LASER_SPEED * dt, laser.maxLength);
            if (laser.length >= laser.maxLength) {
                laser.fixed = true;
                if (this.particleSystem) {
                    const tip = this.laserTip(laser);
                    this.particleSystem.emit(tip.x, tip.y, "#ff5a7e", 14, { speed: 260, size: 2.6, life: 0.45 });
                }
            }
        } else {
            laser.fixedTimer -= dt;
            if (laser.fixedTimer <= 0) return false;
        }
        this.applyLaserContact(laser, dt, victims);
        return true;
    }

    laserTip(laser) {
        return {
            x: laser.x + Math.cos(laser.angle) * laser.length,
            y: laser.y + Math.sin(laser.angle) * laser.length
        };
    }

    // Each fighter touched by the line takes 5 damage on first contact. While the
    // laser is fixed, anyone still touching it takes 1 damage every 0.25 seconds.
    // Leaving the line resets that fighter's contact, so re-entering hits again.
    applyLaserContact(laser, dt, victims) {
        const tip = this.laserTip(laser);
        const touchingNow = new Set();
        for (const victim of victims) {
            const distance = distanceToSegment(victim.x, victim.y, laser.x, laser.y, tip.x, tip.y);
            if (distance >= victim.radius + LASER_HALF_WIDTH) continue;
            touchingNow.add(victim);
            if (!laser.touching.has(victim)) {
                laser.touching.set(victim, 0);
                DamageSystem.applyDamage(this, victim, TOUCH_DAMAGE, "Beam", { ignoreCooldown: true });
                continue;
            }
            if (!laser.fixed) continue;
            const accumulated = laser.touching.get(victim) + dt;
            if (accumulated >= TICK_SECONDS) {
                laser.touching.set(victim, accumulated - TICK_SECONDS);
                DamageSystem.applyDamage(this, victim, TICK_DAMAGE, "Beam", { ignoreCooldown: true });
            } else {
                laser.touching.set(victim, accumulated);
            }
        }
        for (const victim of laser.touching.keys()) {
            if (!touchingNow.has(victim)) laser.touching.delete(victim);
        }
    }

    draw(ctx) {
        const alive = !(this.isDead || this.health <= 0);
        if (alive) for (const laser of this.lasers) this.drawLaser(ctx, laser);
        super.draw(ctx);
    }

    drawLaser(ctx, laser) {
        const tip = this.laserTip(laser);
        const flicker = 0.85 + 0.15 * Math.sin(this.animTime * 40);
        const fade = laser.fixed ? Math.min(1, laser.fixedTimer / LASER_FADE_SECONDS) : 1;
        const layers = [
            { width: 22, color: "rgba(255, 40, 90, 0.25)", blur: 22 },
            { width: 9 * flicker, color: "#ff5a7e", blur: 14 },
            { width: 3, color: "#ffffff", blur: 0 }
        ];

        ctx.save();
        ctx.globalAlpha = fade;
        ctx.lineCap = "round";
        for (const layer of layers) {
            ctx.shadowBlur = layer.blur;
            ctx.shadowColor = "#ff2d55";
            ctx.strokeStyle = layer.color;
            ctx.lineWidth = layer.width;
            ctx.beginPath();
            ctx.moveTo(laser.x, laser.y);
            ctx.lineTo(tip.x, tip.y);
            ctx.stroke();
        }
        ctx.shadowBlur = 0;

        const flareRadius = laser.fixed ? 12 + 3 * Math.sin(this.animTime * 12) : 9;
        const flare = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, flareRadius * 1.8);
        flare.addColorStop(0, "rgba(255, 255, 255, 1)");
        flare.addColorStop(0.4, "rgba(255, 90, 126, 0.85)");
        flare.addColorStop(1, "rgba(255, 45, 85, 0)");
        ctx.fillStyle = flare;
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, flareRadius * 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}
