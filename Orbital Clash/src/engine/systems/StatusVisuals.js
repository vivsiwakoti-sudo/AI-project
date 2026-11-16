// Status visuals: the overlay each active status draws around its fighter, the
// burst and sound that announce it, and a row of icons above the body.
//
// Statuses are read from the fighter's live state every frame rather than from the
// systems that apply them, so any class that sets a stun flag or adds a named effect
// gets the matching visual with no extra wiring.

import { EffectSystem } from "./EffectSystem.js";
import { expandingRing, motionTrail, TAU } from "./Fx.js";
import { audioManager } from "../audio/AudioManager.js";

export const STATUS_COLORS = {
    stun: "#ffd84a",
    freeze: "#7ef0ff",
    burn: "#ff8a1f",
    poison: "#b65cff",
    boost: "#ff5fd2",
    percent: "#ff3b4e",
    heal: "#46e6a0"
};

// Momentum boost keeps a longer streak than ordinary movement (8 samples).
export const BOOST_TRAIL_POINTS = 18;
// Instant effects (heal, percent) stay on the icon row for this long.
const EVENT_SECONDS = 0.8;
const RING_SECONDS = 0.6;
const HEAL_RING_DELAY = 0.18;
const EMBER_INTERVAL = 0.12;
const ICON_ORDER = ["stun", "freeze", "burn", "poison", "boost", "percent", "heal"];
const ICON_SPACING = 22;
const ICON_RADIUS = 8;

const ONSET_BURST = {
    stun: { color: "#ffd84a", count: 10, speed: 260 },
    freeze: { color: "#d8fbff", count: 12, speed: 180 },
    burn: { color: "#ff8a1f", count: 12, speed: 200 },
    poison: { color: "#b65cff", count: 10, speed: 120 },
    boost: { color: "#ff5fd2", count: 14, speed: 320 }
};

const ONSET_SOUND = {
    stun: () => audioManager.playStunSfx(),
    freeze: () => audioManager.playFreezeSfx(),
    burn: () => audioManager.playBurnSfx(),
    poison: () => audioManager.playPoisonSfx(),
    boost: () => audioManager.playBoostSfx()
};

const EVENT_SOUND = {
    percent: () => audioManager.playPercentSfx(),
    heal: () => audioManager.playHealSfx()
};

const states = new WeakMap();

function stateOf(fighter) {
    let state = states.get(fighter);
    if (!state) {
        state = { clock: 0, active: new Map(), events: [], emberTimer: 0 };
        states.set(fighter, state);
    }
    return state;
}

function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}

function stunRemaining(fighter) {
    const timers = [EffectSystem.get(fighter, "stun")?.duration, fighter.stunTimer, fighter.pinTimer]
        .filter(v => Number.isFinite(v) && v > 0);
    return timers.length ? Math.max(...timers) : null;
}

// Every status this fighter has right now. `remaining` is seconds left, or null when
// the source set no timer. `stacks` only goes above 1 for burn.
function readStatuses(fighter) {
    const found = new Map();
    const timed = name => EffectSystem.get(fighter, name)?.duration ?? null;
    if (fighter.isStunned || fighter.isPinned || EffectSystem.has(fighter, "stun")) {
        found.set("stun", { remaining: stunRemaining(fighter), stacks: 1 });
    }
    if (fighter.isFrozen) found.set("freeze", { remaining: timed("freeze"), stacks: 1 });
    const burns = (fighter.statusEffects || []).filter(e => e.name.startsWith("burn-") || e.name === "fire");
    if (burns.length) {
        found.set("burn", { remaining: Math.max(...burns.map(e => e.duration)), stacks: burns.length });
    }
    if (EffectSystem.has(fighter, "poison")) found.set("poison", { remaining: timed("poison"), stacks: 1 });
    if (EffectSystem.has(fighter, "MomentumBoost")) found.set("boost", { remaining: timed("MomentumBoost"), stacks: 1 });
    return found;
}

