import { FighterBase } from "../FighterBase.js";
import { DamageSystem } from "../../systems/DamageSystem.js";

const PLANE_SPEED = 5; // px per frame
const PLANE_LENGTH = 34;
const PLANE_WING = 26;
const PLANE_SCALE = 2;
const PLANE_MARGIN = 40;
const BOMBS_PER_PLANE = 6;
const BOMB_INTERVAL = 0.25; // seconds between drops, about 75 px apart at plane speed
const BOMB_FALL_SECONDS = 0.6;
const BOMB_DROP_HEIGHT = 46;
const BOMB_RADIUS = 120;
const BOMB_DAMAGE = 10;
const KNOCKBACK_SPEED_MULTIPLIER = 3;
const KNOCKBACK_SECONDS = 0.25;
const WALL_INSET = 20; // matches the arena's inner border in CollisionSystem
const TAU = Math.PI * 2;

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

// AOE damage carries no knockback of its own (see DamageSystem), so a bomb throws
// its victim by heading it straight away from the blast and giving it a short
// speed surge that carries it well past the arena's middle.
function throwAway(victim, blast) {
    const angle = Math.atan2(victim.y - blast.y, victim.x - blast.x);
    victim.vx = Math.cos(angle);
    victim.vy = Math.sin(angle);
    victim.speedMultiplier = Math.max(victim.speedMultiplier ?? 1, KNOCKBACK_SPEED_MULTIPLIER);
    victim.speedMultiplierTimer = Math.max(victim.speedMultiplierTimer ?? 0, KNOCKBACK_SECONDS);
}

export class Striker extends FighterBase {
    constructor(data, x, y) {
        super(data, x, y);
        this.planes = [];
        this.bombs = [];
        this.animTime = 0;
    }

    update(dt, opponent) {
        this.animTime += dt;
        super.update(dt, opponent);
        if (this.isDead) {
            this.planes = [];
            this.bombs = [];
            return;
        }
        const victims = (this.victims?.length ? this.victims : [opponent]).filter(f => f && !f.isDead);
        this.updateLaunch(opponent);
        this.updatePlanes(dt);
        this.updateBombs(dt, victims);
    }

    // Frozen, stunned or attack-paused strikers hold their next plane.
    updateLaunch(opponent) {
        const held = this.isFrozen || this.isStunned || this.attackPauseTimer > 0;
        if (held || this.cooldownTimer > 0 || !opponent || opponent.isDead) return;
        this.planes.push({
            x: this.x,
            y: this.y,
            angle: this.lastAngle,
            dropTimer: BOMB_INTERVAL,
            dropsLeft: BOMBS_PER_PLANE
        });
        this.useAbility();
    }

    // A plane flies in a straight line and is removed once it has dropped all its
    // bombs and left the arena.
    updatePlanes(dt) {
        const arenaSize = this.arenaSize ?? 800;
        for (const plane of this.planes) {
            const step = PLANE_SPEED * dt * 60;
            plane.x += Math.cos(plane.angle) * step;
            plane.y += Math.sin(plane.angle) * step;
            if (plane.dropsLeft > 0) {
                plane.dropTimer -= dt;
                if (plane.dropTimer <= 0) {
                    plane.dropTimer += BOMB_INTERVAL;
                    plane.dropsLeft -= 1;
                    this.dropBomb(plane.x, plane.y, arenaSize);
                }
            }
        }
        this.planes = this.planes.filter(plane => plane.dropsLeft > 0 || this.isInsideArena(plane, arenaSize, PLANE_MARGIN));
    }

    isInsideArena(point, arenaSize, margin) {
        return point.x >= -margin && point.x <= arenaSize + margin && point.y >= -margin && point.y <= arenaSize + margin;
    }

    // A bomb lands where it was dropped, kept inside the playable area so a plane
    // flying past the wall still produces its full set of blasts.
    dropBomb(x, y, arenaSize) {
        const low = WALL_INSET + BOMB_RADIUS;
        const high = arenaSize - low;
        this.bombs.push({ x: clamp(x, low, high), y: clamp(y, low, high), fall: BOMB_FALL_SECONDS });
    }

