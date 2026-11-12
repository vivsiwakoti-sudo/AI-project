import { FighterBase } from "../FighterBase.js";
import { DamageSystem } from "../../systems/DamageSystem.js";

const FIRE_RADIUS = 100;
const FIRE_TICK_DAMAGE = 5;
const FIRE_BURN_DELAY = 0.75;
const FIRE_BURN_TICKS = 5;
const FIRE_DURATION = 5;
const FIRE_FADE_SECONDS = 0.6;
const FIRE_APPEAR_SECONDS = 0.2;
const FIRE_TICK_SECONDS = 1;
const BREATH_WINDUP = 0.5;
const MUZZLE_GAP = 6;
const FIREBALL_SPEED = 9; // px per frame
const FIREBALL_RADIUS = 9;
const FIREBALL_DAMAGE = 10;
const WALL_INSET = 20; // matches the arena's inner border in CollisionSystem
const FIRE_FLAMES = 24;
const SPEED_LOSS_PER_HP = 0.01;
const MAX_SPEED_LOSS = 0.8;
const TAU = Math.PI * 2;

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

// The victim touches the fire when its body reaches into the fire's circle.
function fireCovers(fire, victim) {
    return Math.hypot(victim.x - fire.x, victim.y - fire.y) < FIRE_RADIUS + victim.radius;
}

function createFire(x, y) {
    const flames = Array.from({ length: FIRE_FLAMES }, (_, i) => ({
        angle: (i / FIRE_FLAMES) * TAU + (Math.random() - 0.5) * 0.15,
        phase: Math.random() * TAU,
        width: 0.8 + Math.random() * 0.4
    }));
    const embers = Array.from({ length: 26 }, () => ({
        angle: Math.random() * TAU,
        dist: Math.sqrt(Math.random()) * FIRE_RADIUS,
        phase: Math.random(),
        rate: 0.4 + Math.random() * 0.5,
        wobble: Math.random() * TAU
    }));
    return { x, y, age: 0, burns: new Map(), flames, embers };
}

// Each flame's length rises and falls out of step with its neighbours.
function flameLength(flame, t) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 4.2 + flame.phase);
    const flicker = Math.sin(t * 13 + flame.phase * 2.7);
    return clamp(FIRE_RADIUS * (0.55 + 0.4 * pulse) + flicker * 8, 20, FIRE_RADIUS);
}

export class Dragon extends FighterBase {
    constructor(data, x, y) {
        super(data, x, y);
        this.baseSpeed = data.speed;
        this.windupTimer = null; // seconds into the current breath, or null when not breathing
        this.fires = [];
        this.fireballs = [];
        this.animTime = 0;
    }

    update(dt, opponent) {
        this.speed = this.currentSpeed();
        super.update(dt, opponent);
        this.animTime += dt;
        this.updateFires(dt, opponent);
        this.updateFireballs(dt, opponent);
        this.updateBreath(dt, opponent);
    }

    // Each HP point lost costs 1% of base speed, capped at an 80% reduction.
    currentSpeed() {
        const lostHp = Math.max(0, this.maxHealth - this.health);
        const loss = Math.min(MAX_SPEED_LOSS, lostHp * SPEED_LOSS_PER_HP);
        return this.baseSpeed * (1 - loss);
    }

    updateFires(dt, opponent) {
        if (this.isDead) {
            this.fires = [];
            this.fireballs = [];
            return;
        }
        for (const fire of this.fires) fire.age += dt;
        this.fires = this.fires.filter(fire => fire.age < FIRE_DURATION);

        // Fire is an area hazard, so every living fighter inside it is tested. A victim
        // burns only after FIRE_BURN_DELAY seconds inside, then takes one tick per second.
        const victims = (this.victims?.length ? this.victims : [opponent]).filter(f => f && !f.isDead);
        for (const fire of this.fires) {
            for (const victim of victims) {
                if (!fireCovers(fire, victim)) {
                    fire.burns.delete(victim);
                    continue;
                }
                const burn = fire.burns.get(victim) ?? { elapsed: 0, ticks: 0 };
                fire.burns.set(victim, burn);
                burn.elapsed += dt;
                while (burn.ticks < FIRE_BURN_TICKS
                    && burn.elapsed >= FIRE_BURN_DELAY + burn.ticks * FIRE_TICK_SECONDS) {
                    burn.ticks += 1;
                    DamageSystem.applyDamage(this, victim, FIRE_TICK_DAMAGE, "AOE", { ignoreCooldown: true });
                }
            }
        }
    }