function emitEmbers(fighter, count) {
    const system = fighter.particleSystem;
    if (!system) return;
    for (let i = 0; i < count; i++) {
        // Embers rise from the lower half of the body, where the flames sit.
        const a = Math.PI * (0.1 + Math.random() * 0.8);
        const r = fighter.radius * (0.7 + Math.random() * 0.3);
        system.emit(
            fighter.x + Math.cos(a) * r,
            fighter.y + Math.sin(a) * r,
            Math.random() < 0.5 ? "#ffb347" : "#ff6a1a",
            1,
            { angle: -Math.PI / 2, spread: 1.3, speed: 70, size: 2.2, life: 0.7 }
        );
    }
}

function announceOnset(fighter, name) {
    const burst = ONSET_BURST[name];
    if (burst) fighter.particleSystem?.emit(fighter.x, fighter.y, burst.color, burst.count, { speed: burst.speed, size: 2.6, life: 0.6 });
    ONSET_SOUND[name]?.();
}

// Advances this fighter's status clock, announces statuses that just started, and
// keeps burning fighters shedding embers. Returns the names that started this frame.
export function updateStatusVisuals(fighter, dt) {
    const state = stateOf(fighter);
    state.clock += dt;
    state.events = state.events.filter(e => state.clock - e.at < EVENT_SECONDS);

    const now = readStatuses(fighter);
    for (const name of Array.from(state.active.keys())) {
        if (!now.has(name)) state.active.delete(name);
    }

    const onsets = [];
    for (const [name, status] of now) {
        let entry = state.active.get(name);
        if (!entry) {
            entry = { total: 0, remaining: null, stacks: 0 };
            state.active.set(name, entry);
            onsets.push(name);
            announceOnset(fighter, name);
        } else if (status.stacks > entry.stacks) {
            emitEmbers(fighter, 4);
            ONSET_SOUND[name]?.();
        }
        entry.remaining = status.remaining;
        entry.total = Math.max(entry.total, status.remaining ?? 0);
        entry.stacks = status.stacks;
    }

    if (now.has("burn")) {
        state.emberTimer -= dt;
        if (state.emberTimer <= 0) {
            state.emberTimer = EMBER_INTERVAL;
            emitEmbers(fighter, 1);
        }
    }
    return onsets;
}

// Instant effects (a heal, a percent blast) leave no lasting status, so they are
// recorded for a short icon flash and a ring, and play their own cue.
export function notifyStatusEvent(fighter, kind) {
    const state = stateOf(fighter);
    state.events.push({ kind, at: state.clock });
    EVENT_SOUND[kind]?.();
}

// The badges shown above a fighter, in a fixed order. `fraction` is the share of a
// timed status still left, or null when there is no duration to show.
export function activeStatusIcons(fighter) {
    const state = stateOf(fighter);
    const icons = [];
    for (const name of ICON_ORDER) {
        const entry = state.active.get(name);
        if (entry) {
            const fraction = entry.total > 0 && entry.remaining != null ? clamp01(entry.remaining / entry.total) : null;
            icons.push({ name, fraction, stacks: entry.stacks, fade: 1 });
            continue;
        }
        const latest = state.events.filter(e => e.kind === name && state.clock - e.at < EVENT_SECONDS).pop();
        if (latest) {
            icons.push({ name, fraction: null, stacks: 1, fade: 1 - (state.clock - latest.at) / EVENT_SECONDS });
        }
    }
    return icons;
}

// Momentum boost's streak, drawn behind the body so the fighter stays readable.
export function drawStatusTrail(ctx, fighter) {
    if (!EffectSystem.has(fighter, "MomentumBoost")) return;
    motionTrail(ctx, fighter.trailPoints, STATUS_COLORS.boost, { lineWidth: fighter.radius * 1.9, alpha: 0.8, blur: 28 });
}

function starPath(ctx, x, y, outer, inner, rotation) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? outer : inner;
        const a = rotation + (i * Math.PI) / 5;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.closePath();
}