    updateBombs(dt, victims) {
        this.bombs = this.bombs.filter(bomb => {
            bomb.fall -= dt;
            if (bomb.fall > 0) return true;
            this.detonate(bomb, victims);
            return false;
        });
    }

    // Every living fighter inside the blast takes one hit. Dodged or parried hits
    // are not thrown.
    detonate(bomb, victims) {
        if (this.particleSystem) {
            this.particleSystem.emit(bomb.x, bomb.y, "#ffb347", 40, { speed: 420, size: 3.5, life: 0.6 });
            this.particleSystem.ring(bomb.x, bomb.y, "#ff7a1a", { startRadius: 8, endRadius: BOMB_RADIUS, life: 0.4, lineWidth: 4 });
        }
        for (const victim of victims) {
            if (victim.isDead || Math.hypot(victim.x - bomb.x, victim.y - bomb.y) >= BOMB_RADIUS + victim.radius) continue;
            if (!DamageSystem.applyDamage(this, victim, BOMB_DAMAGE, "AOE", { ignoreCooldown: true })) continue;
            throwAway(victim, bomb);
            if (victim.particleSystem) victim.particleSystem.emitImpact(victim.x, victim.y, "#ffb347", 14);
        }
    }

    draw(ctx) {
        const alive = !(this.isDead || this.health <= 0);
        if (alive) for (const bomb of this.bombs) this.drawBlastZone(ctx, bomb);
        super.draw(ctx);
        if (!alive) return;
        for (const plane of this.planes) this.drawPlane(ctx, plane);
        for (const bomb of this.bombs) this.drawBomb(ctx, bomb);
    }

    // The danger zone grows warmer and more solid as the bomb nears the ground.
    drawBlastZone(ctx, bomb) {
        const progress = 1 - bomb.fall / BOMB_FALL_SECONDS;
        ctx.save();
        ctx.beginPath();
        ctx.arc(bomb.x, bomb.y, BOMB_RADIUS, 0, TAU);
        ctx.fillStyle = `rgba(255, 90, 30, ${0.08 + 0.2 * progress})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(255, 150, 60, ${0.3 + 0.5 * progress})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 5]);
        ctx.stroke();
        ctx.restore();
    }

    drawBomb(ctx, bomb) {
        const height = BOMB_DROP_HEIGHT * (bomb.fall / BOMB_FALL_SECONDS);
        const by = bomb.y - height;
        ctx.save();
        ctx.fillStyle = "#c0392b";
        ctx.beginPath();
        ctx.moveTo(bomb.x - 4, by - 4);
        ctx.lineTo(bomb.x + 4, by - 4);
        ctx.lineTo(bomb.x, by - 10);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#3d434c";
        ctx.beginPath();
        ctx.arc(bomb.x, by, 5, 0, TAU);
        ctx.fill();
        ctx.restore();
    }

    drawPlane(ctx, plane) {
        const half = PLANE_LENGTH / 2;
        ctx.save();
        ctx.translate(plane.x, plane.y);
        ctx.rotate(plane.angle);
        ctx.scale(PLANE_SCALE, PLANE_SCALE);

        ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-half, 0);
        ctx.lineTo(-half - 30, 0);
        ctx.stroke();

        ctx.fillStyle = "#9fb0c0";
        for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(6, 3 * side);
            ctx.lineTo(-4, (PLANE_WING / 2) * side);
            ctx.lineTo(-10, (PLANE_WING / 2) * side);
            ctx.lineTo(-6, 3 * side);
            ctx.closePath();
            ctx.fill();
        }

        ctx.fillStyle = "#e9eef3";
        ctx.beginPath();
        ctx.ellipse(0, 0, half, 4.5, 0, 0, TAU);
        ctx.fill();

        ctx.fillStyle = "#e0553a";
        ctx.beginPath();
        ctx.ellipse(half - 4, 0, 3, 3, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
    }
}
