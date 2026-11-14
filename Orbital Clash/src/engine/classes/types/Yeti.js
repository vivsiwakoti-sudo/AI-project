import { FighterBase } from "../FighterBase.js";
import { DamageSystem } from "../../systems/DamageSystem.js";
import { EffectSystem } from "../../systems/EffectSystem.js";
import { audioManager } from "../../audio/AudioManager.js";

const MIN_LEAP_INTERVAL = 5;
const MAX_LEAP_INTERVAL = 10;
const LEAP_SPEED_MULTIPLIER = 3;
const LEAP_MAX_SECONDS = 1.5;
const SLAM_DAMAGE = 10;
const SLAM_RADIUS = 175;
const FREEZE_SECONDS = 2;
const LIFT_HEIGHT = 22;
const LEAP_GROWTH = 1.2;
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
        this.leapDestination = null;
        this.leapTime = 0;
        this.leapStartDistance = 1;
        this.leapProgress = 0;
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
            this.leapDestination = { x: opponent.x, y: opponent.y };
            this.leapTime = 0;
            this.leapStartDistance = Math.max(1, Math.hypot(opponent.x - this.x, opponent.y - this.y));
            this.leapProgress = 0;
            this.speedMultiplier = LEAP_SPEED_MULTIPLIER;
            const dx = this.leapDestination.x - this.x;
            const dy = this.leapDestination.y - this.y;
            const dist = Math.hypot(dx, dy) || 1;
            this.vx = dx / dist;
            this.vy = dy / dist;
            this.lastAngle = Math.atan2(dy, dx);
            return;
        }

        const target = this.leapTarget;
        if (this.isStunned || this.isStuck || this.isFrozen || !target || target.isDead || target.health <= 0) {
            this.cancelLeap();
            return;
        }

        this.leapTime += dt;
        const dx = this.leapDestination.x - this.x;
        const dy = this.leapDestination.y - this.y;
        const dist = Math.hypot(dx, dy);
        this.leapProgress = Math.min(1, Math.max(0, 1 - dist / this.leapStartDistance));

        const targetDistance = Math.hypot(target.x - this.x, target.y - this.y);
        if (dist <= this.radius || targetDistance <= this.radius + target.radius + 4 || this.leapTime >= LEAP_MAX_SECONDS) {
            this.slam(target);
            return;
        }
        this.vx = dx / dist;
        this.vy = dy / dist;
        this.lastAngle = Math.atan2(dy, dx);
    }

    cancelLeap() {
        if (this.leapState === "idle") return;
        this.leapState = "idle";
        this.leapTarget = null;
        this.leapDestination = null;
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
            this.particleSystem.shatter(impactX, impactY, "#e6f7ff", { radius: SLAM_RADIUS });
        }
        audioManager.playSlamSfx();

        for (const victim of this.reachableVictims(target)) {
            const dist = Math.hypot(victim.x - impactX, victim.y - impactY);
            if (dist > SLAM_RADIUS + victim.radius) continue;
            if (!DamageSystem.applyDamage(this, victim, SLAM_DAMAGE, "AOE", { ignoreCooldown: true })) continue;
            if (!victim.isDead) EffectSystem.rollFreeze(victim, FREEZE_SECONDS);
        }
    }

    draw(ctx) {
        if (this.isDead || this.health <= 0) return;
        const arc = this.leapState === "leap" ? Math.sin(this.leapProgress * Math.PI) : 0;
        const lift = arc * LIFT_HEIGHT;

        if (lift > 0.5) {
            ctx.save();
            ctx.globalAlpha = 0.3 * (1 - lift / LIFT_HEIGHT);
            ctx.fillStyle = "#000000";
            ctx.beginPath();
            ctx.ellipse(this.x, this.y + this.radius, this.radius * 0.9, this.radius * 0.35, 0, 0, TAU);
            ctx.fill();
            ctx.restore();
        }

        // Swells to its largest at the middle of the leap, then shrinks back on landing.
        // Only the drawn size changes; the hitbox stays at the base radius.
        ctx.save();
        ctx.translate(this.x, this.y - lift);
        ctx.scale(1 + arc * LEAP_GROWTH, 1 + arc * LEAP_GROWTH);
        ctx.translate(-this.x, -this.y);
        super.draw(ctx);
        ctx.restore();
    }
}
