import { FighterBase } from "../FighterBase.js";
import { DamageSystem } from "../../systems/DamageSystem.js";
import { drawKatana } from "../../systems/Weapons.js";

export class Samurai extends FighterBase {
    // Seconds an enemy's attacks stay frozen after one of this Samurai's hits.
    static ATTACK_PAUSE = 0.6;

    constructor(data, x, y) {
        super(data, x, y);
        this.comboTimer = 0;
        this.isInvisible = false;
        this.invisibilityTimer = 0;
        this.critChance = 0.05;
        this.slashTimer = 0;
        this.comboActive = false;
        this.comboPass = 0;
        this.comboPassTimer = 0;
        this.comboPassHit = false;
        this.redTrail = [];
        // The katana is held at a fixed angle beside him and does not rotate.
        this.weaponSpin = 0;
        this.weaponAngle = -Math.PI / 2;
        this.weaponReach = (this.radius + 18) * 1.5;
    }

    update(dt, opponent) {
        super.update(dt, opponent);

        // The katana never stops orbiting; the blade sweeps the ring every frame
        // and cuts whoever it crosses, capped to one hit per revolution.
        const [tip] = this.meleeSpinUpdate(dt, { speed: this.weaponSpin });
        if (opponent && !opponent.isDead) {
            const target = this.bladeTouchTarget(tip.x, tip.y, opponent, 7);
            const reaching = target !== null;
            if (reaching && !this.weaponHot && this.comboTimer <= 0) {
                this.weaponHot = true;
                const isCrit = Math.random() < this.critChance;
                // 6 damage for a normal katana cut (the class's defined damage), 15
                // on a critical. The blade used to land a flat 5 and the crit 7.5,
                // ignoring the stat block while every other class honoured it.
                if (DamageSystem.applyDamage(this, target, isCrit ? 15 : this.damage, "Melee", { ignoreCooldown: true, crit: isCrit })) {
                    target.pauseAttacks?.(Samurai.ATTACK_PAUSE);
                    this.triggerSwing(tip.angle, { duration: 0.2, reach: 40, color: isCrit ? "#ffd166" : "#ff5050" });
                    if (target.particleSystem) target.particleSystem.emitImpact(target.x, target.y, isCrit ? "#ffd166" : "#ff3232", isCrit ? 22 : 12);
                }
            } else if (!reaching) {
                this.weaponHot = false;
            }
        }

        this.redTrail = this.redTrail.filter(point => {
            point.life -= dt;
            return point.life > 0;
        });

        if (this.comboActive) {
            this.comboPassTimer -= dt;
            this.slashTimer = Math.max(0, this.comboPassTimer);

            if (this.comboPassTimer <= 0) {
                if (this.comboPass >= 3) {
                    this.comboActive = false;
                    this.comboTimer = 3;
                    this.performCombo(opponent);
                } else {
                    this.startComboPass(opponent);
                }
            }
            return;
        }

        if (this.isInvisible) {
            this.invisibilityTimer -= dt;
            if (this.invisibilityTimer <= 0) {
                this.isInvisible = false;
                this.critChance = 0.05;
            }
            return;
        }

        if (this.comboTimer > 0) this.comboTimer -= dt;

        if (opponent && this.comboTimer <= 0) {
            const dx = opponent.x - this.x;
            const dy = opponent.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 100) {
                this.comboActive = true;
                this.comboPass = 0;
                this.startComboPass(opponent);
                // Combos are paced by the sword's 3-second gap, not just proximity.
                this.comboTimer = this.cooldown || 3;
            }
        }
    }

    startComboPass(opponent) {
        if (!opponent) return;
        const angle = Math.atan2(opponent.y - this.y, opponent.x - this.x);
        this.vx = Math.cos(angle);
        this.vy = Math.sin(angle);
        this.lastAngle = angle;
        this.comboPass += 1;
        this.comboPassTimer = 0.18;
        this.comboPassHit = false;

        const startX = this.x;
        const startY = this.y;
        const passDistance = this.radius + opponent.radius + 26;
        this.x = opponent.x + this.vx * passDistance;
        this.y = opponent.y + this.vy * passDistance;
        this.redTrail.push({
            startX,
            startY,
            endX: this.x,
            endY: this.y,
            life: 0.35
        });

        const misses = Math.random() < 0.25;
        if (!misses) {
            const isCrit = Math.random() < this.critChance;
            // Combo dashes deal the class's damage (6), 15 on a critical - "three
            // consecutive 6-damage slashes" as the class describes itself. They
            // used to land 5, so a full combo dealt 15 instead of 18.
            const landed = DamageSystem.applyDamage(
                this,
                opponent,
                isCrit ? 15 : this.damage,
                "Melee",
                { ignoreCooldown: true, crit: isCrit }
            );
            if (landed) opponent.pauseAttacks?.(Samurai.ATTACK_PAUSE);
        }
        this.comboPassHit = true;
    }

    performCombo(opponent) {
        this.isInvisible = true;
        this.invisibilityTimer = 5;
        this.critChance = 0.25;
    }

    draw(ctx) {
        if (this.isDead || this.health <= 0) return;
        this.redTrail.forEach(point => {
            const opacity = point.life / 0.35;
            ctx.save();
            ctx.lineCap = "round";
            ctx.shadowBlur = 18;
            ctx.shadowColor = "#ff2038";
            ctx.strokeStyle = `rgba(255, 35, 55, ${opacity * 0.55})`;
            ctx.lineWidth = this.radius * 0.9;
            ctx.beginPath();
            ctx.moveTo(point.startX, point.startY);
            ctx.lineTo(point.endX, point.endY);
            ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.strokeStyle = `rgba(255, 220, 220, ${opacity * 0.9})`;
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.restore();
        });

        if (this.isInvisible) {
            ctx.globalAlpha = 0.15;
            // Invisible shimmer effect
            super.draw(ctx);
            ctx.globalAlpha = 1.0;

            // Outline to show presence
            ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.stroke();
        } else {
            super.draw(ctx);
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.weaponAngle);
            drawKatana(ctx, { start: this.radius, length: this.weaponReach - this.radius });
            ctx.restore();
        }
    }
}
