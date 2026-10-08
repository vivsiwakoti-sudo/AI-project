import { FighterBase } from "../FighterBase.js";

export class Mutant extends FighterBase {
    constructor(data, x, y) {
        super(data, x, y);
        this.mutationTimer = 5;
        this.updateMutantScale();
    }

    update(dt, opponent) {
        this.updateMutantScale();
        super.update(dt, opponent);
        this.mutationTimer -= dt;
        this.isCharging = this.mutationTimer <= 1.5;
        this.chargeProgress = Math.max(0, Math.min(1, 1 - this.mutationTimer / 5));
        if (this.mutationTimer <= 0) {
            this.mutate();
            this.mutationTimer = 5;
        }
        this.mutationFlash = Math.max(0, (this.mutationFlash || 0) - dt);
    }

    updateMutantScale() {
        const maxHealthRatio = Math.max(0, Math.min(1, this.maxHealth / 250));
        const healthRatio = this.maxHealth > 0 ? Math.max(0, Math.min(1, this.health / this.maxHealth)) : 0;
        const healthyRadius = 18 + maxHealthRatio * 20;
        this.radius = healthyRadius * (0.55 + healthRatio * 0.45);
    }

    mutate() {
        const healthPercent = this.maxHealth > 0 ? this.health / this.maxHealth : 0;

        // Randomly change HP/max HP and damage within ranges
        const newMaxHealth = Math.floor(Math.random() * (250 - 10 + 1)) + 10;
        this.damage = Math.floor(Math.random() * (100 - 10 + 1)) + 10;

        this.maxHealth = newMaxHealth;
        // Health is preserved as a percentage, so mutating can both gain and lose HP.
        this.health = Math.max(1, Math.ceil(newMaxHealth * healthPercent));
        this.updateMutantScale();
        this.mutationFlash = 0.6;
        this.emitBurst(this.damage >= 60 ? "#ff4d4d" : this.color, 26, 420);
        if (this.particleSystem) {
            this.particleSystem.ring(this.x, this.y, this.color, { startRadius: this.radius, endRadius: 130, life: 0.5, lineWidth: 4 });
        }
    }

    draw(ctx) {
        if (this.isDead || this.health <= 0) return;
        // Mutant body with dynamic appearance
        ctx.save();
        ctx.translate(this.x, this.y);
        
        // Main body - grows/shrinks with health
        const bodySize = this.radius;
        
        ctx.shadowBlur = 20;
        ctx.shadowColor = this.color;
        const flesh = ctx.createRadialGradient(-bodySize * 0.3, -bodySize * 0.3, bodySize * 0.1, 0, 0, bodySize);
        flesh.addColorStop(0, "#ffffff");
        flesh.addColorStop(0.35, this.color);
        flesh.addColorStop(1, "#12081c");
        ctx.fillStyle = flesh;
        ctx.beginPath();
        ctx.arc(0, 0, bodySize, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        
        // Inner core glow based on mutation (pulses with the mutation)
        const pulse = 0.85 + 0.15 * Math.sin(Date.now() / 160);
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.5, (this.damage / 100) * 0.4) * pulse})`;
        ctx.beginPath();
        ctx.arc(0, 0, bodySize * 0.6, 0, Math.PI * 2);
        ctx.fill();
        
        // Dynamic arms - grow/shrink with damage
        const damagePercent = Math.min(1, this.damage / 100);
        const armLength = 15 + damagePercent * 25;
        const armWidth = 3 + damagePercent * 5;
        
        // Left arm
        ctx.strokeStyle = this.color;
        ctx.lineWidth = armWidth;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(-bodySize/2, 0);
        ctx.lineTo(-bodySize/2 - armLength, -armLength/2);
        ctx.stroke();
        
        // Right arm
        ctx.beginPath();
        ctx.moveTo(bodySize/2, 0);
        ctx.lineTo(bodySize/2 + armLength, armLength/2);
        ctx.stroke();
        
        // Top tendril
        ctx.beginPath();
        ctx.moveTo(0, -bodySize);
        ctx.quadraticCurveTo(10 * damagePercent, -bodySize - armLength/2, 5 * damagePercent, -bodySize - armLength);
        ctx.stroke();
        
        // Damage shows as a denser crown of larger, brighter spikes.
        const spikeCount = 2 + Math.round(damagePercent * 14);
        const spikeLength = 5 + damagePercent * 11;
        const spikeBase = 2.5 + damagePercent * 2;
        const spikeGradient = ctx.createLinearGradient(0, -bodySize - spikeLength, 0, -bodySize);
        spikeGradient.addColorStop(0, "#fff3f3");
        spikeGradient.addColorStop(0.35, `rgba(255, ${Math.round(65 + damagePercent * 55)}, ${Math.round(75 + damagePercent * 45)}, 1)`);
        spikeGradient.addColorStop(1, "#451221");
        ctx.fillStyle = spikeGradient;
        ctx.strokeStyle = `rgba(255, 225, 230, ${0.35 + damagePercent * 0.55})`;
        ctx.lineWidth = 1;
        ctx.shadowBlur = 4 + damagePercent * 12;
        ctx.shadowColor = `rgba(255, 55, 75, ${0.25 + damagePercent * 0.6})`;
        for (let i = 0; i < spikeCount; i++) {
            const angle = (i / spikeCount) * Math.PI * 2 + this.spinAngle * 0.08;
            const ux = Math.cos(angle);
            const uy = Math.sin(angle);
            const tx = -uy;
            const ty = ux;
            const baseX = ux * (bodySize - 1);
            const baseY = uy * (bodySize - 1);
            const tipX = ux * (bodySize + spikeLength);
            const tipY = uy * (bodySize + spikeLength);
            ctx.beginPath();
            ctx.moveTo(baseX + tx * spikeBase, baseY + ty * spikeBase);
            ctx.lineTo(tipX, tipY);
            ctx.lineTo(baseX - tx * spikeBase, baseY - ty * spikeBase);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }
        
        ctx.restore();
    }
}
