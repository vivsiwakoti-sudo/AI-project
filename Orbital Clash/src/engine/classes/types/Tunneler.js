import { FighterBase } from "../FighterBase.js";
import { Projectile } from "../Projectile.js";
import { DamageSystem } from "../../systems/DamageSystem.js";

export class Tunneler extends FighterBase {
    constructor(data, x, y) {
        super(data, x, y);
        this.undergroundTimer = 0;
        this.spikes = [];
        this.isUnderground = false;
        this.entryWall = null;
    }

    onWallHit(wall) {
        if (!this.isUnderground && Math.random() < 0.4) {
            this.isUnderground = true;
            this.isUntargetable = true;
            this.undergroundTimer = 3;
            this.entryWall = wall;
            this.burrowFlash = 0.4;
            if (this.particleSystem) {
                this.particleSystem.emit(this.x, this.y, "#8b5a2b", 24, { speed: 380, size: 3.6 });
                this.particleSystem.ring(this.x, this.y, "#d2691e", { startRadius: 6, endRadius: 70, life: 0.4, lineWidth: 4 });
            }
        }
    }

    update(dt, opponent) {
        this.spikes.forEach(spike => {
            spike.update(dt);
            // A spike fan is a travelling hitbox, so it can strike any fighter it
            // crosses rather than only the one opponent reference handed over by
            // the arena.
            const candidates = this.victims?.length ? this.victims : (opponent ? [opponent] : []);
            const struck = candidates.find(victim => victim && !victim.isDead
                && DamageSystem.checkHitbox({ x: spike.x, y: spike.y, radius: 4 }, victim, "Body"));
            if (struck) {
                // A parried spike is turned around instead of being consumed.
                if (DamageSystem.applyDamage(this, struck, spike.damage, "Projectile", { projectile: spike })) {
                    spike.active = false;
                }
            }
        });
        this.spikes = this.spikes.filter(spike => spike.active);
        this.burrowFlash = Math.max(0, (this.burrowFlash || 0) - dt);

        if (this.isUnderground) {
            this.undergroundTimer -= dt;
            if (this.particleSystem && Math.random() < 0.5) {
                this.particleSystem.emit(this.x, this.y, "#8b5a2b", 1, { speed: 60, size: 3, life: 0.5 });
            }
            if (this.undergroundTimer <= 0) {
                this.isUnderground = false;
                this.isUntargetable = false;
                const wallNames = ["left", "right", "top", "bottom"];
                const availableWalls = wallNames.filter(wallName => wallName !== this.entryWall);
                const wall = wallNames.indexOf(availableWalls[Math.floor(Math.random() * availableWalls.length)]);
                const edge = 20 + this.radius;
                const size = this.arenaSize ?? 800;
                if (wall === 0) { this.x = edge; this.y = edge + Math.random() * (size - edge * 2); }
                else if (wall === 1) { this.x = size - edge; this.y = edge + Math.random() * (size - edge * 2); }
                else if (wall === 2) { this.x = edge + Math.random() * (size - edge * 2); this.y = edge; }
                else { this.x = edge + Math.random() * (size - edge * 2); this.y = size - edge; }
                this.entryWall = null;
                this.burrowFlash = 0.4;
                // Fire spikes aimed at opponent
                if (opponent) {
                    const baseAngle = Math.atan2(opponent.y - this.y, opponent.x - this.x);
                    this.lastAngle = baseAngle;
                    for(let i=0; i<5; i++) {
                        const angle = baseAngle + (i - 2) * 0.2;
                        this.spikes.push(new Projectile(this.x, this.y, Math.cos(angle)*8, Math.sin(angle)*8, this.damage, this));
                    }
                    if (this.particleSystem) {
                        this.particleSystem.emit(this.x, this.y, "#d2a679", 26, { speed: 420, size: 3.4 });
                        this.particleSystem.emit(this.x, this.y, "#A9A9A9", 14, { speed: 560, size: 2.6 });
                        this.particleSystem.ring(this.x, this.y, "#d2691e", { startRadius: 8, endRadius: 90, life: 0.45, lineWidth: 4 });
                    }
                }
            }
            return;
        }
        // A burrowed Tunneler can neither hit nor be hit: it must not run the base
        // update at all, because CollisionSystem resolves elimination damage from
        // a wall hit (`fighter.onWallHit` -> resolveFighterWall -> applyDamage),
        // and a corpse that kept colliding went on dealing wall-slam damage to
        // whoever it was flying into.
        if (this.isDead || this.health <= 0) return;
        super.update(dt, opponent);
    }

    draw(ctx) {
        if (this.isDead || this.health <= 0) return;
        // Only draw if visible (not underground)
        if (!this.isUnderground) {
            super.draw(ctx);

            // Spinning drill nose with spiral grooves.
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.lastAngle);
            const spin = Date.now() / 90;
            const base = this.radius - 2;
            const len = 20;
            const steel = ctx.createLinearGradient(0, -8, 0, 8);
            steel.addColorStop(0, "#e4e8ee");
            steel.addColorStop(0.5, "#8d96a3");
            steel.addColorStop(1, "#3d444f");
            ctx.shadowBlur = 8;
            ctx.shadowColor = "#ffd27a";
            ctx.fillStyle = steel;
            ctx.beginPath();
            ctx.moveTo(base, -8);
            ctx.lineTo(base + len, 0);
            ctx.lineTo(base, 8);
            ctx.closePath();
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.strokeStyle = "rgba(30, 34, 42, 0.8)";
            ctx.lineWidth = 1.6;
            for (let i = 0; i < 4; i++) {
                const t = ((i / 4) + (spin % 1) / 4) % 1;
                const x = base + len * t;
                const h = 8 * (1 - t);
                ctx.beginPath();
                ctx.moveTo(x - 2, -h);
                ctx.lineTo(x + 2, h);
                ctx.stroke();
            }
            ctx.restore();
        }

        // Thrown spikes: steel bolts with a glinting tip.
        this.spikes.forEach(s => {
            ctx.save();
            ctx.translate(s.x, s.y);
            ctx.rotate(Math.atan2(s.vy, s.vx));
            const shaft = ctx.createLinearGradient(0, -2.5, 0, 2.5);
            shaft.addColorStop(0, "#f1f4f8");
            shaft.addColorStop(1, "#7a838f");
            ctx.shadowBlur = 8;
            ctx.shadowColor = "#cfd8e3";
            ctx.fillStyle = shaft;
            ctx.fillRect(-4, -2.2, 12, 4.4);
            ctx.beginPath();
            ctx.moveTo(14, 0);
            ctx.lineTo(8, -3.4);
            ctx.lineTo(8, 3.4);
            ctx.closePath();
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(-2, -1.2, 8, 1);
            ctx.restore();
        });
    }
}
