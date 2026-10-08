import { FighterBase } from "../FighterBase.js";
import { DamageSystem } from "../../systems/DamageSystem.js";
import { drawDagger, weaponTrail } from "../../systems/Weapons.js";

export class Assassin extends FighterBase {
    constructor(data, x, y) {
        super(data, x, y);
        this.wallRedirectTarget = null;
        this.isRedirecting = false;
        // The dagger spins constantly and 50% further out than before.
        this.weaponSpin = 9;    // fast, jittery orbit
        this.weaponReach = (this.radius + 12) * 1.5;
        // DamageSystem rolls this against every damage source, so it dodges anything.
        this.dodgeChance = 0.6;
        this.dodgeEffects = [];
    }

    onAvoidedHit(attacker) {
        // Blink sideways out of the hit, leaving an afterimage where he stood.
        const away = attacker ? Math.atan2(this.y - attacker.y, this.x - attacker.x) : this.lastAngle + Math.PI;
        const side = away + (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
        this.dodgeEffects.push({ x: this.x, y: this.y, life: 0.5, angle: side });
        this.x += Math.cos(side) * 22;
        this.y += Math.sin(side) * 22;
        if (this.particleSystem) {
            this.particleSystem.ring(this.dodgeEffects[this.dodgeEffects.length - 1].x, this.dodgeEffects[this.dodgeEffects.length - 1].y, "#7df9ff", { startRadius: this.radius, endRadius: this.radius + 46, life: 0.4, lineWidth: 4 });
            this.particleSystem.emit(this.x, this.y, "#7df9ff", 16, { angle: side + Math.PI, spread: 1.2, speed: 380, size: 3, life: 0.5 });
            this.particleSystem.emit(this.x, this.y, "#ffffff", 8, { speed: 220, size: 2.2, life: 0.4 });
        }
        if (this.dodgeEffects.length > 4) this.dodgeEffects.shift();
    }

    update(dt, opponent) {
        this.dodgeEffects = this.dodgeEffects.filter(effect => (effect.life -= dt) > 0);
        this.wallRedirectTarget = opponent;

        if (this.isRedirecting && opponent) {
            const currentAngle = Math.atan2(this.vy, this.vx);
            const targetAngle = Math.atan2(opponent.y - this.y, opponent.x - this.x);
            const difference = Math.atan2(
                Math.sin(targetAngle - currentAngle),
                Math.cos(targetAngle - currentAngle)
            );
            const maxTurn = 3.5 * dt;
            const turn = Math.max(-maxTurn, Math.min(maxTurn, difference));
            const nextAngle = currentAngle + turn;

            this.vx = Math.cos(nextAngle);
            this.vy = Math.sin(nextAngle);
            if (Math.abs(difference) <= maxTurn) this.isRedirecting = false;
        }

        super.update(dt, opponent);

        // Constant spinning dagger: the blade orbits and cuts whoever it crosses.
        // Contact damage is paced by the orbit so speed does not equal dps, and a
        // blade parked on a target only connects once per revolution.
        const [tip] = this.meleeSpinUpdate(dt);
        const reaching = opponent && this.bladeTouches(tip.x, tip.y, opponent, 6);
        if (reaching && !this.weaponHot && this.cooldownTimer <= 0) {
            this.weaponHot = true;
            const isCrit = Math.random() < 0.25;
            if (DamageSystem.applyDamage(this, opponent, isCrit ? 25 : this.damage, "Melee", { ignoreCooldown: true })) {
                this.useAbility();
                this.isRedirecting = true; // Re-aim after a landed strike.
                this.hitColor = isCrit ? "#ffd166" : "#ffffff";
                this.triggerSwing(tip.angle, { duration: 0.16, reach: 30, color: isCrit ? "#ffd166" : this.color });
                if (opponent.particleSystem) {
                    opponent.particleSystem.emitImpact(opponent.x, opponent.y, isCrit ? "#ffd166" : this.color, isCrit ? 26 : 12);
                }
            }
        } else if (!reaching) {
            this.weaponHot = false;
        }

        this.lastAngle = Math.atan2(this.vy, this.vx);
    }

    onWallHit() {
        if (!this.wallRedirectTarget) return;

        this.isRedirecting = true;
    }

    draw(ctx) {
        if (this.isDead || this.health <= 0) return;
        // Draw shadowy silhouette for stealthiness
        ctx.fillStyle = `rgba(0, 0, 0, 0.2)`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 1.3, 0, Math.PI * 2);
        ctx.fill();

        super.draw(ctx); // Draw the base circle
        if (this.isDead || this.health <= 0) return;

        // Dodge: fading cyan afterimage, speed streak and a floating DODGE! tag.
        this.dodgeEffects.forEach(effect => {
            const k = Math.max(0, effect.life / 0.5);
            ctx.save();
            ctx.globalAlpha = k * 0.6;
            ctx.strokeStyle = "#7df9ff";
            ctx.fillStyle = "rgba(125, 249, 255, 0.35)";
            ctx.lineWidth = 3;
            ctx.shadowBlur = 16;
            ctx.shadowColor = "#7df9ff";
            ctx.beginPath();
            ctx.arc(effect.x, effect.y, this.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(effect.x, effect.y);
            ctx.lineTo(this.x, this.y);
            ctx.stroke();
            ctx.globalAlpha = k;
            ctx.font = "bold 16px 'Share Tech Mono', 'Rajdhani', monospace";
            ctx.textAlign = "center";
            ctx.fillStyle = "#e8ffff";
            ctx.fillText("DODGE!", this.x, this.y - this.radius - 14 - (1 - k) * 26);
            ctx.restore();
        });

        ctx.save();
        ctx.translate(this.x, this.y);
        weaponTrail(ctx, this.weaponAngle, Math.sign(this.weaponSpin) || 1, this.radius + 4, this.weaponReach + 2, this.hitColor || "#dfe8ff", { sweep: 1.3, alpha: 0.3 });
        // The dagger orbits the body instead of pointing at the opponent.
        ctx.rotate(this.weaponAngle);

        drawDagger(ctx, { start: this.radius, length: 30, width: 6 });

        ctx.restore();
    }
}
