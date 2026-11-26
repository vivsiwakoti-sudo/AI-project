// Simple decorative patterns painted inside each fighter's body outline.
//
// Painters draw in body-local unit space: the origin is the fighter's centre and
// the collision radius is 1. drawBodyPattern scales the context to the real radius,
// so a pattern grows and shrinks with its body. The caller clips to the body shape
// first, so painters may draw past the edge without spilling out.

const TAU = Math.PI * 2;

const fillPath = (ctx, color) => {
    ctx.fillStyle = color;
    ctx.fill();
};

const strokePath = (ctx, color, width) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
};

const trace = (ctx, points, closed = true) => {
    ctx.beginPath();
    points.forEach(([x, y], i) => {
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    if (closed) ctx.closePath();
};

// Base wash over the whole body so the design covers the full silhouette.
const tint = (ctx, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(-1.2, -1.2, 2.4, 2.4);
};

const dot = (ctx, x, y, r, color) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    fillPath(ctx, color);
};

const glow = (ctx, x, y, r, inner, outer) => {
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, inner);
    grad.addColorStop(1, outer);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
};

const hexPoints = (cx, cy, r) => Array.from({ length: 6 }, (_, k) => [
    cx + Math.cos((k * Math.PI) / 3) * r,
    cy + Math.sin((k * Math.PI) / 3) * r
]);

const diamondPoints = (cx, cy, halfWidth, halfHeight) => [
    [cx, cy - halfHeight],
    [cx + halfWidth, cy],
    [cx, cy + halfHeight],
    [cx - halfWidth, cy]
];

const chamferPlate = (ctx, x, y, halfW, halfH, cut) => trace(ctx, [
    [x - halfW + cut, y - halfH],
    [x + halfW - cut, y - halfH],
    [x + halfW, y - halfH + cut],
    [x + halfW, y + halfH - cut],
    [x + halfW - cut, y + halfH],
    [x - halfW + cut, y + halfH],
    [x - halfW, y + halfH - cut],
    [x - halfW, y - halfH + cut]
]);

const heart = (ctx, x, y, size) => {
    ctx.beginPath();
    ctx.moveTo(x, y + size * 0.5);
    ctx.bezierCurveTo(x - size, y, x - size * 0.5, y - size, x, y - size * 0.35);
    ctx.bezierCurveTo(x + size * 0.5, y - size, x + size, y, x, y + size * 0.5);
    ctx.closePath();
};

// Rows of cells where every other row is offset by half a cell.
const staggeredGrid = (rows, cols, cellX, cellY, draw) => {
    for (let row = -rows; row <= rows; row++) {
        for (let col = -cols; col <= cols; col++) {
            const offset = row % 2 ? cellX / 2 : 0;
            draw(col * cellX + offset, row * cellY, row + col);
        }
    }
};

const smoothTrace = (ctx, points) => {
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const n = points.length;
    const start = mid(points[n - 1], points[0]);
    ctx.beginPath();
    ctx.moveTo(start[0], start[1]);
    points.forEach((p, i) => {
        const m = mid(p, points[(i + 1) % n]);
        ctx.quadraticCurveTo(p[0], p[1], m[0], m[1]);
    });
    ctx.closePath();
};

const blobPoints = (cx, cy, r, phase) => Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * TAU;
    const k = 1 + 0.22 * Math.sin(3 * a + phase) + 0.1 * Math.cos(5 * a - phase);
    return [cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k];
});

// A teardrop flame whose base sits at (bx, by) and whose tip points along `direction`.
const flame = (ctx, bx, by, direction, length, width, color) => {
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(direction);
    ctx.beginPath();
    ctx.moveTo(0, -width);
    ctx.bezierCurveTo(length * 0.4, -width * 1.2, length * 0.75, -width * 0.2, length, 0);
    ctx.bezierCurveTo(length * 0.7, width * 0.5, length * 0.35, width * 1.1, 0, width);
    ctx.closePath();
    fillPath(ctx, color);
    ctx.restore();
};

const arcBand = (ctx, cx, cy, r0, r1, a0, a1, color) => {
    ctx.beginPath();
    ctx.arc(cx, cy, r1, a0, a1);
    ctx.arc(cx, cy, r0, a1, a0, true);
    ctx.closePath();
    fillPath(ctx, color);
};