function drawStunStars(ctx, x, y, radius, t) {
    const cy = y - radius - 4;
    ctx.save();
    ctx.fillStyle = STATUS_COLORS.stun;
    ctx.shadowBlur = 8;
    ctx.shadowColor = STATUS_COLORS.stun;
    for (let i = 0; i < 3; i++) {
        const a = t * 4 + (i * TAU) / 3;
        // Stars behind the head (sin < 0) are dimmed so the orbit reads as depth.
        ctx.globalAlpha = Math.sin(a) >= 0 ? 1 : 0.5;
        starPath(ctx, x + Math.cos(a) * (radius + 6), cy + Math.sin(a) * 5, 4.5, 1.9, t * 5 + i);
        ctx.fill();
    }
    ctx.restore();
}

function drawFreezeOutline(ctx, x, y, radius, t) {
    const half = radius * 1.15 + 3;
    ctx.save();
    ctx.strokeStyle = STATUS_COLORS.freeze;
    ctx.lineWidth = 2;
    ctx.shadowBlur = 12;
    ctx.shadowColor = STATUS_COLORS.freeze;
    ctx.globalAlpha = 0.8 + 0.2 * Math.sin(t * 4);
    ctx.strokeRect(x - half, y - half, half * 2, half * 2);
    ctx.beginPath();
    for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        ctx.moveTo(x + dx * half, y + dy * half);
        ctx.lineTo(x + dx * (half + 5), y + dy * (half + 5));
    }
    ctx.stroke();
    ctx.restore();
}

// One flame tongue: a curved teardrop rising from `base` along `dir`, swaying sideways at the tip.
function flameTongue(ctx, base, dir, length, width, sway, color) {
    const px = -dir.y;
    const py = dir.x;
    const midX = base.x + dir.x * length * 0.5;
    const midY = base.y + dir.y * length * 0.5;
    const tipX = base.x + dir.x * length + px * sway;
    const tipY = base.y + dir.y * length + py * sway;
    ctx.beginPath();
    ctx.moveTo(base.x + px * width, base.y + py * width);
    ctx.quadraticCurveTo(midX + px * width * 1.4, midY + py * width * 1.4, tipX, tipY);
    ctx.quadraticCurveTo(midX - px * width * 1.4, midY - py * width * 1.4, base.x - px * width, base.y - py * width);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
}

function drawFlames(ctx, x, y, radius, t, stacks) {
    const count = 6;
    const scale = 1 + 0.15 * Math.min(stacks - 1, 3);
    ctx.save();
    ctx.shadowBlur = 10;
    ctx.shadowColor = STATUS_COLORS.burn;
    for (let i = 0; i < count; i++) {
        const a = Math.PI * (0.18 + (0.64 * i) / (count - 1));
        const dir = { x: Math.cos(a), y: Math.sin(a) };
        const base = { x: x + dir.x * radius * 0.85, y: y + dir.y * radius * 0.85 };
        const length = radius * (0.5 + 0.18 * Math.sin(t * 14 + i * 1.7)) * scale;
        const sway = radius * 0.12 * Math.sin(t * 9 + i);
        const width = radius * 0.2;
        flameTongue(ctx, base, dir, length, width, sway, STATUS_COLORS.burn);
        flameTongue(ctx, base, dir, length * 0.55, width * 0.5, sway * 0.5, "#ffe08a");
    }
    ctx.restore();
}

function drawBubbles(ctx, x, y, radius, t) {
    ctx.save();
    ctx.fillStyle = STATUS_COLORS.poison;
    ctx.shadowBlur = 8;
    ctx.shadowColor = STATUS_COLORS.poison;
    for (let i = 0; i < 5; i++) {
        const phase = (t * 0.6 + i / 5) % 1;
        const bx = x + Math.sin(i * 2.7 + t * 2.2) * radius * 0.7;
        const by = y + radius * 0.5 - phase * radius * 2.4;
        ctx.globalAlpha = 0.85 * Math.sin(phase * Math.PI);
        ctx.beginPath();
        ctx.arc(bx, by, 1.6 + 1.2 * (1 - phase), 0, TAU);
        ctx.fill();
    }
    ctx.restore();
}

function drawRing(ctx, x, y, radius, age, color, delay) {
    const p = (age - delay) / RING_SECONDS;
    if (p <= 0 || p >= 1) return;
    expandingRing(ctx, x, y, p, radius + 4, radius + 34, color, { lineWidth: 3 });
}