    // A fireball flies until it strikes a fighter (10 damage) or reaches the wall, then bursts into fire.
    updateFireballs(dt, opponent) {
        const arenaSize = this.arenaSize ?? 800;
        const victims = (this.victims?.length ? this.victims : [opponent]).filter(f => f && !f.isDead);
        const step = FIREBALL_SPEED * dt * 60;
        for (const ball of this.fireballs) {
            ball.x += Math.cos(ball.angle) * step;
            ball.y += Math.sin(ball.angle) * step;
        }
        this.fireballs = this.fireballs.filter(ball => {
            const struck = victims.find(f => Math.hypot(ball.x - f.x, ball.y - f.y) < f.radius + FIREBALL_RADIUS);
            const atWall = ball.x <= WALL_INSET || ball.x >= arenaSize - WALL_INSET
                || ball.y <= WALL_INSET || ball.y >= arenaSize - WALL_INSET;
            if (!struck && !atWall) return true;
            if (struck) DamageSystem.applyDamage(this, struck, FIREBALL_DAMAGE, "AOE", { ignoreCooldown: true });
            this.explode(ball.x, ball.y);
            return false;
        });
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
                this.launchFireball();
            }
            return;
        }

        if (held || this.cooldownTimer > 0 || !opponent || opponent.isDead) return;
        this.windupTimer = 0;
        this.useAbility();
    }

    launchFireball() {
        const angle = this.lastAngle;
        const [x, y] = this.pointAt(this.radius + MUZZLE_GAP, 0);
        this.fireballs.push({ x, y, angle });
        if (this.particleSystem) {
            this.particleSystem.emit(x, y, "#ff8a2a", 24, { angle, spread: 0.45, speed: 380, size: 3, life: 0.5 });
        }
    }

    // The fire circle is centred on the impact point and kept inside the playable area.
    explode(x, y) {
        const arenaSize = this.arenaSize ?? 800;
        const low = WALL_INSET + FIRE_RADIUS;
        const high = arenaSize - WALL_INSET - FIRE_RADIUS;
        const cx = clamp(x, low, high);
        const cy = clamp(y, low, high);
        this.fires.push(createFire(cx, cy));
        if (this.particleSystem) {
            this.particleSystem.emit(x, y, "#ffb347", 60, { speed: 520, size: 4, life: 0.8 });
            this.particleSystem.emit(x, y, "#ff4d1a", 30, { speed: 300, size: 3, life: 0.6 });
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
        for (const ball of this.fireballs) this.drawFireball(ctx, ball);
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
        ctx.globalAlpha = strength;

        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, FIRE_RADIUS, 0, TAU);
        ctx.clip();

        // A bed of coals: hottest at the centre, dark red toward the rim.
        const bed = ctx.createRadialGradient(0, 0, 4, 0, 0, FIRE_RADIUS);
        bed.addColorStop(0, "rgba(255, 175, 70, 0.95)");
        bed.addColorStop(0.45, "rgba(235, 75, 15, 0.9)");
        bed.addColorStop(1, "rgba(95, 12, 6, 0.95)");
        ctx.fillStyle = bed;
        ctx.fillRect(-FIRE_RADIUS, -FIRE_RADIUS, FIRE_RADIUS * 2, FIRE_RADIUS * 2);

        // Flames rise from the centre and fan out in every direction. Each has three
        // layers (dark outer, orange body, white-hot core); additive blending makes
        // them glow where they overlap.
        ctx.globalCompositeOperation = "lighter";
        const t = fire.age;
        for (const flame of fire.flames) {
            const reach = flameLength(flame, t);
            const sway = Math.sin(t * 5 + flame.phase) * 5;
            const halfWidth = 9 * flame.width;
            ctx.save();
            ctx.rotate(flame.angle);
            this.fillTongue(ctx, 0, 0, reach, sway, reach, halfWidth, "rgba(190, 40, 10, 0.55)");
            this.fillTongue(ctx, 0, 0, reach * 0.8, sway, reach * 0.8, halfWidth * 0.7, "rgba(255, 125, 30, 0.6)");
            this.fillTongue(ctx, 0, 0, reach * 0.5, sway, reach * 0.5, halfWidth * 0.3, "rgba(255, 245, 190, 0.75)");
            ctx.restore();
        }

        // Burnt-out smoke gathers toward the rim.
        ctx.globalCompositeOperation = "source-over";
        const smoke = ctx.createRadialGradient(0, 0, FIRE_RADIUS * 0.5, 0, 0, FIRE_RADIUS);
        smoke.addColorStop(0, "rgba(25, 6, 3, 0)");
        smoke.addColorStop(1, "rgba(25, 6, 3, 0.5)");
        ctx.fillStyle = smoke;
        ctx.fillRect(-FIRE_RADIUS, -FIRE_RADIUS, FIRE_RADIUS * 2, FIRE_RADIUS * 2);

        // Sparks lifted off the flames, drifting outward and fading out.
        for (const ember of fire.embers) {
            const progress = (t * ember.rate + ember.phase) % 1;
            const r = ember.dist * (0.5 + 0.5 * progress) + Math.sin(t * 6 + ember.wobble) * 3;
            const x = Math.cos(ember.angle) * r;
            const y = Math.sin(ember.angle) * r;
            ctx.fillStyle = `rgba(255, 220, 130, ${(1 - progress) * 0.95})`;
            ctx.beginPath();
            ctx.arc(x, y, 0.8 + (1 - progress) * 1.6, 0, TAU);
            ctx.fill();
        }
        ctx.restore();

        // Glowing rim so the circle reads clearly against the arena.
        ctx.strokeStyle = "rgba(255, 150, 60, 0.85)";
        ctx.lineWidth = 2;
        ctx.shadowBlur = 14;
        ctx.shadowColor = "#ff6a1a";
        ctx.beginPath();
        ctx.arc(0, 0, FIRE_RADIUS, 0, TAU);
        ctx.stroke();
        ctx.restore();
    }

    drawFireball(ctx, ball) {
        const flicker = Math.sin(this.animTime * 30) * 0.5 + 0.5;
        const bx = -Math.cos(ball.angle);
        const by = -Math.sin(ball.angle);

        ctx.save();
        // Tapered comet tail, hottest at the head.
        for (let i = 6; i >= 1; i--) {
            const t = i / 6;
            ctx.globalAlpha = 0.5 * (1 - t) + 0.05;
            ctx.fillStyle = i > 3 ? "#ff4500" : "#ff8c1a";
            ctx.shadowBlur = 10;
            ctx.shadowColor = "#ff6a00";
            ctx.beginPath();
            ctx.arc(ball.x + bx * i * 6, ball.y + by * i * 6, 9 * (1 - t * 0.7), 0, TAU);
            ctx.fill();
        }

        // White-hot core fading to an orange halo.
        const r = FIREBALL_RADIUS + flicker * 2;
        const grad = ctx.createRadialGradient(ball.x, ball.y, 0, ball.x, ball.y, r * 1.8);
        grad.addColorStop(0, "rgba(255, 255, 235, 1)");
        grad.addColorStop(0.25, "rgba(255, 214, 80, 1)");
        grad.addColorStop(0.55, "rgba(255, 106, 0, 0.85)");
        grad.addColorStop(1, "rgba(255, 60, 0, 0)");
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 22;
        ctx.shadowColor = "#ff6a00";
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, r * 1.8, 0, TAU);
        ctx.fill();
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