// A zigzag line from (x0, y0) to (x1, y1) whose interior points wobble sideways.
const jagged = (x0, y0, x1, y1, steps, amp, seed) => {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    const nx = -dy / len;
    const ny = dx / len;
    return Array.from({ length: steps + 1 }, (_, i) => {
        const t = i / steps;
        const side = i === 0 || i === steps ? 0 : Math.sin(seed * 7.3 + i * 2.9) * amp;
        return [x0 + dx * t + nx * side, y0 + dy * t + ny * side];
    });
};

const PAINTERS = {
    "Ice Sword": ctx => {
        tint(ctx, "rgba(170, 230, 255, 0.3)");
        const nodes = [];
        staggeredGrid(3, 3, 0.55, 0.48, (x, y) => nodes.push([x, y]));
        nodes.forEach(([x, y]) => {
            ctx.beginPath();
            ctx.arc(x, y, 0.3, 0, TAU);
            fillPath(ctx, "rgba(215, 245, 255, 0.45)");
            strokePath(ctx, "rgba(255, 255, 255, 0.85)", 0.04);
        });
        ctx.beginPath();
        nodes.forEach(([ax, ay], i) => {
            nodes.slice(i + 1).forEach(([bx, by]) => {
                if (Math.hypot(bx - ax, by - ay) < 0.65) {
                    ctx.moveTo(ax, ay);
                    ctx.lineTo(bx, by);
                }
            });
        });
        strokePath(ctx, "rgba(255, 255, 255, 0.9)", 0.03);
    },

    Fireball: ctx => {
        glow(ctx, 0, 0, 1.1, "rgba(255, 240, 170, 0.8)", "rgba(255, 90, 20, 0.45)");
        [
            { count: 6, radius: 0.6, length: 0.95, width: 0.28, color: "rgba(255, 90, 25, 0.7)", twist: 0.5 },
            { count: 5, radius: 0.32, length: 0.72, width: 0.22, color: "rgba(255, 150, 40, 0.7)", twist: 1.2 },
            { count: 4, radius: 0.1, length: 0.42, width: 0.16, color: "rgba(255, 240, 170, 0.75)", twist: 2.0 }
        ].forEach(({ count, radius, length, width, color, twist }) => {
            for (let k = 0; k < count; k++) {
                const a = (k / count) * TAU + twist;
                flame(ctx, Math.cos(a) * radius, Math.sin(a) * radius, a + 0.7, length, width, color);
            }
        });
        for (let k = 0; k < 8; k++) {
            const a = (k / 8) * TAU + 0.2;
            ctx.beginPath();
            ctx.arc(0, 0, 0.9, a, a + 0.5);
            strokePath(ctx, "rgba(255, 210, 110, 0.8)", 0.06);
        }
        for (let k = 0; k < 6; k++) {
            const a = (k / 6) * TAU + 0.7;
            ctx.beginPath();
            ctx.arc(0, 0, 0.66, a, a + 0.6);
            strokePath(ctx, "rgba(255, 200, 90, 0.7)", 0.04);
        }
    },

    Duplicator: ctx => {
        tint(ctx, "rgba(255, 255, 255, 0.22)");
        [-0.55, 0, 0.55].forEach((rowY, row) => {
            for (let i = 0; i < 5; i++) {
                ctx.beginPath();
                ctx.arc(i * 0.26 - 0.52 + (row % 2) * 0.13, rowY, 0.62 - i * 0.1, 0, TAU);
                fillPath(ctx, "rgba(255, 255, 255, 0.16)");
                strokePath(ctx, `rgba(255, 255, 255, ${0.85 - i * 0.12})`, 0.05);
            }
        });
    },

    Ghost: ctx => {
        tint(ctx, "rgba(170, 185, 210, 0.3)");
        for (let k = -2; k <= 2; k++) {
            const points = [];
            for (let i = 0; i <= 16; i++) {
                const y = -1.1 + i * 0.14;
                points.push([k * 0.42 + Math.sin(y * 4 + k) * 0.14, y]);
            }
            trace(ctx, points, false);
            strokePath(ctx, "rgba(120, 140, 175, 0.4)", 0.42);
            trace(ctx, points, false);
            strokePath(ctx, "rgba(80, 100, 140, 0.45)", 0.12);
        }
        glow(ctx, 0.1, -0.3, 0.6, "rgba(255, 255, 255, 0.5)", "rgba(255, 255, 255, 0)");
    },

    Alchemist: ctx => {
        tint(ctx, "rgba(90, 40, 120, 0.22)");
        [
            [0.18, 0.0, 4.6, "rgba(120, 255, 170, 0.65)"],
            [0.36, 1.4, 4.8, "rgba(255, 110, 220, 0.65)"],
            [0.54, 2.6, 4.7, "rgba(255, 210, 90, 0.65)"],
            [0.72, 3.9, 4.9, "rgba(90, 200, 255, 0.65)"],
            [0.9, 5.2, 4.6, "rgba(255, 140, 80, 0.6)"]
        ].forEach(([r, start, sweep, color]) => {
            ctx.beginPath();
            ctx.arc(0, 0, r, start, start + sweep);
            strokePath(ctx, color, 0.16);
        });
        [[-0.6, 0.55], [0.55, -0.5], [0.7, 0.45], [-0.2, -0.75], [0.1, 0.3], [-0.7, -0.1], [0.2, -0.2], [-0.35, 0.8]]
            .forEach(([x, y]) => dot(ctx, x, y, 0.07, "rgba(255, 255, 255, 0.85)"));
    },

    Assassin: ctx => {
        const shade = ctx.createLinearGradient(0, -1.2, 0, 1.2);
        shade.addColorStop(0, "rgba(0, 0, 0, 0.4)");
        shade.addColorStop(1, "rgba(0, 0, 0, 0.85)");
        ctx.fillStyle = shade;
        ctx.fillRect(-1.2, -1.2, 2.4, 2.4);
        staggeredGrid(3, 3, 0.6, 0.52, (x, y) => {
            ctx.beginPath();
            ctx.arc(x, y, 0.32, 0, TAU);
            fillPath(ctx, "rgba(200, 210, 255, 0.12)");
            strokePath(ctx, "rgba(235, 240, 255, 0.65)", 0.05);
        });
    },

    Mutant: ctx => {
        tint(ctx, "rgba(60, 170, 90, 0.25)");
        [
            [-0.55, -0.45, 0.42, 0.4, "rgba(130, 255, 150, 0.55)"],
            [0.1, -0.5, 0.36, 1.5, "rgba(60, 210, 170, 0.55)"],
            [0.6, -0.1, 0.4, 2.6, "rgba(200, 255, 90, 0.5)"],
            [-0.3, 0.1, 0.5, 0.7, "rgba(40, 140, 70, 0.55)"],
            [0.35, 0.55, 0.34, 4.0, "rgba(160, 240, 120, 0.55)"],
            [-0.7, 0.5, 0.26, 2.0, "rgba(30, 110, 90, 0.55)"],
            [0.0, 0.0, 0.2, 5.0, "rgba(220, 255, 140, 0.5)"]
        ].forEach(([x, y, r, phase, color]) => {
            smoothTrace(ctx, blobPoints(x, y, r, phase));
            fillPath(ctx, color);
            strokePath(ctx, "rgba(230, 255, 230, 0.5)", 0.03);
        });
    },

    Knight: ctx => {
        tint(ctx, "rgba(90, 100, 120, 0.25)");
        staggeredGrid(3, 3, 0.5, 0.42, (x, y) => {
            chamferPlate(ctx, x, y, 0.23, 0.19, 0.08);
            fillPath(ctx, "rgba(200, 210, 225, 0.45)");
            strokePath(ctx, "rgba(25, 32, 50, 0.7)", 0.04);
        });
    },

    "Solar Beam": ctx => {
        glow(ctx, 0, 0, 1.1, "rgba(255, 250, 220, 0.85)", "rgba(255, 180, 40, 0.35)");
        for (let k = 0; k < 10; k++) {
            const a = (k / 10) * TAU;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * 0.22, Math.sin(a) * 0.22);
            ctx.quadraticCurveTo(Math.cos(a + 0.5) * 0.6, Math.sin(a + 0.5) * 0.6, Math.cos(a + 0.15) * 1.1, Math.sin(a + 0.15) * 1.1);
            strokePath(ctx, "rgba(255, 215, 90, 0.75)", 0.09);
        }
        for (let k = 0; k < 10; k++) {
            const a = ((k + 0.5) / 10) * TAU;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * 0.3, Math.sin(a) * 0.3);
            ctx.quadraticCurveTo(Math.cos(a - 0.4) * 0.7, Math.sin(a - 0.4) * 0.7, Math.cos(a) * 1.0, Math.sin(a) * 1.0);
            strokePath(ctx, "rgba(255, 245, 200, 0.5)", 0.04);
        }
        glow(ctx, 0, 0, 0.3, "rgba(255, 255, 255, 1)", "rgba(255, 240, 170, 0)");
    },

    Berserker: ctx => {
        tint(ctx, "rgba(120, 10, 20, 0.35)");
        [
            [[-1.1, -0.7], [1.1, 0.5]],
            [[-1.1, 0.2], [1.0, -0.8]],
            [[-0.4, -1.1], [0.5, 1.1]],
            [[0.9, -1.0], [-0.6, 1.0]],
            [[-1.0, 0.9], [1.1, 0.1]],
            [[0.2, -1.1], [-1.0, -0.2]],
            [[-0.2, 1.1], [1.0, 0.7]]
        ].forEach(([[x0, y0], [x1, y1]], k) => {
            const points = jagged(x0, y0, x1, y1, 6, 0.12, k);
            trace(ctx, points, false);
            strokePath(ctx, "rgba(255, 50, 60, 0.75)", 0.09);
            trace(ctx, points, false);
            strokePath(ctx, "rgba(255, 180, 160, 0.6)", 0.03);
        });
    },

    Spider: ctx => {
        tint(ctx, "rgba(200, 200, 210, 0.14)");
        const spokes = 12;
        const rings = [0.25, 0.5, 0.75, 1.0];
        for (let k = 0; k < spokes; k++) {
            const a0 = (k / spokes) * TAU;
            const a1 = ((k + 1) / spokes) * TAU;
            rings.forEach((r1, r) => {
                const r0 = r === 0 ? 0 : rings[r - 1];
                arcBand(ctx, 0, 0, r0, r1, a0, a1, (k + r) % 2 ? "rgba(240, 240, 240, 0.3)" : "rgba(240, 240, 240, 0.2)");
            });
        }
        rings.forEach(r => {
            ctx.beginPath();
            ctx.arc(0, 0, r, 0, TAU);
            strokePath(ctx, "rgba(245, 245, 245, 0.7)", 0.045);
        });
        for (let k = 0; k < spokes; k++) {
            const a = (k / spokes) * TAU;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(Math.cos(a + 0.12) * 0.5, Math.sin(a + 0.12) * 0.5, Math.cos(a) * 1.05, Math.sin(a) * 1.05);
            strokePath(ctx, "rgba(245, 245, 245, 0.75)", 0.045);
        }
    },

    Tunneler: ctx => {
        tint(ctx, "rgba(110, 70, 40, 0.3)");
        staggeredGrid(3, 3, 0.6, 0.52, (x, y, parity) => {
            const color = parity % 2 ? "rgba(255, 225, 160, 0.8)" : "rgba(200, 150, 90, 0.8)";
            ctx.beginPath();
            ctx.arc(x, y, 0.34, 0.35, TAU - 0.35);
            strokePath(ctx, color, 0.08);
            ctx.beginPath();
            ctx.arc(x, y, 0.19, Math.PI * 0.6, Math.PI * 0.6 + TAU * 0.75);
            strokePath(ctx, color, 0.07);
            dot(ctx, x, y, 0.05, "rgba(20, 12, 6, 0.6)");
        });
    },

    Tornado: ctx => {
        tint(ctx, "rgba(120, 190, 230, 0.22)");
        const band = (offset, sweep, color) => {
            const samples = 14;
            const outer = [];
            const inner = [];
            for (let i = 0; i <= samples; i++) {
                const t = i / samples;
                const a = offset + t * sweep;
                const r = 1.05 - 0.85 * t;
                const w = 0.03 + 0.24 * (1 - t);
                outer.push([Math.cos(a) * (r + w), Math.sin(a) * (r + w)]);
                inner.push([Math.cos(a) * (r - w), Math.sin(a) * (r - w)]);
            }
            trace(ctx, [...outer, ...inner.reverse()]);
            fillPath(ctx, color);
        };
        for (let k = 0; k < 4; k++) {
            band(k * Math.PI / 2, 3.4, k % 2 ? "rgba(120, 200, 240, 0.6)" : "rgba(225, 248, 255, 0.6)");
        }
    },

    Meteor: ctx => {
        glow(ctx, 0.2, 0.1, 1.1, "rgba(255, 170, 70, 0.6)", "rgba(120, 30, 10, 0.3)");
        [
            [[-1.1, 0.3], [-0.2, -0.1], [0.6, -0.6]],
            [[-1.0, 0.7], [-0.1, 0.25], [0.7, -0.2]],
            [[-0.5, 1.1], [0.1, 0.55], [1.0, 0.25]],
            [[-1.1, -0.2], [-0.5, -0.4], [0.2, -0.9]]
        ].forEach(([start, control, end]) => {
            ctx.beginPath();
            ctx.moveTo(...start);
            ctx.quadraticCurveTo(...control, ...end);
            strokePath(ctx, "rgba(255, 140, 40, 0.7)", 0.2);
            ctx.beginPath();
            ctx.moveTo(...start);
            ctx.quadraticCurveTo(...control, ...end);
            strokePath(ctx, "rgba(255, 220, 150, 0.7)", 0.05);
        });
        [[0.55, 0.45], [-0.55, -0.35], [0.15, -0.7], [-0.2, 0.6], [0.8, -0.5], [-0.8, 0.3], [0.3, 0.1], [-0.35, -0.85]].forEach(([x, y]) => {
            glow(ctx, x, y, 0.2, "rgba(255, 230, 150, 0.95)", "rgba(255, 150, 40, 0)");
            dot(ctx, x, y, 0.045, "rgba(255, 255, 255, 0.95)");
        });
    },

    "Black Hole": ctx => {
        tint(ctx, "rgba(40, 10, 70, 0.4)");
        const cx = 0.22;
        const cy = 0.15;
        [0.55, 0.75, 0.95].forEach(r => {
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, TAU);
            strokePath(ctx, "rgba(190, 130, 255, 0.5)", 0.05);
        });
        for (let j = 0; j < 3; j++) {
            ctx.beginPath();
            for (let i = 0; i <= 40; i++) {
                const t = i / 40;
                const a = j * (TAU / 3) + t * TAU * 1.5;
                const r = (1.15 - t * 0.95) * (1 + 0.1 * Math.sin(3 * a + j));
                const x = cx + Math.cos(a) * r;
                const y = cy + Math.sin(a) * r;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            strokePath(ctx, j % 2 ? "rgba(140, 60, 220, 0.8)" : "rgba(90, 30, 160, 0.75)", 0.16);
        }
        glow(ctx, cx, cy, 0.38, "rgba(3, 0, 10, 1)", "rgba(40, 10, 80, 0)");
    },

    Striker: ctx => {
        tint(ctx, "rgba(30, 50, 90, 0.3)");
        for (let i = -3; i <= 3; i++) {
            const y = i * 0.32;
            trace(ctx, [[-1.2, y + 0.45], [0, y], [1.2, y + 0.45]], false);
            strokePath(ctx, i % 2 ? "rgba(235, 242, 255, 0.65)" : "rgba(20, 40, 80, 0.65)", 0.2);
        }
    },

    Reaper: ctx => {
        tint(ctx, "rgba(35, 35, 40, 0.45)");
        staggeredGrid(3, 3, 0.6, 0.52, (x, y, parity) => {
            ctx.beginPath();
            ctx.arc(x, y, 0.33, 0, TAU);
            fillPath(ctx, parity % 2 ? "rgba(95, 12, 30, 0.75)" : "rgba(45, 45, 50, 0.75)");
            strokePath(ctx, "rgba(255, 40, 60, 0.75)", 0.04);
        });
    },

    Vampire: ctx => {
        tint(ctx, "rgba(70, 0, 20, 0.35)");
        for (let row = -2; row <= 2; row++) {
            const yOffset = row * 0.32;
            const points = [];
            for (let i = 0; i <= 24; i++) {
                const x = -1.2 + i * 0.1;
                points.push([x, yOffset + Math.sin(x * Math.PI * 1.4 + row * 1.1) * 0.22]);
            }
            trace(ctx, points, false);
            strokePath(ctx, row % 2 ? "rgba(90, 0, 25, 0.85)" : "rgba(220, 30, 60, 0.75)", 0.14);
        }
    },

    Mahoraga: ctx => {
        tint(ctx, "rgba(120, 90, 30, 0.2)");
        for (let ring = 0; ring < 3; ring++) {
            const r0 = 0.12 + ring * 0.3;
            const r1 = r0 + 0.26;
            for (let k = 0; k < 8; k++) {
                const a0 = (k / 8) * TAU + ring * 0.19 + 0.04;
                const a1 = a0 + TAU / 8 - 0.08;
                arcBand(ctx, 0, 0, r0, r1, a0, a1, (k + ring) % 2 ? "rgba(255, 230, 150, 0.65)" : "rgba(170, 120, 40, 0.6)");
            }
        }
        [0.1, 0.4, 0.7, 0.98].forEach(r => {
            ctx.beginPath();
            ctx.arc(0, 0, r, 0, TAU);
            strokePath(ctx, "rgba(255, 245, 200, 0.6)", 0.03);
        });
        dot(ctx, 0, 0, 0.1, "rgba(255, 245, 200, 0.7)");
    },

    Snake: ctx => {
        tint(ctx, "rgba(10, 60, 30, 0.35)");
        staggeredGrid(3, 3, 0.42, 0.36, (x, y, parity) => {
            ctx.beginPath();
            ctx.arc(x, y, 0.3, 0, TAU);
            fillPath(ctx, parity % 2 ? "rgba(70, 210, 100, 0.75)" : "rgba(25, 130, 60, 0.8)");
            strokePath(ctx, "rgba(5, 40, 20, 0.65)", 0.04);
        });
    },

    "Laser Beam": ctx => {
        tint(ctx, "rgba(0, 120, 150, 0.3)");
        const nodes = [];
        staggeredGrid(3, 3, 0.6, 0.52, (x, y) => nodes.push([x, y]));
        ctx.beginPath();
        nodes.forEach(([ax, ay], i) => {
            nodes.slice(i + 1).forEach(([bx, by]) => {
                if (Math.hypot(bx - ax, by - ay) < 0.7) {
                    ctx.moveTo(ax, ay);
                    ctx.lineTo(bx, by);
                }
            });
        });
        strokePath(ctx, "rgba(0, 240, 255, 0.6)", 0.05);
        nodes.forEach(([x, y]) => {
            ctx.beginPath();
            ctx.arc(x, y, 0.2, 0, TAU);
            strokePath(ctx, "rgba(0, 240, 255, 0.85)", 0.05);
            glow(ctx, x, y, 0.2, "rgba(180, 250, 255, 0.9)", "rgba(0, 240, 255, 0)");
            dot(ctx, x, y, 0.05, "rgba(255, 255, 255, 0.95)");
        });
    },

    Ninja: ctx => {
        tint(ctx, "rgba(10, 10, 16, 0.35)");
        [
            [[-1.2, -0.4], [0.2, -1.2], [-0.2, 0.3]],
            [[-0.6, 1.2], [0.5, 0.0], [1.2, 1.0]],
            [[0.4, -0.9], [1.2, -0.2], [0.8, 0.5]],
            [[-1.2, 0.6], [-0.3, -0.1], [-0.5, 0.9]]
        ].forEach(points => {
            trace(ctx, points);
            fillPath(ctx, "rgba(0, 0, 0, 0.55)");
            strokePath(ctx, "rgba(255, 50, 60, 0.6)", 0.03);
        });
    },

    Spearman: ctx => {
        tint(ctx, "rgba(150, 190, 220, 0.25)");
        staggeredGrid(3, 3, 0.5, 0.45, (x, y) => {
            ctx.beginPath();
            ctx.arc(x, y, 0.3, 0, TAU);
            fillPath(ctx, "rgba(225, 242, 255, 0.35)");
            strokePath(ctx, "rgba(255, 255, 255, 0.85)", 0.05);
            ctx.beginPath();
            ctx.arc(x, y, 0.13, 0, TAU);
            strokePath(ctx, "rgba(255, 255, 255, 0.7)", 0.04);
        });
    },

    Gunner: ctx => {
        tint(ctx, "rgba(40, 80, 60, 0.25)");
        const nodes = [];
        staggeredGrid(3, 3, 0.42, 0.36, (x, y) => nodes.push([x, y]));
        ctx.beginPath();
        nodes.forEach(([ax, ay], i) => {
            nodes.slice(i + 1).forEach(([bx, by]) => {
                if (Math.hypot(bx - ax, by - ay) < 0.5) {
                    ctx.moveTo(ax, ay);
                    ctx.lineTo(bx, by);
                }
            });
        });
        strokePath(ctx, "rgba(200, 255, 220, 0.6)", 0.035);
        nodes.forEach(([x, y]) => {
            ctx.beginPath();
            ctx.arc(x, y, 0.18, 0, TAU);
            fillPath(ctx, "rgba(220, 255, 230, 0.45)");
            strokePath(ctx, "rgba(230, 255, 235, 0.9)", 0.04);
            dot(ctx, x, y, 0.05, "rgba(230, 255, 235, 0.9)");
        });
    },

    Samurai: ctx => {
        tint(ctx, "rgba(20, 20, 30, 0.3)");
        staggeredGrid(3, 3, 0.6, 0.52, (x, y, parity) => {
            ctx.beginPath();
            ctx.arc(x, y, 0.34, 0, TAU);
            fillPath(ctx, parity % 2 ? "rgba(240, 240, 250, 0.6)" : "rgba(15, 15, 25, 0.65)");
            strokePath(ctx, "rgba(255, 255, 255, 0.35)", 0.04);
        });
    },

    Grappler: ctx => {
        tint(ctx, "rgba(120, 50, 20, 0.25)");
        staggeredGrid(2, 2, 0.5, 0.42, (x, y, parity) => {
            ctx.beginPath();
            if (parity % 2) ctx.arc(x, y, 0.3, 0, Math.PI);
            else ctx.arc(x, y, 0.3, Math.PI, TAU);
            strokePath(ctx, parity % 2 ? "rgba(255, 120, 60, 0.75)" : "rgba(255, 190, 90, 0.75)", 0.16);
        });
    },

    "Mine Layer": ctx => {
        staggeredGrid(2, 2, 0.49, 0.42, (x, y, parity) => {
            trace(ctx, hexPoints(x, y, 0.28));
            fillPath(ctx, parity % 2 ? "rgba(255, 130, 20, 0.5)" : "rgba(40, 25, 15, 0.5)");
            strokePath(ctx, "rgba(0, 0, 0, 0.3)", 0.03);
        });
    },

    Gambler: ctx => {
        tint(ctx, "rgba(20, 110, 60, 0.35)");
        [[-0.35, -0.3, 0.55, 0.8], [0.35, 0.2, 0.55, 0.8], [-0.35, 0.5, 0.4, 0.55], [0.5, -0.5, 0.4, 0.55]].forEach(([x, y, hw, hh]) => {
            trace(ctx, diamondPoints(x, y, hw, hh));
            fillPath(ctx, "rgba(255, 215, 90, 0.28)");
            strokePath(ctx, "rgba(255, 215, 90, 0.75)", 0.04);
        });
        heart(ctx, 0.55, -0.6, 0.22);
        fillPath(ctx, "rgba(255, 90, 110, 0.85)");
        trace(ctx, diamondPoints(-0.6, 0.55, 0.14, 0.2));
        fillPath(ctx, "rgba(255, 90, 110, 0.85)");
        ctx.save();
        ctx.translate(-0.55, -0.1);
        ctx.scale(1, -1);
        heart(ctx, 0, 0, 0.22);
        ctx.restore();
        fillPath(ctx, "rgba(255, 255, 255, 0.8)");
        [[0.05, 0.75], [-0.05, 0.6], [0.15, 0.6]].forEach(([x, y]) => dot(ctx, x, y, 0.09, "rgba(255, 255, 255, 0.8)"));
        [[-0.7, -0.6], [0.8, 0.2], [-0.1, -0.9], [-0.9, 0.3]].forEach(([x, y]) => {
            dot(ctx, x, y, 0.06, "rgba(255, 215, 90, 0.9)");
        });
    },

    Dragon: ctx => {
        staggeredGrid(2, 2, 0.45, 0.4, (x, y) => {
            ctx.beginPath();
            ctx.ellipse(x, y, 0.26, 0.2, 0, 0, TAU);
            fillPath(ctx, "rgba(120, 30, 10, 0.35)");
            strokePath(ctx, "rgba(255, 150, 60, 0.5)", 0.04);
        });
        [
            [[-0.9, 0.9], [-0.2, 0.2], [0.9, -0.8]],
            [[-0.6, 1], [0, 0.4], [0.6, -0.6]]
        ].forEach(([start, control, end]) => {
            ctx.beginPath();
            ctx.moveTo(...start);
            ctx.quadraticCurveTo(...control, ...end);
            strokePath(ctx, "rgba(255, 200, 80, 0.7)", 0.07);
        });
    },

    Mimic: ctx => {
        tint(ctx, "rgba(200, 160, 255, 0.35)");
        [
            [-0.3, -0.2, 0.6, 0.4, "rgba(255, 80, 200, 0.5)"],
            [0.35, 0.1, 0.55, 0.35, "rgba(80, 200, 255, 0.5)"],
            [-0.1, 0.5, 0.5, 0.3, "rgba(255, 220, 80, 0.5)"],
            [0.45, -0.55, 0.4, 0.3, "rgba(120, 255, 160, 0.5)"]
        ].forEach(([x, y, r, phase, color], k) => {
            ctx.save();
            smoothTrace(ctx, blobPoints(x, y, r, phase));
            ctx.clip();
            fillPath(ctx, color);
            ctx.beginPath();
            for (let i = -4; i <= 4; i++) {
                const offset = i * 0.28;
                ctx.moveTo(-1.2, offset + (k % 2 ? 0.4 : -0.4));
                ctx.lineTo(1.2, offset - (k % 2 ? 0.4 : -0.4));
            }
            strokePath(ctx, "rgba(255, 255, 255, 0.3)", 0.07);
            ctx.restore();
        });
    },

    Yeti: ctx => {
        tint(ctx, "rgba(150, 210, 255, 0.3)");
        trace(ctx, [[-1.2, -0.3], [-0.7, -0.6], [-0.4, -0.2], [0.0, -0.7], [0.4, -0.3], [0.8, -0.9], [1.2, -0.5], [1.2, 0.1], [0.7, 0.2], [0.2, 0.5], [-0.4, 0.2], [-1.2, 0.4]]);
        fillPath(ctx, "rgba(120, 190, 255, 0.5)");
        trace(ctx, [[-1.2, 0.6], [-0.6, 0.5], [-0.2, 0.9], [0.3, 0.6], [0.8, 1.0], [1.2, 0.7], [1.2, 1.2], [-1.2, 1.2]]);
        fillPath(ctx, "rgba(90, 160, 240, 0.5)");
        [
            jagged(-1.1, -0.6, 0.1, -0.85, 6, 0.1, 1),
            jagged(0.2, -0.1, 1.1, -0.55, 6, 0.1, 2),
            jagged(-0.9, 0.55, 0.3, 0.45, 6, 0.08, 3),
            jagged(0.1, 0.8, 1.0, 0.95, 6, 0.08, 4)
        ].forEach(points => {
            trace(ctx, points, false);
            strokePath(ctx, "rgba(255, 255, 255, 0.85)", 0.07);
        });
    },

    Summoner: ctx => {
        glow(ctx, 0, 0, 1.1, "rgba(170, 110, 255, 0.45)", "rgba(90, 40, 160, 0.3)");
        [
            [0.2, 0, 5.5],
            [0.42, 1.2, 5.4],
            [0.64, 2.5, 5.0],
            [0.86, 0.4, 5.2]
        ].forEach(([r, start, end]) => {
            ctx.beginPath();
            ctx.arc(0, 0, r, start, start + end - 2.5);
            strokePath(ctx, "rgba(210, 170, 255, 0.8)", 0.13);
        });
        for (let k = 0; k < 6; k++) {
            const a = (k / 6) * TAU + 0.3;
            const x = Math.cos(a) * 0.75;
            const y = Math.sin(a) * 0.75;
            glow(ctx, x, y, 0.22, "rgba(235, 215, 255, 0.9)", "rgba(190, 130, 255, 0)");
            dot(ctx, x, y, 0.07, "rgba(255, 245, 255, 0.95)");
        }
    }
};

export function drawBodyPattern(ctx, className, radius) {
    const paint = PAINTERS[className];
    if (!paint) return;
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.scale(radius, radius);
    paint(ctx);
    ctx.restore();
}
