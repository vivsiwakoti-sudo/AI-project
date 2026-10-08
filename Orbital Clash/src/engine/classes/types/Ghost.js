import { FighterBase } from "../FighterBase.js";
import { DamageSystem } from "../../systems/DamageSystem.js";

export class Ghost extends FighterBase {
    constructor(data, x, y) {
        super(data, x, y);
        this.isGhost = false;
        this.ghostTimer = 5;
        this.ghostDuration = 0;
        this.normalSpeed = data.speed;
    }

    update(dt, opponent) {
        super.update(dt, opponent);
        
        if (!this.isGhost) {
            this.ghostTimer -= dt;
            this.isCharging = this.ghostTimer <= 1.2;
            this.chargeProgress = Math.max(0, Math.min(1, 1 - this.ghostTimer / 5));
            if (this.ghostTimer <= 0) {
                this.isGhost = true;
                this.isInvulnerable = true;
                this.speed = 7; // Ghost speed
                this.ghostDuration = 5;
                this.ghostTimer = 5; // Reset
                this.isCharging = false;
                this.emitBurst("#ffffff", 22, 380);
                if (this.particleSystem) this.particleSystem.ring(this.x, this.y, "#ffffff", { startRadius: 6, endRadius: 90, life: 0.45, lineWidth: 3 });
            }
        } else {
            this.ghostDuration -= dt;
            if (this.particleSystem && Math.random() < 0.4) {
                this.particleSystem.emit(this.x, this.y, "#dfe9ff", 1, { speed: 40, size: 2.4, life: 0.5 });
            }
            // Phase damage is a body slam, so it uses the same one-per-cooldown
            // spacing every other body class gets. Without it the Ghost could deal
            // its damage EVERY FRAME while sitting inside an opponent - the single
            // highest damage-per-second bug in the roster - and it also ignored
            // the damage system's cooldown because the arena body pass was the
            // only place checking it. Every overlapping opponent is hit, not just
            // the one opponent reference the arena hands over.
            if (this.damageCooldown <= 0) {
                const victims = this.touchVictims?.length ? this.touchVictims : (opponent ? [opponent] : []);
                for (const victim of victims) {
                    if (this.damageCooldown > 0) break;
                    if (!DamageSystem.checkHitbox(this, victim, "Overlap")) continue;
                    if (DamageSystem.applyDamage(this, victim, this.damage, "Body")) {
                        if (victim.particleSystem) victim.particleSystem.emitImpact(victim.x, victim.y, this.color, 12);
                    }
                }
            }
            if (this.ghostDuration <= 0) {
                this.isGhost = false;
                this.isInvulnerable = false;
                this.speed = this.normalSpeed;
            }
        }
    }

    draw(ctx) {
        if (this.isDead || this.health <= 0) return;
        if (this.isGhost) {
            // Ethereal wisps trailing below the body.
            ctx.save();
            ctx.globalAlpha = 0.25;
            ctx.shadowBlur = 24;
            ctx.shadowColor = "#cfd8ff";
            ctx.fillStyle = "#e8ecff";
            for (let i = 0; i < 3; i++) {
                const wob = Math.sin(this.spinAngle * 2 + i * 2) * 5;
                ctx.beginPath();
                ctx.ellipse(this.x + (i - 1) * this.radius * 0.5 + wob, this.y + this.radius * 0.9 + i * 3, 4, 10 - i * 2, 0, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();

            ctx.globalAlpha = 0.4;
            // Ghost mode: ethereal glow
            ctx.shadowBlur = 30;
            ctx.shadowColor = "#FFFFFF";
            super.draw(ctx);
            
            // Spectral aura rings
            ctx.strokeStyle = `rgba(200, 200, 255, 0.3)`;
            ctx.lineWidth = 2;
            for (let i = 1; i <= 3; i++) {
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius + i * 8, 0, Math.PI * 2);
                ctx.stroke();
            }
            
            // Ghost eyes
            ctx.fillStyle = "#FFFFFF";
            ctx.globalAlpha = 0.6;
            ctx.beginPath();
            ctx.arc(this.x - 6, this.y - 3, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(this.x + 6, this.y - 3, 3, 0, Math.PI * 2);
            ctx.fill();
            
            // Ghost mouth (wavy)
            ctx.strokeStyle = "#FFFFFF";
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let i = 0; i < 10; i++) {
                const xx = this.x - 8 + i * 2;
                const yy = this.y + 3 + Math.sin(i * 0.5) * 2;
                if (i === 0) ctx.moveTo(xx, yy);
                else ctx.lineTo(xx, yy);
            }
            ctx.stroke();
            
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1.0;
        } else {
            ctx.globalAlpha = 1.0;
            super.draw(ctx);
        }
    }
}
