import { TAU } from "./Fx.js";

// Room beyond the body for weapons and appendages that stick out past the radius.
const SAMPLE_PADDING = 90;
const OPAQUE_ALPHA = 200;
// Pixels are lifted slightly toward white so dark rim pixels still read on the dark arena.
const LIFT_TOWARD_WHITE = 0.15;

let scratchCanvas = null;

const liftChannel = channel => Math.round(channel + (255 - channel) * LIFT_TOWARD_WHITE);

// Takes up to `count` distinct random entries from `indices` without replacement.
function takeRandom(indices, count) {
    const pool = indices.slice();
    const taken = [];
    while (taken.length < count && pool.length > 0) {
        const pick = Math.floor(Math.random() * pool.length);
        taken.push(pool[pick]);
        pool[pick] = pool[pool.length - 1];
        pool.pop();
    }
    return taken;
}

function pickTargets(data, size, half, maxCount) {
    const isOpaque = (x, y) => x >= 0 && y >= 0 && x < size && y < size && data[(y * size + x) * 4 + 3] >= OPAQUE_ALPHA;
    const edges = [];
    const interior = [];
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if (!isOpaque(x, y)) continue;
            const onEdge = !isOpaque(x - 1, y) || !isOpaque(x + 1, y) || !isOpaque(x, y - 1) || !isOpaque(x, y + 1);
            (onEdge ? edges : interior).push(y * size + x);
        }
    }
    // Outline pixels come first so the silhouette always forms; interior details fill in with what is left.
    const chosen = takeRandom(edges, maxCount);
    chosen.push(...takeRandom(interior, maxCount - chosen.length));
    return chosen.map(index => {
        const i = index * 4;
        return {
            x: (index % size) + 0.5 - half,
            y: Math.floor(index / size) + 0.5 - half,
            color: `rgb(${liftChannel(data[i])}, ${liftChannel(data[i + 1])}, ${liftChannel(data[i + 2])})`
        };
    });
}

// Draws the fighter as the arena does (body, weapons, then its ring and core) onto an
// offscreen canvas and returns the opaque pixels as points relative to its centre.
// Returns null when no canvas is available, so callers can fall back to a plain disc.
export function sampleFighterTargets(fighter, maxCount) {
    if (typeof document === "undefined" || typeof fighter.draw !== "function") return null;
    try {
        const half = Math.ceil((fighter.radius || 10) + SAMPLE_PADDING);
        const size = half * 2;
        if (!scratchCanvas) scratchCanvas = document.createElement("canvas");
        scratchCanvas.width = size;
        scratchCanvas.height = size;
        const ctx = scratchCanvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return null;

        // Shift the canvas so the fighter's live position lands in the centre without mutating it.
        ctx.setTransform(1, 0, 0, 1, half - fighter.x, half - fighter.y);
        fighter.draw(ctx, 0);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        ctx.strokeStyle = fighter.color;
        ctx.fillStyle = fighter.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(fighter.x, fighter.y, (fighter.radius || 10) + 4, 0, TAU);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(fighter.x, fighter.y, 2.5, 0, TAU);
        ctx.fill();

        const { data } = ctx.getImageData(0, 0, size, size);
        return pickTargets(data, size, half, maxCount);
    } catch {
        return null;
    }
}
