import { FighterBase } from "../FighterBase.js";
import { DamageSystem } from "../../systems/DamageSystem.js";

export class Meteor extends FighterBase {
    constructor(data, x, y) {
        super(data, x, y);
        this.cooldownTimer = 10;
        this.warningTimer = 0;
        this.targetZone = null; // {x, y, size}
    }

    update(dt, opponent) {
        super.update(dt, opponent);
        
        if (this.warningTimer > 0) {
            this.warningTimer -= dt;
            this.chargeProgress = Math.min(1, 1 - this.warningTimer / 3);
            if (this.warningTimer <= 0) {
                // Crushes every other fighter in the zone; Meteor-class fighters are immune.
                const standing = (this.victims?.length ? this.victims : [opponent]).filter(f => f && !f.isDead && !(f instanceof Meteor));
                const victims = standing.filter(f => !f.isUntouchable && this.isInsideZone(f));
                victims.forEach(victim => {
                    DamageSystem.applyDamage(this, victim, this.damage, "AOE", { ignoreCooldown: true, allowSelfDamage: true });
                });
                if (this.particleSystem) {
                    const cx = this.targetZone.x + this.targetZone.width / 2;
                    const cy = this.targetZone.y + this.targetZone.height / 2;
                    this.particleSystem.emit(cx, cy, "#ff6b35", 60, { speed: 700, size: 5, life: 1 });
                    this.particleSystem.emit(cx, cy, "#ffd166", 30, { speed: 900, size: 3, life: 0.6 });
                    this.particleSystem.ring(cx, cy, "#ff8c42", { startRadius: 20, endRadius: 320, life: 0.7, lineWidth: 7 });
                    this.particleSystem.ring(cx, cy, "#ffffff", { startRadius: 10, endRadius: 180, life: 0.5, lineWidth: 4 });
                }
                this.impactTimer = 0.5;
                this.impactX = this.targetZone.x + this.targetZone.width / 2;
                this.impactY = this.targetZone.y + this.targetZone.height / 2;
                this.chargeProgress = 0;
                this.targetZone = null;
            }
        } else {
            // cooldownTimer is ticked by FighterBase; do not decrement it again here.
            this.impactTimer = Math.max(0, (this.impactTimer || 0) - dt);
            if (this.cooldownTimer <= 0) {
                this.startStrike();
                this.cooldownTimer = this.cooldown || 10;
            }
        }
    }

    startStrike() {
        this.warningTimer = 3; // 3s warning
        // Pick one quarter of the arena
        const q = Math.floor(Math.random() * 4);
        const size = 400;
        this.targetZone = {
            x: (q % 2) * size,
            y: Math.floor(q / 2) * size,
            width: size,
            height: size
        };
        this.useAbility();
        if (this.particleSystem) {
            const cx = this.targetZone.x + size / 2;
            const cy = this.targetZone.y + size / 2;
            this.particleSystem.ring(cx, cy, "#ff6b35", { startRadius: 10, endRadius: 260, life: 0.6, lineWidth: 3, alpha: 0.6 });
        }
    }

    isInsideZone(victim) {
        if (!this.targetZone) return false;
        const z = this.targetZone;
        const nearestX = Math.max(z.x, Math.min(victim.x, z.x + z.width));
        const nearestY = Math.max(z.y, Math.min(victim.y, z.y + z.height));
        return Math.hypot(victim.x - nearestX, victim.y - nearestY) <= (victim.radius || 0);
    }

