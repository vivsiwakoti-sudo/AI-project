import { FighterBase } from "../FighterBase.js";
import { DamageSystem } from "../../systems/DamageSystem.js";

const FIRE_SIZE = 100;
const FIRE_HALF = FIRE_SIZE / 2;
const FIRE_DAMAGE = 5;
const FIRE_DURATION = 5;
const FIRE_FADE_SECONDS = 0.6;
const FIRE_APPEAR_SECONDS = 0.2;
const FIRE_TICK_SECONDS = 1;
const BREATH_WINDUP = 0.5;
const MUZZLE_GAP = 6;
const SPEED_LOSS_PER_HP = 0.05;
const MAX_SPEED_LOSS = 0.8;
const TAU = Math.PI * 2;

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

// Circle-vs-square overlap: the fire square is rotated to the breath direction,
// so the victim's offset is brought into that frame and its centre is clamped
// onto the square. The victim touches the fire when that nearest point is
// within its radius.
function fireCovers(fire, victim) {
    const dx = victim.x - fire.x;
    const dy = victim.y - fire.y;
    const cos = Math.cos(fire.angle);
    const sin = Math.sin(fire.angle);
    const along = dx * cos + dy * sin;
    const across = -dx * sin + dy * cos;
    const nearestX = clamp(along, -FIRE_HALF, FIRE_HALF);
    const nearestY = clamp(across, -FIRE_HALF, FIRE_HALF);
    return Math.hypot(along - nearestX, across - nearestY) < victim.radius;
}

function createFire(x, y, angle) {
    const tongues = Array.from({ length: 9 }, (_, i) => ({
        lane: -40 + i * 10 + (Math.random() - 0.5) * 4,
        phase: Math.random() * TAU,
        reach: 0.6 + Math.random() * 0.4
    }));
    const embers = Array.from({ length: 14 }, () => ({
        lane: (Math.random() - 0.5) * 84,
        phase: Math.random(),
        rate: 0.5 + Math.random() * 0.6
    }));
    return { x, y, angle, age: 0, accumulators: new Map(), tongues, embers };
}

export class Dragon extends FighterBase {
    constructor(data, x, y) {
        super(data, x, y);
        this.baseSpeed = data.speed;
        this.windupTimer = null; // seconds into the current breath, or null when not breathing
        this.fires = [];
        this.animTime = 0;
    }

    update(dt, opponent) {
        this.speed = this.currentSpeed();
        super.update(dt, opponent);
        this.animTime += dt;
        this.updateFires(dt, opponent);
        this.updateBreath(dt, opponent);
    }

    // Each HP point lost costs 5% of base speed, capped at an 80% reduction.
    currentSpeed() {
        const lostHp = Math.max(0, this.maxHealth - this.health);
        const loss = Math.min(MAX_SPEED_LOSS, lostHp * SPEED_LOSS_PER_HP);
        return this.baseSpeed * (1 - loss);
    }

    updateFires(dt, opponent) {
        if (this.isDead) {
            this.fires = [];
            return;
        }
        for (const fire of this.fires) fire.age += dt;
        this.fires = this.fires.filter(fire => fire.age < FIRE_DURATION);

        // Fire is an area hazard, so every living fighter inside it is tested.
        const victims = (this.victims?.length ? this.victims : [opponent]).filter(f => f && !f.isDead);
        for (const fire of this.fires) {
            for (const victim of victims) {
                if (!fireCovers(fire, victim)) {
                    fire.accumulators.delete(victim);
                    continue;
                }
                if (!fire.accumulators.has(victim)) {
                    fire.accumulators.set(victim, 0);
                    DamageSystem.applyDamage(this, victim, FIRE_DAMAGE, "AOE", { ignoreCooldown: true });
                    continue;
                }
                const accumulated = fire.accumulators.get(victim) + dt;
                if (accumulated >= FIRE_TICK_SECONDS) {
                    fire.accumulators.set(victim, accumulated - FIRE_TICK_SECONDS);
                    DamageSystem.applyDamage(this, victim, FIRE_DAMAGE, "AOE", { ignoreCooldown: true });
                } else {
                    fire.accumulators.set(victim, accumulated);
                }
            }
        }
    }

    updateBreath(dt, opponent) {
        if (this.isDead) {
            this.windupTimer = null;
            return;
        }
        // Frozen, stunned or attack-paused dragons hold their breath entirely.
        const held = this.isFrozen || this.isStunned || this.attackPauseTimer > 0;

        if (this.windupTimer !== null) {
            if (held) return;
            this.windupTimer += dt;
            if (this.windupTimer >= BREATH_WINDUP) {
                this.windupTimer = null;
                this.breathe();
            }
            return;
        }

        if (held || this.cooldownTimer > 0 || !opponent || opponent.isDead) return;
        this.windupTimer = 0;
        this.useAbility();
    }

