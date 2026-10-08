import { FighterBase } from "../FighterBase.js";
import { EffectSystem } from "../../systems/EffectSystem.js";
import { DamageSystem } from "../../systems/DamageSystem.js";

export class Snake extends FighterBase {
    constructor(data, x, y) {
        super(data, x, y);
        this.trail = []; // Array of {x, y, age}
        this.trailLife = 15;
        this.dropTimer = 0;
        this.trailHitCooldown = 0;
        this.dotAccumulator = 0;
        this.hitColor = "#9dff6b";
    }

    update(dt, opponent) {
        super.update(dt, opponent);
        if (this.trailHitCooldown > 0) this.trailHitCooldown -= dt;

        // Drop trail nodes on a fixed cadence so the venom line looks continuous
        // and matches the fighter's actual path. Timestamps use game time, not wall
        // clock, so they respect 1x/2x/3x speed and never stretch under load.
        this.dropTimer -= dt;
        if (this.dropTimer <= 0) {
            this.trail.push({ x: this.x, y: this.y, age: 0 });
            this.dropTimer = 0.03;
        }
        this.trail.forEach(segment => { segment.age += dt; });
        this.trail = this.trail.filter(segment => segment.age < this.trailLife);

        // Trail collision logic - slow 50% and deal 6 damage per second.
        // A trail is something anyone can run into, so every living fighter is
        // tested, not just the single opponent reference handed over by the arena.
        // The DOT accumulator is per victim as well: sharing one between them made
        // the tick rate depend on how many fighters happened to be standing in the
        // venom at once.
        const walkers = (this.victims?.length ? this.victims : [opponent]).filter(f => f && !f.isDead);
        if (walkers.length) {
            for (const victim of walkers) {
                const touching = this.trail.some(segment => Math.hypot(segment.x - victim.x, segment.y - victim.y) < victim.radius + 8);
                if (!touching) continue;
                EffectSystem.addEffect(victim, { name: "trail-slow", duration: 0.4, multiplier: 0.5 });
                victim.slowVisual = true;
                this.dotAccumulator += dt;
                if (this.dotAccumulator >= 0.5) {
                    this.dotAccumulator = 0;
                    DamageSystem.applyDamage(this, victim, 3, "AOE", { ignoreCooldown: true });
                }
            }
        }
    }

    draw(ctx) {
        if (this.isDead || this.health <= 0) return;
        // Draw trail with gradient and effects
        if (this.trail.length > 1) {
            ctx.save();
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.shadowBlur = 14;
            ctx.shadowColor = "#39ff6a";
            // Toxic slick: wide glowing base with a bright narrow core.
            for (let i = 0; i < this.trail.length - 1; i++) {
                const segment1 = this.trail[i];
                const segment2 = this.trail[i + 1];
                const progress = i / this.trail.length;

                ctx.strokeStyle = `rgba(20, 190, 60, ${progress * 0.4})`;
                ctx.lineWidth = 28 * (1 - progress);
                ctx.beginPath();
                ctx.moveTo(segment1.x, segment1.y);
                ctx.lineTo(segment2.x, segment2.y);
                ctx.stroke();

                ctx.strokeStyle = `rgba(150, 255, 150, ${progress * 0.35})`;
                ctx.lineWidth = 8 * (1 - progress);
                ctx.stroke();
            }
            ctx.shadowBlur = 0;

            // Poison bubbles along the trail
            for (let i = 0; i < this.trail.length; i += 3) {
                const segment = this.trail[i];
                ctx.fillStyle = "rgba(120, 255, 120, 0.35)";
                ctx.beginPath();
                ctx.arc(segment.x, segment.y, 3 + (i % 5) * 0.6, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }

        // Draw a compact snake body with a short scaly tail
        ctx.save();
        ctx.translate(this.x, this.y);

        const facingX = Math.cos(this.lastAngle);
        const facingY = Math.sin(this.lastAngle);
        const sideX = -facingY;
        const sideY = facingX;

        // Tail segments taper away from the head
        for (let i = 3; i >= 1; i--) {
            const tailX = -facingX * (this.radius * 0.45 + i * 7);
            const tailY = -facingY * (this.radius * 0.45 + i * 7);
            const tailRadius = Math.max(3, this.radius * 0.58 - i * 2);
            ctx.fillStyle = i % 2 === 0 ? "#176b35" : "#258f45";
            ctx.beginPath();
            ctx.arc(tailX, tailY, tailRadius, 0, Math.PI * 2);
            ctx.fill();
        }

        // Scaly body
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fill();

        // Overlapping scale rows
        for (let row = -1; row <= 1; row++) {
            for (let column = -2; column <= 2; column++) {
                const scaleX = sideX * row * 7 + facingX * (column * 6 - 2);
                const scaleY = sideY * row * 7 + facingY * (column * 6 - 2);
                ctx.strokeStyle = "rgba(190, 255, 160, 0.65)";
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(scaleX, scaleY, 4, 0.15, Math.PI - 0.15);
                ctx.stroke();
            }
        }

        // Snake head facing its current direction
        ctx.fillStyle = "#49b85d";
        ctx.beginPath();
        ctx.moveTo(facingX * (this.radius + 3), facingY * (this.radius + 3));
        ctx.lineTo(-facingX * this.radius + sideX * this.radius * 0.85, -facingY * this.radius + sideY * this.radius * 0.85);
        ctx.lineTo(-facingX * this.radius - sideX * this.radius * 0.85, -facingY * this.radius - sideY * this.radius * 0.85);
        ctx.closePath();
        ctx.fill();

        // Snake eyes
        ctx.fillStyle = "#FFFF00";
        ctx.beginPath();
        ctx.arc(facingX * this.radius * 0.55 + sideX * 4, facingY * this.radius * 0.55 + sideY * 4, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(facingX * this.radius * 0.55 - sideX * 4, facingY * this.radius * 0.55 - sideY * 4, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Forked tongue
        ctx.strokeStyle = "#FF1493";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(facingX * this.radius, facingY * this.radius);
        ctx.lineTo(facingX * (this.radius + 8) + sideX * 5, facingY * (this.radius + 8) + sideY * 5);
        ctx.moveTo(facingX * this.radius, facingY * this.radius);
        ctx.lineTo(facingX * (this.radius + 8) - sideX * 5, facingY * (this.radius + 8) - sideY * 5);
        ctx.stroke();
        
        ctx.restore();
    }
}
