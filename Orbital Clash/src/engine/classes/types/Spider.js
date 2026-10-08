import { FighterBase } from "../FighterBase.js";
import { EffectSystem } from "../../systems/EffectSystem.js";
import { DamageSystem } from "../../systems/DamageSystem.js";

export class Spider extends FighterBase {
    constructor(data, x, y) {
        super(data, x, y);
        this.webs = [];            // {x, y, radius, life, tickTimer, touched}
        this.dropTimer = 0;        // paces web laying while it moves
        this.hitColor = "#c8ffe0";
    }

    createWeb(x, y) {
        // Webs are laid at most once every 3 seconds, so there is no risk of
        // stacking them on one spot - never skip a drop.
        this.webs.push({ x, y, radius: 42, life: 10, touched: false });
        if (this.webs.length > 40) this.webs.shift();
        if (this.particleSystem) {
            this.particleSystem.emit(x, y, "#dcf5ff", 16, { speed: 220, size: 2.4 });
            this.particleSystem.ring(x, y, "#a9e4ff", { startRadius: 6, endRadius: 60, life: 0.45, lineWidth: 3 });
        }
    }

    update(dt, opponent) {
        super.update(dt, opponent);

        // Lay a web where the Spider actually is, on a 3 second cadence, so the
        // webs trace its movement instead of being shot across the arena.
        this.dropTimer -= dt;
        if (this.dropTimer <= 0) {
            this.createWeb(this.x, this.y);
            this.dropTimer = 3;
        }

        // A web slows by 60% and deals 3 damage the moment it is touched, then
        // vanishes - so a web is a single one-shot trap rather than a DOT field.
        // Any living fighter can spring it, not just the one opponent the arena
        // hands over, so the other two fighters of a four-way brawl are caught too.
        const walkers = this.victims?.length
            ? this.victims
            : (opponent && !opponent.isDead ? [opponent] : []);
        this.webs = this.webs.filter(web => {
            web.life -= dt;
            const victim = walkers.find(f => !f.isDead && Math.hypot(f.x - web.x, f.y - web.y) <= web.radius + f.radius);

            if (victim && !web.touched) {
                web.touched = true;

                // Slowness is applied on touch and lingers briefly afterwards.
                EffectSystem.addEffect(victim, { name: "web-slow", duration: 2, multiplier: 0.4 });
                victim.slowVisual = true;

                DamageSystem.applyDamage(this, victim, 3, "AOE", { ignoreCooldown: true });
                if (victim.particleSystem) victim.particleSystem.emitImpact(victim.x, victim.y, "#c8ffe0", 12);

                // Spend the web: it is consumed on the touch that triggered it.
                return false;
            }

            return web.life > 0;
        });
    }

    draw(ctx) {
        super.draw(ctx);
        if (this.isDead || this.health <= 0) return;

        ctx.save();
        ctx.translate(this.x, this.y);
        // Eight jointed legs that flex as the spider moves.
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "rgba(15, 12, 20, 0.9)";
        ctx.lineWidth = 2.4;
        ctx.shadowBlur = 6;
        ctx.shadowColor = this.color;
        for (let i = 0; i < 8; i++) {
            const side = i < 4 ? 1 : -1;
            const idx = i % 4;
            const base = (idx - 1.5) * 0.55 + (side === 1 ? 0 : Math.PI);
            const flex = Math.sin(this.spinAngle * 3 + i * 1.3) * 0.12;
            const kneeX = Math.cos(base + flex) * (this.radius + 8);
            const kneeY = Math.sin(base + flex) * (this.radius + 8) - 5;
            const footX = Math.cos(base + flex * 1.5) * (this.radius + 17);
            const footY = Math.sin(base + flex * 1.5) * (this.radius + 17) + 4;
            ctx.beginPath();
            ctx.moveTo(Math.cos(base) * this.radius * 0.6, Math.sin(base) * this.radius * 0.6);
            ctx.lineTo(kneeX, kneeY);
            ctx.lineTo(footX, footY);
            ctx.stroke();
        }

        // Fangs and glowing eyes.
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#e8e8ee";
        for (const s of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(s * 3, this.radius - 1);
            ctx.lineTo(s * 5, this.radius + 8);
            ctx.lineTo(s * 1.5, this.radius + 1);
            ctx.closePath();
            ctx.fill();
        }
        ctx.shadowBlur = 8;
        ctx.shadowColor = "#ff2a2a";
        ctx.fillStyle = "#ff3b3b";
        for (const [ex, ey] of [[-5, this.radius * 0.45], [5, this.radius * 0.45], [-2.5, this.radius * 0.2], [2.5, this.radius * 0.2]]) {
            ctx.beginPath();
            ctx.arc(ex, ey, 1.6, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

        // Freshly laid webs fade in from the spider outward.
        this.webs.forEach(web => {
            const opacity = Math.max(0.15, web.life / 10);
            ctx.save();
            ctx.shadowBlur = 6;
            ctx.shadowColor = "#cfe6ff";
            ctx.strokeStyle = `rgba(225, 242, 255, ${opacity})`;
            ctx.lineWidth = 1.2;
            for (let i = 0; i < 8; i++) {
                const angle = (i / 8) * Math.PI * 2;
                ctx.beginPath();
                ctx.moveTo(web.x, web.y);
                ctx.lineTo(web.x + Math.cos(angle) * web.radius, web.y + Math.sin(angle) * web.radius);
                ctx.stroke();
            }
            // Sagging silk between spokes.
            ctx.strokeStyle = `rgba(190, 220, 255, ${opacity * 0.85})`;
            for (let r = 12; r <= web.radius; r += 10) {
                ctx.beginPath();
                for (let i = 0; i <= 8; i++) {
                    const a0 = (i / 8) * Math.PI * 2;
                    const a1 = ((i + 1) / 8) * Math.PI * 2;
                    const x0 = web.x + Math.cos(a0) * r;
                    const y0 = web.y + Math.sin(a0) * r;
                    const am = (a0 + a1) / 2;
                    const sag = r * 0.88;
                    if (i === 0) ctx.moveTo(x0, y0);
                    ctx.quadraticCurveTo(web.x + Math.cos(am) * sag, web.y + Math.sin(am) * sag, web.x + Math.cos(a1) * r, web.y + Math.sin(a1) * r);
                }
                ctx.stroke();
            }
            const hub = ctx.createRadialGradient(web.x, web.y, 0, web.x, web.y, 9);
            hub.addColorStop(0, `rgba(255, 255, 255, ${opacity * 0.6})`);
            hub.addColorStop(1, "rgba(255, 255, 255, 0)");
            ctx.fillStyle = hub;
            ctx.beginPath();
            ctx.arc(web.x, web.y, 9, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });
    }
}
