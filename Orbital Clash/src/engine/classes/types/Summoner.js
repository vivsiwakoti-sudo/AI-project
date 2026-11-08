import { FighterBase } from "../FighterBase.js";
import { FighterFactory } from "../../FighterFactory.js";
import { FIGHTER_CLASSES } from "../../fighterDefinitions.js";

export const SUMMON_INTERVAL = 15;
export const SUMMON_HEALTH = 15;
export const SUMMONS_PER_PULSE = 2;

// Every roster class is equally likely to be summoned, except the Summoner itself.
// A summoned Duplicator's clone swarm is torn down whenever its summon leaves play.
const NON_SUMMONABLE = new Set(["Summoner"]);
export const SUMMONABLE_CLASSES = Object.keys(FIGHTER_CLASSES).filter(name => !NON_SUMMONABLE.has(name));

export class Summoner extends FighterBase {
    constructor(data, x, y) {
        super(data, x, y);
        this.summons = [];
        this.summonTimer = SUMMON_INTERVAL;
    }

    update(dt, opponent) {
        // Summons are only alive while their summoner is; a summoner knocked out
        // by any path (including ones that skip die()) takes them down here.
        if (this.isDead) {
            this.killSummons();
            return;
        }
        super.update(dt, opponent);
        this.summons = this.summons.filter(summon => {
            if (!summon.isDead && summon.health > 0) return true;
            summon.killCloneTree?.();
            return false;
        });

        this.summonTimer -= dt;
        if (this.summonTimer <= 0) {
            this.summonTimer += SUMMON_INTERVAL;
            for (let i = 0; i < SUMMONS_PER_PULSE; i++) this.summonRandom();
        }
    }

    summonRandom() {
        const name = SUMMONABLE_CLASSES[Math.floor(Math.random() * SUMMONABLE_CLASSES.length)];
        const arenaSize = this.arenaSize ?? 800;
        const angle = Math.random() * Math.PI * 2;
        const distance = this.radius + 30;
        const x = Math.max(0, Math.min(arenaSize, this.x + Math.cos(angle) * distance));
        const y = Math.max(0, Math.min(arenaSize, this.y + Math.sin(angle) * distance));

        const summon = FighterFactory.createFighter(name, x, y);
        summon.owner = this;
        summon.health = SUMMON_HEALTH;
        summon.maxHealth = SUMMON_HEALTH;
        summon.arenaSize = this.arenaSize;
        summon.particleSystem = this.particleSystem;
        this.summons.push(summon);
        this.particleSystem?.ring(x, y, summon.color, { startRadius: 4, endRadius: 70, life: 0.45, lineWidth: 3 });
        return summon;
    }

    die(particleSystem) {
        if (this.isDead) return;
        super.die(particleSystem);
        this.killSummons(particleSystem || this.particleSystem);
    }

    killSummons(particles = this.particleSystem) {
        for (const summon of this.summons) {
            if (!summon.isDead) {
                summon.health = 0;
                summon.die(particles);
            }
            summon.killCloneTree?.();
        }
        this.summons = [];
    }

    draw(ctx) {
        if (this.isDead || this.health <= 0) return;

        for (const summon of this.summons) {
            if (summon.isDead || summon.health <= 0) continue;
            ctx.save();
            ctx.strokeStyle = "rgba(192, 132, 252, 0.35)";
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(this.x, this.y);
            ctx.lineTo(summon.x, summon.y);
            ctx.stroke();
            ctx.restore();
            summon.draw(ctx);
        }

        super.draw(ctx);
        this.drawStaff(ctx);
    }

    drawStaff(ctx) {
        const r = this.radius;
        const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 200);
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.lastAngle);
        ctx.strokeStyle = "#6b4423";
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(r * 0.2, r * 0.5);
        ctx.lineTo(r + 20, r * 0.5);
        ctx.stroke();
        ctx.shadowBlur = 12;
        ctx.shadowColor = this.color;
        ctx.fillStyle = `rgba(192, 132, 252, ${pulse})`;
        ctx.beginPath();
        ctx.arc(r + 20, r * 0.5, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}
