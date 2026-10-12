import { expandingRing, TAU } from "./Fx.js";

// Performance mode thins every burst and lowers the live particle cap.
const PERFORMANCE_DENSITY = 0.4;
const PERFORMANCE_MAX_PARTICLES = 300;
const DEFAULT_MAX_PARTICLES = 900;

function pushParticle(system, particle) {
    // Hard cap keeps long stalemate fights from degrading the frame rate.
    if (system.particles.length > system.maxParticles) system.particles.shift();
    system.particles.push(particle);
}

export class ParticleSystem {
    constructor({ performanceMode = false } = {}) {
        this.particles = [];
        this.rings = [];
        this.densityScale = performanceMode ? PERFORMANCE_DENSITY : 1;
        this.maxParticles = performanceMode ? PERFORMANCE_MAX_PARTICLES : DEFAULT_MAX_PARTICLES;
    }

    // Velocity is px/second, so particles behave identically at 1x/2x/3x speed.
    emit(x, y, color, count = 15, options = {}) {
        const { speed = 320, spread = TAU, angle = 0, life = 1, size = 3.2, gravity = 0 } = options;
        const total = count > 0 ? Math.max(1, Math.round(count * this.densityScale)) : 0;
        for (let i = 0; i < total; i++) {
            const dir = angle + (Math.random() - 0.5) * spread;
            const magnitude = speed * (0.35 + Math.random() * 0.65);
            pushParticle(this, {
                x, y,
                vx: Math.cos(dir) * magnitude,
                vy: Math.sin(dir) * magnitude,
                life: life * (0.6 + Math.random() * 0.6),
                maxLife: life,
                color,
                size: size * (0.5 + Math.random()),
                gravity
            });
        }
    }

    // Bright, fast spray plus a shock ring - the standard weapon-impact look.
    emitImpact(x, y, color, count = 18, options = {}) {
        this.emit(x, y, color, count, { speed: 420, size: 3, ...options });
        this.ring(x, y, color, { startRadius: 6, endRadius: 46, life: 0.34, lineWidth: 3 });
    }

    ring(x, y, color, options = {}) {
        const { startRadius = 8, endRadius = 60, life = 0.45, lineWidth = 3, alpha = 0.9 } = options;
        this.rings.push({ x, y, color, startRadius, endRadius, life, maxLife: life, lineWidth, alpha });
    }

    update(dt) {
        this.particles.forEach(p => {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += (p.gravity || 0) * dt;
            p.vx *= 0.965;
            p.vy *= 0.965;
            p.life -= dt;
        });
        this.particles = this.particles.filter(p => p.life > 0);

        this.rings.forEach(ring => { ring.life -= dt; });
        this.rings = this.rings.filter(ring => ring.life > 0);
    }

    draw(ctx) {
        this.particles.forEach(p => {
            const alpha = Math.max(0, Math.min(1, p.life / (p.maxLife || 1)));
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            ctx.shadowBlur = 6;
            ctx.shadowColor = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * (0.4 + alpha * 0.6), 0, TAU);
            ctx.fill();
        });

        this.rings.forEach(ring => {
            const progress = 1 - ring.life / ring.maxLife;
            expandingRing(ctx, ring.x, ring.y, progress, ring.startRadius, ring.endRadius, ring.color, {
                alpha: ring.alpha,
                lineWidth: ring.lineWidth
            });
        });

        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
    }

    clear() {
        this.particles = [];
        this.rings = [];
    }
}
