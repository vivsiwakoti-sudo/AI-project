import { TAU } from "./Fx.js";
import { graphicsProfile } from "../graphics.js";
import { sampleFighterTargets } from "./FighterSilhouette.js";

const ASSEMBLY_SECONDS = 1.6;
const FADE_SECONDS = 0.35;
const EDGE_INSET = 20;
const MIN_PARTICLES = 24;
const MAX_DISC_PARTICLES = 110;
const MAX_SILHOUETTE_PARTICLES = 300;

const clamp01 = value => Math.max(0, Math.min(1, value));
const easeOutCubic = progress => 1 - (1 - progress) ** 3;

function parseHex(color) {
    const match = /^#([0-9a-f]{6})$/i.exec(color || "");
    if (!match) return null;
    const value = parseInt(match[1], 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

// Positive amounts blend toward white and negative amounts toward black, so every
// particle reads as a lighter or darker shade of its fighter's body color.
function shadeColor(color, amount) {
    const rgb = parseHex(color);
    if (!rgb) return color;
    const [r, g, b] = rgb.map(channel => Math.round(amount >= 0
        ? channel + (255 - channel) * amount
        : channel * (1 + amount)));
    return `rgb(${r}, ${g}, ${b})`;
}

// Fallback target set when the fighter cannot be rendered: a filled disc around its centre.
function discTargets(fighter, densityScale) {
    const radius = Math.max(4, fighter.radius || 10);
    const count = Math.max(MIN_PARTICLES, Math.min(MAX_DISC_PARTICLES, Math.round(radius * radius * 0.4 * densityScale)));
    return Array.from({ length: count }, () => {
        const targetAngle = Math.random() * TAU;
        // sqrt keeps settled particles evenly spread across the disc rather than bunched at the centre.
        const targetDistance = radius * 0.9 * Math.sqrt(Math.random());
        return {
            x: Math.cos(targetAngle) * targetDistance,
            y: Math.sin(targetAngle) * targetDistance,
            color: shadeColor(fighter.color, -0.2 + Math.random() * 0.45)
        };
    });
}

// Particles drift in from around each fighter and settle onto its body, arriving
// at staggered times so the body reads as forming rather than popping in.
// Positions are pure functions of elapsed time, so the sequence is repeatable and
// the countdown can drive it with any frame rate.
export function createFighterAssembly(fighters, { arenaSize, graphicsQuality, duration = ASSEMBLY_SECONDS, sampleTargets = sampleFighterTargets } = {}) {
    const densityScale = graphicsProfile(graphicsQuality).particleDensity;
    const maxTargets = Math.max(MIN_PARTICLES, Math.round(MAX_SILHOUETTE_PARTICLES * densityScale));
    const assembling = new Set();
    const particles = [];
    let elapsed = 0;

    fighters.forEach(fighter => {
        if (!fighter) return;
        assembling.add(fighter);
        const sampled = sampleTargets(fighter, maxTargets);
        const targets = sampled?.length ? sampled : discTargets(fighter, densityScale);
        const radius = Math.max(4, fighter.radius || 10);
        targets.forEach(target => {
            const travel = duration * (0.5 + Math.random() * 0.35);
            const delay = Math.random() * (duration - travel);
            const startAngle = Math.random() * TAU;
            const startDistance = radius + 60 + Math.random() * 90;
            const startX = Math.cos(startAngle) * startDistance;
            const startY = Math.sin(startAngle) * startDistance;
            const swirlDirection = Math.random() < 0.5 ? -1 : 1;
            particles.push({
                fighter,
                startX,
                startY,
                targetX: target.x,
                targetY: target.y,
                // Unit vector perpendicular to the approach, used to curl the path inward.
                perpX: -startY / startDistance,
                perpY: startX / startDistance,
                swirl: swirlDirection * (20 + Math.random() * 40),
                delay,
                travel,
                size: 1.3 + Math.random() * 0.9,
                color: target.color
            });
        });
    });

    const isComplete = () => elapsed >= duration + FADE_SECONDS;

    const inBounds = value => Math.max(EDGE_INSET, Math.min((arenaSize ?? Infinity) - EDGE_INSET, value));

    // Visible particles at a given assembly time, with positions and alpha.
    const sample = time => {
        const points = [];
        particles.forEach(p => {
            if (time < p.delay) return;
            const progress = clamp01((time - p.delay) / p.travel);
            const eased = easeOutCubic(progress);
            const curl = Math.sin(progress * Math.PI) * p.swirl * (1 - progress);
            const fighter = p.fighter;
            const x = inBounds(fighter.x + p.startX + (p.targetX - p.startX) * eased + p.perpX * curl);
            const y = inBounds(fighter.y + p.startY + (p.targetY - p.startY) * eased + p.perpY * curl);
            let alpha = clamp01((time - p.delay) / (p.travel * 0.2));
            if (time > duration) alpha *= 1 - (time - duration) / FADE_SECONDS;
            if (alpha <= 0) return;
            points.push({ x, y, size: p.size, color: p.color, alpha });
        });
        return points;
    };

    return {
        advance(dt) {
            elapsed += dt;
        },
        hidesFighter(fighter) {
            return elapsed < duration && assembling.has(fighter);
        },
        isComplete,
        sample,
        draw(ctx) {
            if (isComplete()) return;
            const points = sample(elapsed);
            ctx.save();
            ctx.globalCompositeOperation = "source-over";
            ctx.shadowBlur = 0;
            points.forEach(point => {
                ctx.globalAlpha = point.alpha;
                ctx.fillStyle = point.color;
                ctx.beginPath();
                ctx.arc(point.x, point.y, point.size, 0, TAU);
                ctx.fill();
            });
            ctx.restore();
        }
    };
}