    breathe() {
        const angle = this.lastAngle;
        const reach = this.radius + MUZZLE_GAP + FIRE_HALF;
        const arenaSize = this.arenaSize ?? 800;
        const x = clamp(this.x + Math.cos(angle) * reach, FIRE_HALF, arenaSize - FIRE_HALF);
        const y = clamp(this.y + Math.sin(angle) * reach, FIRE_HALF, arenaSize - FIRE_HALF);
        this.fires.push(createFire(x, y, angle));

        if (this.particleSystem) {
            const [mx, my] = this.pointAt(this.radius + 14, 0);
            this.particleSystem.emit(mx, my, "#ff8a2a", 24, { angle, spread: 0.45, speed: 380, size: 3, life: 0.5 });
        }
    }

    // Body-local point: `forward` runs along the facing direction, `side` runs across it.
    pointAt(forward, side) {
        const fx = Math.cos(this.lastAngle);
        const fy = Math.sin(this.lastAngle);
        return [this.x + fx * forward - fy * side, this.y + fy * forward + fx * side];
    }

    draw(ctx) {
        if (this.isDead || this.health <= 0) return;
        for (const fire of this.fires) this.drawFire(ctx, fire);
        this.drawWingsAndTail(ctx);
        super.draw(ctx);
        this.drawHead(ctx);
    }

    drawFire(ctx, fire) {
        const appear = Math.min(1, fire.age / FIRE_APPEAR_SECONDS);
        const fade = Math.min(1, (FIRE_DURATION - fire.age) / FIRE_FADE_SECONDS);
        const strength = Math.max(0, Math.min(appear, fade));
        if (strength <= 0) return;

        ctx.save();
        ctx.translate(fire.x, fire.y);
        ctx.rotate(fire.angle);
        ctx.globalAlpha = strength;

        ctx.save();
        ctx.beginPath();
        ctx.rect(-FIRE_HALF, -FIRE_HALF, FIRE_SIZE, FIRE_SIZE);
        ctx.clip();

        // Molten base: dark embers at the dragon's side, bright near the far edge.
        const base = ctx.createLinearGradient(-FIRE_HALF, 0, FIRE_HALF, 0);
        base.addColorStop(0, "rgba(90, 8, 4, 0.9)");
        base.addColorStop(0.5, "rgba(220, 55, 10, 0.8)");
        base.addColorStop(1, "rgba(255, 160, 40, 0.7)");
        ctx.fillStyle = base;
        ctx.fillRect(-FIRE_HALF, -FIRE_HALF, FIRE_SIZE, FIRE_SIZE);

        // Additive blending makes overlapping tongues glow where they meet.
        ctx.globalCompositeOperation = "lighter";
        const t = fire.age;
        for (const tongue of fire.tongues) {
            const flicker = Math.sin(t * 9 + tongue.phase);
            const length = FIRE_SIZE * tongue.reach + flicker * 10;
            const tipX = -FIRE_HALF + length;
            const tipY = tongue.lane + Math.sin(t * 6 + tongue.phase) * 6;
            const width = 9 + 3 * Math.sin(t * 11 + tongue.phase * 2);
            this.fillTongue(ctx, -FIRE_HALF, tongue.lane, tipX, tipY, length, width, "rgba(255, 110, 25, 0.55)");
            this.fillTongue(ctx, -FIRE_HALF, tongue.lane, -FIRE_HALF + length * 0.6, tipY, length * 0.6, width * 0.45, "rgba(255, 240, 170, 0.6)");
        }

        for (const ember of fire.embers) {
            const progress = (t * ember.rate + ember.phase) % 1;
            const x = -FIRE_HALF + 8 + progress * (FIRE_SIZE - 8);
            const y = ember.lane + Math.sin(progress * 7 + ember.phase * TAU) * 8;
            ctx.fillStyle = `rgba(255, 220, 120, ${(1 - progress) * 0.9})`;
            ctx.beginPath();
            ctx.arc(x, y, 1.6 + (1 - progress) * 1.4, 0, TAU);
            ctx.fill();
        }
        ctx.restore();

        // Glowing rim so the square reads clearly against the arena.
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = "rgba(255, 150, 60, 0.85)";
        ctx.lineWidth = 2;
        ctx.shadowBlur = 12;
        ctx.shadowColor = "#ff6a1a";
        ctx.strokeRect(-FIRE_HALF, -FIRE_HALF, FIRE_SIZE, FIRE_SIZE);
        ctx.restore();
    }

