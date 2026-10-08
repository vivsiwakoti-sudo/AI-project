// Per-fighter body silhouettes.
//
// Every fighter used to be the same plain circle, so the only way to tell two
// classes apart was their weapon. Each class now declares a `shape` in
// fighterDefinitions.js and this module traces that outline in body-local
// space (origin at the centre, radius = the fighter's collision radius).
//
// A shape is described as a list of points on a -1..1 "unit" disc. Fighters
// with an orientation (a pointed nose, a leaning blade) use `aim: true` so the
// caller can rotate the outline toward the direction it is facing.

const TAU = Math.PI * 2;

function polygon(sides, { phase = -Math.PI / 2, inner = 1, spread = TAU } = {}) {
    const points = [];
    for (let i = 0; i < sides; i++) {
        const angle = phase + (i / sides) * spread;
        const r = i % 2 === 0 ? 1 : inner;
        points.push([Math.cos(angle) * r, Math.sin(angle) * r]);
    }
    return points;
}

function star(points, inner) {
    return polygon(points * 2, { inner, spread: TAU });
}

function arc(cx, cy, r, from, to, steps = 12) {
    const out = [];
    for (let i = 0; i <= steps; i++) {
        const a = from + ((to - from) * i) / steps;
        out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    return out;
}

// Each entry: { points | path, aim, spin }. `path` lets a shape combine several
// closed loops (sub-paths) instead of a single outline.
const SHAPES = {
    // Ice Sword - sharp faceted crystal that points where it swings.
    diamond: { aim: true, points: [[1, 0], [0.2, 0.85], [-0.55, 0], [0.2, -0.85]] },
    // Snake - a coiled crescent moon with a snake's head leading.
    crescent: {
        points: [
            ...arc(0.15, 0, 1, Math.PI * 0.42, -Math.PI * 0.42, 10),
            ...arc(0.05, 0, 0.55, -Math.PI * 0.42, Math.PI * 0.42, 8).reverse()
        ]
    },
    // Ninja - four-pointed throwing star, spinning.
    shuriken: { spin: true, points: star(4, 0.34) },
    // Spearman - weighted teardrop that leans into its thrust.
    teardrop: { aim: true, points: [[1.1, 0], [0.25, 0.7], [-0.85, 0.55], [-0.9, -0.55], [0.25, -0.7]] },
    // Gunner - armoured hexagon turret.
    hexagon: { points: polygon(6, { phase: 0 }) },
    // Samurai - topknot and helmet brim read as a crown.
    crown: { points: [[1, 0], [0.5, 0.75], [0.15, 0.5], [-0.4, 0.95], [-0.4, -0.95], [0.15, -0.5], [0.5, -0.75]] },
    // Grappler - muscular eight-sided bulk.
    octagon: { points: polygon(8) },
    // Mine Layer - spiky naval mine.
    spiked: { spin: true, points: star(8, 0.62) },
    // Fireball - licking flame with a trailing tail.
    flame: {
        aim: true,
        points: [
            [1.25, 0], [0.55, 0.5], [-0.25, 0.8], [-1.15, 0.45],
            [-0.6, 0], [-1.15, -0.45], [-0.25, -0.8], [0.55, -0.5]
        ]
    },
    // Duplicator - lumpy splitting blob, wobbling.
    blob: {
        path: [
            [...arc(0.35, 0.15, 0.75, 0, TAU, 12)],
            [...arc(-0.5, -0.45, 0.4, 0, TAU, 10)],
            [...arc(-0.45, 0.55, 0.34, 0, TAU, 10)]
        ]
    },
    // Ghost - classic sheet spectre with a wavy hem.
    wisp: {
        points: [
            [0, -1], [0.75, -0.55], [0.95, 0.25],
            [0.55, 0.9], [0.15, 0.55], [-0.15, 0.9], [-0.55, 0.55],
            [-0.95, 0.85], [-0.9, -0.1], [-0.6, -0.7]
        ]
    },
    // Alchemist - round-bottomed flask with a stopper neck.
    flask: {
        points: [
            [0.28, -1.1], [0.28, -0.45], [0.95, 0.45], [0.8, 1], [-0.8, 1],
            [-0.95, 0.45], [-0.28, -0.45], [-0.28, -1.1]
        ]
    },
    // Assassin - sleek forward-pointing blade silhouette.
    triangle: { aim: true, points: [[1.25, 0], [-0.7, 0.85], [-0.7, -0.85]] },
    // Mutant - irregular amoeba with a bulge and a tendril.
    amoeba: {
        path: [
            [
                [1.05, 0], [0.7, 0.75], [0.15, 0.6], [-0.2, 1.05], [-0.85, 0.6],
                [-0.7, -0.55], [-0.1, -0.95], [0.6, -0.75]
            ],
            [[1.15, -0.35], [1.55, -0.65], [1.2, -0.8]]
        ]
    },
    // Knight - heater shield with a flat top and a pointed base.
    shield: {
        points: [
            [0.9, -0.95], [0.95, 0.35], [0.55, 0.95], [0, 1.15],
            [-0.55, 0.95], [-0.95, 0.35], [-0.9, -0.95]
        ]
    },
    // Solar Beam - radiant eight-pointed sun.
    star: { spin: true, points: star(8, 0.5) },
    // Berserker - jagged barbed outline bristling outward.
    barbed: { spin: true, points: star(10, 0.68) },
    round: { points: polygon(24, { inner: 1 }) },
    // Tunneler - drill cone with a threaded shaft.
    drill: { aim: true, points: [[1.3, 0], [0.15, 0.8], [-1, 0.62], [-1, -0.62], [0.15, -0.8]] },
    // Tornado - swirling vortex bands.
    vortex: {
        points: [
            [1, 0], [0.3, 0.35], [0.85, 0.5], [0.15, 0.85], [0.6, 0.95],
            [-0.35, 1.05], [-0.9, 0.6], [-0.35, 0.25], [-1, -0.1],
            [-0.3, -0.55], [-0.95, -0.75], [-0.25, -1.05], [0.6, -0.8], [0.85, -0.4]
        ]
    },
    // Meteor - cratered rock with a fiery rip across it.
    meteor: {
        path: [
            [
                [1, 0], [0.72, 0.7], [0.1, 0.98], [-0.62, 0.72], [-1, 0.05],
                [-0.72, -0.68], [-0.05, -0.98], [0.65, -0.75]
            ],
            [[0.35, 0.42], [0.62, 0.2], [0.4, 0.02], [0.14, 0.24]],
            [[-0.5, -0.28], [-0.22, -0.5], [-0.4, -0.64], [-0.66, -0.42]]
        ]
    },
    // Black Hole - a dark core with a bright accretion rim.
    void: {
        path: [
            [...arc(0, 0, 0.62, 0, TAU, 20)],
            [...arc(0, 0, 1.06, 0, TAU, 20)]
        ]
    },
    // Reaper - skull with eye sockets, a jaw and a narrow chin.
    skull: {
        path: [
            [...arc(0, -0.12, 0.9, Math.PI * 0.92, Math.PI * 0.08, 12)],
            [[0.34, 0.62], [0.42, 1.05], [0.1, 1.2], [-0.1, 1.2], [-0.42, 1.05], [-0.34, 0.62]],
            [...arc(-0.33, -0.18, 0.22, 0, TAU, 8)],
            [...arc(0.33, -0.18, 0.22, 0, TAU, 8)]
        ]
    },
    // Vampire - a cape stretched into two winged tips.
    bat: {
        aim: true,
        points: [
            [0.95, 0], [0.55, 0.55], [1.35, 1.05], [0.2, 0.95],
            [-0.35, 1.15], [-0.85, 0.5], [-0.6, 0], [-0.85, -0.5],
            [-0.35, -1.15], [0.2, -0.95], [1.35, -1.05], [0.55, -0.55]
        ]
    },
    // Mahoraga - the wheel: four spoked blades orbiting a hub.
    wheel: {
        spin: true,
        path: [
            [...arc(0, 0, 0.95, 0, TAU, 24)],
            [[0.95, -0.16], [0.95, 0.16], [-0.95, 0.16], [-0.95, -0.16]],
            [[-0.16, 0.95], [0.16, 0.95], [0.16, -0.95], [-0.16, -0.95]],
            [...arc(0, 0, 0.3, 0, TAU, 12)]
        ]
    }
};

export function traceShape(ctx, radius, shape, { angle = 0, spinAngle = 0 } = {}) {
    const def = SHAPES[shape] || SHAPES.round;
    ctx.save();
    ctx.scale(radius, radius);
    // Orientation: aim toward `angle` (body-local, so 0 = facing +x), and add
    // any continuous spin for shapes flagged as spinning.
    const rotation = (def.aim ? angle : 0) + (def.spin ? spinAngle : 0);
    if (rotation) ctx.rotate(rotation);

    const loops = def.path ? def.path : [def.points];
    for (const loop of loops) {
        ctx.beginPath();
        loop.forEach(([px, py], i) => {
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        });
        ctx.closePath();
    }
    ctx.restore();
}

export function hasShape(shape) {
    return Boolean(SHAPES[shape]);
}

export { TAU };