const GLYPHS = {
    stun: (ctx, x, y, color) => {
        ctx.fillStyle = color;
        starPath(ctx, x, y, 4.5, 2, -Math.PI / 2);
        ctx.fill();
    },
    freeze: (ctx, x, y, color) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
            const a = (i * Math.PI) / 3;
            ctx.moveTo(x + Math.cos(a) * 4.5, y + Math.sin(a) * 4.5);
            ctx.lineTo(x - Math.cos(a) * 4.5, y - Math.sin(a) * 4.5);
        }
        ctx.stroke();
    },
    burn: (ctx, x, y, color) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x, y - 5);
        ctx.quadraticCurveTo(x + 4.5, y - 0.5, x + 2.8, y + 3);
        ctx.quadraticCurveTo(x, y + 5.5, x - 2.8, y + 3);
        ctx.quadraticCurveTo(x - 4.5, y - 0.5, x, y - 5);
        ctx.fill();
    },
    poison: (ctx, x, y, color) => {
        ctx.fillStyle = color;
        for (const [dx, dy] of [[0, -2], [-2.5, 2], [2.5, 2]]) {
            ctx.beginPath();
            ctx.arc(x + dx, y + dy, 1.5, 0, TAU);
            ctx.fill();
        }
    },
    boost: (ctx, x, y, color) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (const ox of [-2.5, 1.5]) {
            ctx.moveTo(x + ox - 2, y - 3);
            ctx.lineTo(x + ox + 1.5, y);
            ctx.lineTo(x + ox - 2, y + 3);
        }
        ctx.stroke();
    },
    percent: (ctx, x, y, color) => {
        ctx.fillStyle = color;
        ctx.font = "bold 9px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("%", x, y + 0.5);
    },
    heal: (ctx, x, y, color) => {
        ctx.fillStyle = color;
        ctx.fillRect(x - 1, y - 4, 2, 8);
        ctx.fillRect(x - 4, y - 1, 8, 2);
    }
};

function drawIcon(ctx, cx, cy, icon) {
    const color = STATUS_COLORS[icon.name];
    ctx.save();
    ctx.globalAlpha = icon.fade;
    ctx.fillStyle = "rgba(12, 12, 20, 0.82)";
    ctx.beginPath();
    ctx.arc(cx, cy, ICON_RADIUS, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (icon.fraction !== null) {
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(cx, cy, ICON_RADIUS + 2.5, -Math.PI / 2, -Math.PI / 2 + TAU * icon.fraction);
        ctx.stroke();
    }
    GLYPHS[icon.name](ctx, cx, cy, color);
    if (icon.stacks > 1) {
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 9px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(`x${icon.stacks}`, cx, cy + ICON_RADIUS + 3);
    }
    ctx.restore();
}

// Draws every active status's overlay and the icon row. Called after the body is
// drawn, so the overlays sit on top of the fighter.
export function drawStatusVisuals(ctx, fighter) {
    const state = stateOf(fighter);
    const { x, y, radius } = fighter;
    const t = state.clock;

    if (state.active.has("stun")) drawStunStars(ctx, x, y, radius, t);
    if (state.active.has("freeze")) drawFreezeOutline(ctx, x, y, radius, t);
    const burn = state.active.get("burn");
    if (burn) drawFlames(ctx, x, y, radius, t, burn.stacks);
    if (state.active.has("poison")) drawBubbles(ctx, x, y, radius, t);

    for (const event of state.events) {
        const age = t - event.at;
        if (event.kind === "percent") drawRing(ctx, x, y, radius, age, STATUS_COLORS.percent, 0);
        if (event.kind === "heal") {
            drawRing(ctx, x, y, radius, age, STATUS_COLORS.heal, 0);
            drawRing(ctx, x, y, radius, age, STATUS_COLORS.heal, HEAL_RING_DELAY);
        }
    }

    const icons = activeStatusIcons(fighter);
    const rowY = y - radius - 22;
    const startX = x - ((icons.length - 1) * ICON_SPACING) / 2;
    icons.forEach((icon, i) => drawIcon(ctx, startX + i * ICON_SPACING, rowY, icon));
}