    // A flame tongue: a leaf-shaped path from the lane at the dragon's side out to the tip.
    fillTongue(ctx, startX, lane, tipX, tipY, length, width, color) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(startX - 4, lane - width);
        ctx.quadraticCurveTo(startX + length * 0.5, lane - width * 1.4, tipX, tipY);
        ctx.quadraticCurveTo(startX + length * 0.5, lane + width * 1.4, startX - 4, lane + width);
        ctx.closePath();
        ctx.fill();
    }

    drawWingsAndTail(ctx) {
        const r = this.radius;
        const flap = Math.sin(this.animTime * 4) * 0.15;
        ctx.save();

        for (const side of [-1, 1]) {
            ctx.fillStyle = "#7a1a12";
            ctx.beginPath();
            ctx.moveTo(...this.pointAt(r * 0.25, side * r * 0.5));
            ctx.lineTo(...this.pointAt(r * 0.1, side * r * 1.5));
            ctx.lineTo(...this.pointAt(-r * 0.4, side * r * (2.0 + flap)));
            ctx.lineTo(...this.pointAt(-r * 0.9, side * r * 1.45));
            ctx.lineTo(...this.pointAt(-r * 0.55, side * r * 1.25));
            ctx.lineTo(...this.pointAt(-r * 0.95, side * r * 1.0));
            ctx.lineTo(...this.pointAt(-r * 0.6, side * r * 0.8));
            ctx.lineTo(...this.pointAt(-r * 1.0, side * r * 0.5));
            ctx.closePath();
            ctx.fill();

            ctx.strokeStyle = "rgba(255, 179, 71, 0.7)";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(...this.pointAt(r * 0.25, side * r * 0.5));
            ctx.lineTo(...this.pointAt(-r * 0.4, side * r * (2.0 + flap)));
            ctx.moveTo(...this.pointAt(r * 0.25, side * r * 0.5));
            ctx.lineTo(...this.pointAt(-r * 0.55, side * r * 1.25));
            ctx.stroke();
        }

        for (let i = 4; i >= 1; i--) {
            const sway = Math.sin(this.animTime * 3 + i * 0.9) * i * 1.8;
            const [tx, ty] = this.pointAt(-r * 0.7 - i * 6.5, sway);
            ctx.fillStyle = i % 2 ? "#a3281b" : "#7a1a12";
            ctx.beginPath();
            ctx.arc(tx, ty, Math.max(2.5, r * 0.36 - i * 2.2), 0, TAU);
            ctx.fill();
        }
        ctx.restore();
    }

    drawHead(ctx) {
        const r = this.radius;
        ctx.save();

        ctx.fillStyle = "#f2e4c4";
        for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(...this.pointAt(r * 0.1, side * r * 0.35));
            ctx.quadraticCurveTo(...this.pointAt(-r * 0.5, side * r * 0.9), ...this.pointAt(-r * 0.35, side * r * 1.15));
            ctx.quadraticCurveTo(...this.pointAt(r * 0.05, side * r * 0.75), ...this.pointAt(r * 0.35, side * r * 0.4));
            ctx.closePath();
            ctx.fill();
        }

        ctx.fillStyle = "#e0553a";
        ctx.beginPath();
        ctx.moveTo(...this.pointAt(r * 0.35, r * 0.45));
        ctx.lineTo(...this.pointAt(r * 1.4, r * 0.18));
        ctx.lineTo(...this.pointAt(r * 1.4, -r * 0.18));
        ctx.lineTo(...this.pointAt(r * 0.35, -r * 0.45));
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = "#ffb347";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(...this.pointAt(r * 0.5, 0));
        ctx.lineTo(...this.pointAt(r * 1.3, 0));
        ctx.stroke();

        for (const side of [-1, 1]) {
            const [ex, ey] = this.pointAt(r * 0.5, side * r * 0.32);
            ctx.fillStyle = "#ffd23a";
            ctx.beginPath();
            ctx.arc(ex, ey, 3.4, 0, TAU);
            ctx.fill();
            ctx.fillStyle = "#1a0500";
            ctx.beginPath();
            ctx.arc(ex, ey, 1.4, 0, TAU);
            ctx.fill();
        }

        if (this.windupTimer !== null) {
            const charge = Math.min(1, this.windupTimer / BREATH_WINDUP);
            const [mx, my] = this.pointAt(r * 1.4, 0);
            const glowRadius = 4 + 12 * charge;
            const glow = ctx.createRadialGradient(mx, my, 0, mx, my, glowRadius);
            glow.addColorStop(0, `rgba(255, 250, 200, ${0.4 + 0.6 * charge})`);
            glow.addColorStop(0.5, `rgba(255, 150, 40, ${0.5 * charge})`);
            glow.addColorStop(1, "rgba(255, 90, 20, 0)");
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(mx, my, glowRadius, 0, TAU);
            ctx.fill();
        }
        ctx.restore();
    }
}
