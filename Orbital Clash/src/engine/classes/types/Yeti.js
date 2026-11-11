import { FighterBase } from "../FighterBase.js";
import { DamageSystem } from "../../systems/DamageSystem.js";
import { EffectSystem } from "../../systems/EffectSystem.js";

const MIN_LEAP_INTERVAL = 5;
const MAX_LEAP_INTERVAL = 10;
const LEAP_SPEED_MULTIPLIER = 3;
const LEAP_MAX_SECONDS = 1.5;
const SLAM_DAMAGE = 10;
const SLAM_RADIUS = 70;
const FREEZE_SECONDS = 2;
const LIFT_HEIGHT = 22;
const TAU = Math.PI * 2;

function randomLeapInterval() {
    return MIN_LEAP_INTERVAL + Math.random() * (MAX_LEAP_INTERVAL - MIN_LEAP_INTERVAL);
}

export class Yeti extends FighterBase {
    constructor(data, x, y) {
        super(data, x, y);
        this.cooldown = randomLeapInterval();
        this.cooldownTimer = this.cooldown;
        this.leapState = "idle";
        this.leapTarget = null;
        this.leapTime = 0;
    }

    update(dt, opponent) {
        this.updateLeap(dt, opponent);
        super.update(dt, opponent);
    }

    updateLeap(dt, opponent) {
        if (this.isDead || this.health <= 0) { this.cancelLeap(); return; }

        if (this.leapState === "idle") {
            if (this.cooldownTimer > 0 || !opponent || opponent.isDead) return;
            if (this.isStunned || this.isStuck || this.isFrozen) return;
            this.cooldown = randomLeapInterval();
            this.useAbility();
            this.leapState = "leap";
            this.leapTarget = opponent;
            this.leapTime = 0;
            this.speedMultiplier = LEAP_SPEED_MULTIPLIER;
            return;
        }

        const target = this.leapTarget;
        if (this.isStunned || this.isStuck || this.isFrozen || !target || target.isDead || target.health <= 0) {
            this.cancelLeap();
            return;
        }

        this.leapTime += dt;
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const dist = Math.hypot(dx, dy) || 1;
        this.vx = dx / dist;
        this.vy = dy / dist;
        this.lastAngle = Math.atan2(dy, dx);

        if (dist <= this.radius + target.radius + 4 || this.leapTime >= LEAP_MAX_SECONDS) {
            this.slam(target);
        }
    }

    cancelLeap() {
        if (this.leapState === "idle") return;
        this.leapState = "idle";
        this.leapTarget = null;
        this.speedMultiplier = 1;
    }

    slam(target) {
        const impactX = this.x;
        const impactY = this.y;
        this.cancelLeap();
        const angle = Math.random() * TAU;
        this.vx = Math.cos(angle);
        this.vy = Math.sin(angle);

        if (this.particleSystem) {
            this.particleSystem.ring(impactX, impactY, "#e6f7ff", { startRadius: 10, endRadius: SLAM_RADIUS, life: 0.4, lineWidth: 5 });
            this.particleSystem.emit(impactX, impactY, "#e6f7ff", 22, { speed: 260 });
        }

        for (const victim of this.reachableVictims(target)) {
            const dist = Math.hypot(victim.x - impactX, victim.y - impactY);
            if (dist > SLAM_RADIUS + victim.radius) continue;
            if (!DamageSystem.applyDamage(this, victim, SLAM_DAMAGE, "AOE", { ignoreCooldown: true })) continue;
            if (!victim.isDead) EffectSystem.rollFreeze(victim, FREEZE_SECONDS);
        }
    }

    draw(ctx) {
        if (this.isDead || this.health <= 0) return;
        const lift = this.leapState === "leap"
            ? Math.sin(Math.min(1, this.leapTime / LEAP_MAX_SECONDS) * Math.PI) * LIFT_HEIGHT
            : 0;

        if (lift > 0.5) {
            ctx.save();
            ctx.globalAlpha = 0.3 * (1 - lift / LIFT_HEIGHT);
            ctx.fillStyle = "#000000";
            ctx.beginPath();
            ctx.ellipse(this.x, this.y + this.radius, this.radius * 0.9, this.radius * 0.35, 0, 0, TAU);
            ctx.fill();
            ctx.restore();
        }

        ctx.save();
        ctx.translate(0, -lift);
        super.draw(ctx);
        ctx.restore();
    }
}