    draw(ctx) {
        super.draw(ctx);
        
        if (this.targetZone) {
            ctx.save();
            
            if (this.warningTimer > 0) {
                // Warning phase: blinking red zone
                const blinkPhase = Math.sin(this.warningTimer * Math.PI * 2 / 3) > 0 ? 1 : 0.4;
                
                // Zone background
                ctx.fillStyle = `rgba(255, 100, 0, ${blinkPhase * 0.4})`;
                ctx.fillRect(this.targetZone.x, this.targetZone.y, this.targetZone.width, this.targetZone.height);
                
                // Zone border
                ctx.strokeStyle = `rgba(255, 100, 0, ${blinkPhase * 0.8})`;
                ctx.lineWidth = 3;
                ctx.strokeRect(this.targetZone.x, this.targetZone.y, this.targetZone.width, this.targetZone.height);
                
                // Warning corner indicators
                ctx.fillStyle = `rgba(255, 200, 0, ${blinkPhase})`;
                const cornerSize = 30;
                // Top-left
                ctx.fillRect(this.targetZone.x, this.targetZone.y, cornerSize, 3);
                ctx.fillRect(this.targetZone.x, this.targetZone.y, 3, cornerSize);
                // Top-right
                ctx.fillRect(this.targetZone.x + this.targetZone.width - cornerSize, this.targetZone.y, cornerSize, 3);
                ctx.fillRect(this.targetZone.x + this.targetZone.width - 3, this.targetZone.y, 3, cornerSize);
                // Bottom-left
                ctx.fillRect(this.targetZone.x, this.targetZone.y + this.targetZone.height - 3, cornerSize, 3);
                ctx.fillRect(this.targetZone.x, this.targetZone.y + this.targetZone.height - cornerSize, 3, cornerSize);
                // Bottom-right
                ctx.fillRect(this.targetZone.x + this.targetZone.width - cornerSize, this.targetZone.y + this.targetZone.height - 3, cornerSize, 3);
                ctx.fillRect(this.targetZone.x + this.targetZone.width - 3, this.targetZone.y + this.targetZone.height - cornerSize, 3, cornerSize);
                
                // Pulsing warning circle at center
                const centerX = this.targetZone.x + this.targetZone.width / 2;
                const centerY = this.targetZone.y + this.targetZone.height / 2;
                ctx.strokeStyle = `rgba(255, 100, 0, ${blinkPhase})`;
                ctx.lineWidth = 2;
                const pulseSize = 30 + Math.sin(this.warningTimer * 3) * 15;
                ctx.beginPath();
                ctx.arc(centerX, centerY, pulseSize, 0, Math.PI * 2);
                ctx.stroke();
                
                // Incoming meteor: flaming rock with a streaking tail.
                const fallProgress = (3 - this.warningTimer) / 3;
                const meteorX = centerX;
                const meteorY = this.targetZone.y - 90 + fallProgress * 90;
                const tail = ctx.createLinearGradient(meteorX, meteorY - 70, meteorX, meteorY);
                tail.addColorStop(0, "rgba(255, 120, 0, 0)");
                tail.addColorStop(1, `rgba(255, 190, 60, ${blinkPhase})`);
                ctx.fillStyle = tail;
                ctx.beginPath();
                ctx.moveTo(meteorX - 9, meteorY);
                ctx.lineTo(meteorX, meteorY - 70);
                ctx.lineTo(meteorX + 9, meteorY);
                ctx.closePath();
                ctx.fill();

                const rock = ctx.createRadialGradient(meteorX - 3, meteorY - 3, 1, meteorX, meteorY, 12);
                rock.addColorStop(0, "#fff2c4");
                rock.addColorStop(0.4, "#ff8a1f");
                rock.addColorStop(1, "#5a1a05");
                ctx.shadowBlur = 22;
                ctx.shadowColor = "#ff6a00";
                ctx.fillStyle = rock;
                ctx.beginPath();
                ctx.arc(meteorX, meteorY, 11, 0, Math.PI * 2);
                ctx.fill();
            } else {
                // Strike phase: molten blast filling the zone
                const zx = this.targetZone.x + this.targetZone.width / 2;
                const zy = this.targetZone.y + this.targetZone.height / 2;
                const blast = ctx.createRadialGradient(zx, zy, 0, zx, zy, Math.max(this.targetZone.width, this.targetZone.height) * 0.75);
                blast.addColorStop(0, "rgba(255, 250, 200, 0.85)");
                blast.addColorStop(0.45, "rgba(255, 150, 0, 0.6)");
                blast.addColorStop(1, "rgba(255, 60, 0, 0.15)");
                ctx.fillStyle = blast;
                ctx.fillRect(this.targetZone.x, this.targetZone.y, this.targetZone.width, this.targetZone.height);

                ctx.shadowBlur = 18;
                ctx.shadowColor = "#ffd24a";
                ctx.strokeStyle = "rgba(255, 255, 140, 0.9)";
                ctx.lineWidth = 4;
                ctx.strokeRect(this.targetZone.x, this.targetZone.y, this.targetZone.width, this.targetZone.height);
            }
            
            ctx.restore();
        }

        // Lingering crater glow after the impact.
        if (this.impactTimer > 0 && this.impactX != null) {
            const progress = 1 - this.impactTimer / 0.5;
            ctx.save();
            ctx.globalAlpha = 1 - progress;
            ctx.strokeStyle = "#ff8c42";
            ctx.lineWidth = 6;
            ctx.shadowBlur = 30;
            ctx.shadowColor = "#ff6b35";
            ctx.beginPath();
            ctx.arc(this.impactX, this.impactY, 40 + progress * 220, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
    }
}
