import { FighterBase } from "../FighterBase.js";
import { DamageSystem } from "../../systems/DamageSystem.js";

const LASER_HALF_WIDTH = 4;
const LASER_FIXED_SECONDS = 5;
const LASER_FADE_SECONDS = 0.5;
const TOUCH_DAMAGE = 2;
const TICK_DAMAGE = 2;
const TICK_SECONDS = 0.5;
const MIN_POINT_SPACING = 2; // px the fighter must travel before the path records a new point
const LASER_WALL_BOUNCES = 4; // wall bounces before the laser stops and lingers

// Distance from a point to the closest point on the segment ab.
function distanceToSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
    return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

// Distance from a point to the closest part of the recorded path.
function distanceToPath(px, py, points) {
    if (points.length === 1) return Math.hypot(px - points[0].x, py - points[0].y);
    let best = Infinity;
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        best = Math.min(best, distanceToSegment(px, py, a.x, a.y, b.x, b.y));
    }
    return best;
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

    // Called by CollisionSystem when this fighter's body touches an arena wall.
    onWallHit() {
        const trail = this.drawingTrail();
        if (!trail) return;
        trail.points.push({ x: this.x, y: this.y });
        trail.wallHits += 1;
        if (this.particleSystem) {
            this.particleSystem.emit(this.x, this.y, "#ff5a7e", 14, { speed: 260, size: 2.6, life: 0.45 });
        }
        if (trail.wallHits < LASER_WALL_BOUNCES) return;
        trail.fixed = true;
        this.cooldownTimer = this.cooldown;
    }

    drawingTrail() {
        return this.lasers.find(laser => !laser.fixed) ?? null;
    }

    // Frozen, stunned or attack-paused fighters hold off starting a new trail.
    updateLaunch(opponent) {
        const held = this.isFrozen || this.isStunned || this.attackPauseTimer > 0;
        if (held || this.cooldownTimer > 0 || this.drawingTrail() || !opponent || opponent.isDead) return;
        this.lasers.push({
            points: [{ x: this.x, y: this.y }],
            fixed: false,
            wallHits: 0,
            fixedTimer: LASER_FIXED_SECONDS,
            touching: new Map() // victim -> seconds in contact since the last tick
        });
        this.useAbility();
        // useAbility() starts the cooldown, but it only runs once the trail touches a wall.
        this.cooldownTimer = 0;
    }

    // Returns false once a fixed trail has lingered long enough and should be removed.
    updateLaser(trail, dt, victims) {
        if (!trail.fixed) {
            this.recordPathPoint(trail);
        } else {
            trail.fixedTimer -= dt;
            if (trail.fixedTimer <= 0) return false;
        }
        this.applyLaserContact(trail, dt, victims);
        return true;
    }

    recordPathPoint(trail) {
        const last = trail.points[trail.points.length - 1];
        if (Math.hypot(this.x - last.x, this.y - last.y) >= MIN_POINT_SPACING) {
            trail.points.push({ x: this.x, y: this.y });
        }
    }

    // Each time a fighter enters the line it takes 2 touch damage. While the laser is
    // fixed, anyone still touching it takes 2 damage every 0.5 seconds. A touch that is
    // dodged or blocked is retried each frame until it lands, while the fighter is still
    // touching the line.
    applyLaserContact(trail, dt, victims) {
        const touchingNow = new Set();
        for (const victim of victims) {
            const distance = distanceToPath(victim.x, victim.y, trail.points);
            if (distance >= victim.radius + LASER_HALF_WIDTH) continue;
            touchingNow.add(victim);
            if (!trail.touching.has(victim)) {
                if (DamageSystem.applyDamage(this, victim, TOUCH_DAMAGE, "Beam", { ignoreCooldown: true })) {
                    trail.touching.set(victim, 0);
                }
                continue;
            }
            if (!trail.fixed) continue;
            const accumulated = trail.touching.get(victim) + dt;
            if (accumulated >= TICK_SECONDS) {
                trail.touching.set(victim, accumulated - TICK_SECONDS);
                DamageSystem.applyDamage(this, victim, TICK_DAMAGE, "Beam", { ignoreCooldown: true });
            } else {
                trail.touching.set(victim, accumulated);
            }
        }
        for (const victim of trail.touching.keys()) {
            if (!touchingNow.has(victim)) trail.touching.delete(victim);
        }
    }

    draw(ctx) {
        const alive = !(this.isDead || this.health <= 0);
        if (alive) for (const trail of this.lasers) this.drawLaser(ctx, trail);
        super.draw(ctx);
    }

    drawLaser(ctx, trail) {
        const head = trail.points[trail.points.length - 1];
        const [first, ...rest] = trail.points;
        const flicker = 0.85 + 0.15 * Math.sin(this.animTime * 40);
        const fade = trail.fixed ? Math.min(1, trail.fixedTimer / LASER_FADE_SECONDS) : 1;
        const layers = [
            { width: 22, color: "rgba(255, 40, 90, 0.25)", blur: 22 },
            { width: 9 * flicker, color: "#ff5a7e", blur: 14 },
            { width: 3, color: "#ffffff", blur: 0 }
        ];

        ctx.save();
        ctx.globalAlpha = fade;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        for (const layer of layers) {
            ctx.shadowBlur = layer.blur;
            ctx.shadowColor = "#ff2d55";
            ctx.strokeStyle = layer.color;
            ctx.lineWidth = layer.width;
            ctx.beginPath();
            ctx.moveTo(first.x, first.y);
            for (const p of rest) ctx.lineTo(p.x, p.y);
            ctx.stroke();
        }
        ctx.shadowBlur = 0;

        const flareRadius = trail.fixed ? 12 + 3 * Math.sin(this.animTime * 12) : 9;
        this.drawFlare(ctx, head, flareRadius);
        this.drawFlare(ctx, first, flareRadius);
        ctx.restore();
    }

    drawFlare(ctx, point, radius) {
        const flare = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius * 1.8);
        flare.addColorStop(0, "rgba(255, 255, 255, 1)");
        flare.addColorStop(0.4, "rgba(255, 90, 126, 0.85)");
        flare.addColorStop(1, "rgba(255, 45, 85, 0)");
        ctx.fillStyle = flare;
        ctx.beginPath();
        ctx.arc(point.x, point.y, radius * 1.8, 0, Math.PI * 2);
        ctx.fill();
    }
}
