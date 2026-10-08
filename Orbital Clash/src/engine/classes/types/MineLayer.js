import { FighterBase } from "../FighterBase.js";
import { DamageSystem } from "../../systems/DamageSystem.js";

export class MineLayer extends FighterBase {
    constructor(data, x, y) {
        super(data, x, y);
        this.mines = []; // {x, y, age}
        this.mineLifetime = 25;
        this.mineCooldown = 1.5; // Small arming delay before the first mine.
        this.hitColor = "#ffd166";
        this.MINE_RADIUS = 20; // 2x the original 10px body - keeps the trigger radius in sync with the visual.
    }

    update(dt, opponent) {
        super.update(dt, opponent);

        // Cooldown
        if (this.mineCooldown > 0) this.mineCooldown -= dt;

        // Spawn Mines
        if (this.mineCooldown <= 0) {
            this.mines.push({ x: this.x, y: this.y, age: 0 });
            this.mineCooldown = this.cooldown || 5;
            this.useAbility();
        }

        // Check Mine Collisions. Mines are AoE, so every living fighter in the
        // arena can set one off - not just the single opponent this class was
        // handed, which used to let the other two fighters of a four-way brawl
        // walk over mines untouched.
        const standing = this.victims?.length
            ? this.victims
            : (opponent && !opponent.isDead ? [opponent] : []);
        if (standing.length) {
            this.mines = this.mines.filter(mine => {
                const victim = standing.find(f => Math.hypot(mine.x - f.x, mine.y - f.y) < this.MINE_RADIUS * 2 + f.radius);
                if (!victim) return true;
                this.explode(mine, victim);
                return false;
            });
        }

        // Clean up expired mines using game time so 2x/3x speed stays consistent.
        this.mines.forEach(mine => { mine.age += dt; });
        this.mines = this.mines.filter(mine => mine.age < this.mineLifetime);
    }

    explode(mine, opponent) {
        DamageSystem.applyDamage(this, opponent, this.damage, "AOE", { ignoreCooldown: true });
        this.detonationFlash = 0.35;
        this.detonationX = mine.x;
        this.detonationY = mine.y;
        // Knock the victim off the blast so a single mine cannot chain-trigger.
        const angle = Math.atan2(opponent.y - mine.y, opponent.x - mine.x);
        opponent.vx = Math.cos(angle);
        opponent.vy = Math.sin(angle);
        if (this.particleSystem) {
            this.particleSystem.emit(mine.x, mine.y, "#ffb703", 34, { speed: 520, size: 3.6 });
            this.particleSystem.emit(mine.x, mine.y, "#ff4d4d", 18, { speed: 380, size: 3 });
            this.particleSystem.ring(mine.x, mine.y, "#ffb703", { startRadius: this.MINE_RADIUS * 0.6, endRadius: 130, life: 0.4, lineWidth: 5 });
        }
    }

    draw(ctx) {
        super.draw(ctx);

        // Draw Mines with detailed visuals
        this.mines.forEach(mine => {
            const opacity = Math.max(0.3, 1 - mine.age / this.mineLifetime);
            const R = this.MINE_RADIUS;
            const pulse = (Math.sin((mine.age || 0) * 8) + 1) / 2;

            ctx.save();
            ctx.globalAlpha = opacity;

            // Warning aura that pulses faster as the mine ages.
            const aura = ctx.createRadialGradient(mine.x, mine.y, R * 0.6, mine.x, mine.y, R * 2.2);
            aura.addColorStop(0, `rgba(255, 170, 0, ${0.25 + pulse * 0.25})`);
            aura.addColorStop(1, "rgba(255, 120, 0, 0)");
            ctx.fillStyle = aura;
            ctx.beginPath();
            ctx.arc(mine.x, mine.y, R * 2.2, 0, Math.PI * 2);
            ctx.fill();

            // Spikes.
            ctx.fillStyle = "#3b3f47";
            for (let i = 0; i < 8; i++) {
                const a = (i / 8) * Math.PI * 2;
                ctx.beginPath();
                ctx.moveTo(mine.x + Math.cos(a - 0.2) * R * 0.9, mine.y + Math.sin(a - 0.2) * R * 0.9);
                ctx.lineTo(mine.x + Math.cos(a) * R * 1.45, mine.y + Math.sin(a) * R * 1.45);
                ctx.lineTo(mine.x + Math.cos(a + 0.2) * R * 0.9, mine.y + Math.sin(a + 0.2) * R * 0.9);
                ctx.closePath();
                ctx.fill();
            }

            // Metal shell with a specular highlight.
            const shell = ctx.createRadialGradient(mine.x - R * 0.35, mine.y - R * 0.35, R * 0.1, mine.x, mine.y, R);
            shell.addColorStop(0, "#9aa3b0");
            shell.addColorStop(0.5, "#454b56");
            shell.addColorStop(1, "#15181d");
            ctx.fillStyle = shell;
            ctx.beginPath();
            ctx.arc(mine.x, mine.y, R, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "#ffb703";
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Blinking fuse light.
            ctx.shadowBlur = 14;
            ctx.shadowColor = "#ff3b1f";
            ctx.fillStyle = `rgba(255, ${Math.round(80 + pulse * 120)}, 40, 1)`;
            ctx.beginPath();
            ctx.arc(mine.x, mine.y, R * 0.28, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });

        // Detonation flash left behind by the most recent explosion.
        if (this.detonationFlash > 0) {
            const progress = 1 - this.detonationFlash / 0.35;
            ctx.save();
            ctx.globalAlpha = 1 - progress;
            ctx.strokeStyle = "#ffb703";
            ctx.lineWidth = 5;
            ctx.shadowBlur = 24;
            ctx.shadowColor = "#ffb703";
            ctx.beginPath();
            ctx.arc(this.detonationX, this.detonationY, this.MINE_RADIUS * 0.6 + progress * 90, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
    }
}
