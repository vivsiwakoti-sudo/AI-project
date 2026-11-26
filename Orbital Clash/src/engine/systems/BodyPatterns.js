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

const shardPoints = (x, y, angle, length, width) => {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const px = -dy * width;
    const py = dx * width;
    return [
        [x + dx * length, y + dy * length],
        [x + px, y + py],
        [x - dx * length * 0.4, y - dy * length * 0.4],
        [x - px, y - py]
    ];
};

// Filled crescent whose horns point along the local y axis before rotation.
const crescent = (ctx, x, y, size, angle, color, edge) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.quadraticCurveTo(size * 0.9, 0, 0, size);
    ctx.quadraticCurveTo(size * 0.25, 0, 0, -size);
    ctx.closePath();
    fillPath(ctx, color);
    if (edge) strokePath(ctx, edge, 0.02);
    ctx.restore();
};

const PAINTERS = {
    "Ice Sword": ctx => {
        [
            [-0.4, -0.25, 0.5, 0.75, 0.2, "rgba(200, 240, 255, 0.32)"],
            [0.25, -0.35, -0.9, 0.7, 0.18, "rgba(160, 225, 255, 0.3)"],
            [0.1, 0.25, 2.3, 0.8, 0.2, "rgba(230, 250, 255, 0.28)"],
            [-0.45, 0.45, -0.3, 0.6, 0.16, "rgba(160, 225, 255, 0.3)"],
            [0.55, 0.45, 1.6, 0.5, 0.14, "rgba(230, 250, 255, 0.28)"]
        ].forEach(([x, y, angle, length, width, color]) => {
            trace(ctx, shardPoints(x, y, angle, length, width));
            fillPath(ctx, color);
            strokePath(ctx, "rgba(255, 255, 255, 0.55)", 0.025);
        });
        [
            [[-0.9, -0.6], [-0.6, -0.45], [-0.4, -0.25], [-0.05, -0.05], [0.25, -0.35], [0.6, -0.7]],
            [[0.1, 0.25], [-0.2, 0.05], [-0.45, 0.45], [-0.8, 0.2]],
            [[0.25, -0.35], [0.55, 0.45]]
        ].forEach(points => {
            trace(ctx, points, false);
            strokePath(ctx, "rgba(255, 255, 255, 0.8)", 0.018);
        });
    },

    Fireball: ctx => {
        [
            { count: 3, radius: 0.5, length: 0.85, width: 0.2, color: "rgba(255, 110, 30, 0.5)", twist: 0.5 },
            { count: 3, radius: 0.3, length: 0.6, width: 0.15, color: "rgba(255, 170, 50, 0.55)", twist: 1.2 },
            { count: 2, radius: 0.1, length: 0.35, width: 0.1, color: "rgba(255, 240, 170, 0.5)", twist: 2.0 }
        ].forEach(({ count, radius, length, width, color, twist }) => {
            for (let k = 0; k < count; k++) {
                const a = (k / count) * TAU + twist;
                flame(ctx, Math.cos(a) * radius, Math.sin(a) * radius, a + 0.7, length, width, color);
            }
        });
        for (let k = 0; k < 3; k++) {
            const a = (k / 3) * TAU + 0.9;
            ctx.beginPath();
            ctx.arc(0, 0, 0.85, a, a + 0.6);
            strokePath(ctx, "rgba(255, 200, 90, 0.5)", 0.03);
        }
    },

    Duplicator: ctx => {
        for (let i = 0; i < 4; i++) {
            ctx.beginPath();
            ctx.arc(i * 0.12 - 0.15, 0, 0.9 - i * 0.2, 0, TAU);
            strokePath(ctx, `rgba(255, 255, 255, ${0.6 - i * 0.12})`, 0.07);
        }
    },

    Ghost: ctx => {
        glow(ctx, -0.35, -0.25, 0.7, "rgba(235, 245, 255, 0.45)", "rgba(235, 245, 255, 0)");
        glow(ctx, 0.3, 0.05, 0.6, "rgba(235, 245, 255, 0.4)", "rgba(235, 245, 255, 0)");
        glow(ctx, -0.05, 0.5, 0.55, "rgba(235, 245, 255, 0.35)", "rgba(235, 245, 255, 0)");
    },

    Alchemist: ctx => {
        [
            [0.8, 0.3, 4.2, "rgba(120, 255, 170, 0.55)"],
            [0.52, 1.4, 5.0, "rgba(255, 110, 220, 0.5)"],
            [0.26, 2.5, 4.6, "rgba(255, 210, 90, 0.55)"]
        ].forEach(([r, start, end, color]) => {
            ctx.beginPath();
            ctx.arc(0, 0, r, start, end);
            strokePath(ctx, color, 0.14);
        });
        [[-0.6, 0.55], [0.55, -0.5], [0.7, 0.45], [-0.2, -0.75]].forEach(([x, y]) => {
            dot(ctx, x, y, 0.06, "rgba(255, 255, 255, 0.8)");
        });
    },

    Assassin: ctx => {
        const shade = ctx.createLinearGradient(0, -1, 0, 1);
        shade.addColorStop(0, "rgba(0, 0, 0, 0)");
        shade.addColorStop(1, "rgba(0, 0, 0, 0.6)");
        ctx.fillStyle = shade;
        ctx.fillRect(-1.2, -1.2, 2.4, 2.4);
        trace(ctx, [[-1, -0.7], [0.9, 0.8]], false);
        strokePath(ctx, "rgba(235, 240, 255, 0.7)", 0.06);
        trace(ctx, [[-0.9, 0.9], [0.5, -0.9]], false);
        strokePath(ctx, "rgba(235, 240, 255, 0.45)", 0.04);
    },

    Mutant: ctx => {
        [
            [-0.45, -0.4, 0.36, 0.4, "rgba(120, 255, 140, 0.4)"],
            [-0.02, -0.12, 0.27, 1.5, "rgba(60, 210, 170, 0.4)"],
            [0.4, 0.22, 0.19, 2.6, "rgba(200, 255, 90, 0.35)"],
            [0.68, 0.6, 0.12, 0.7, "rgba(40, 140, 70, 0.45)"]
        ].forEach(([x, y, r, phase, color]) => {
            smoothTrace(ctx, blobPoints(x, y, r, phase));
            fillPath(ctx, color);
            strokePath(ctx, "rgba(230, 255, 230, 0.35)", 0.02);
        });
    },

    Knight: ctx => {
        staggeredGrid(1, 2, 0.5, 0.42, (x, y) => {
            trace(ctx, [[x - 0.22, y - 0.16], [x + 0.22, y - 0.16], [x + 0.22, y + 0.16], [x - 0.22, y + 0.16]]);
            fillPath(ctx, "rgba(190, 200, 215, 0.3)");
            strokePath(ctx, "rgba(30, 40, 60, 0.5)", 0.03);
        });
    },

    "Solar Beam": ctx => {
        for (let k = 0; k < 8; k++) {
            const a = (k / 8) * TAU;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * 0.22, Math.sin(a) * 0.22);
            ctx.quadraticCurveTo(Math.cos(a + 0.5) * 0.6, Math.sin(a + 0.5) * 0.6, Math.cos(a + 0.15) * 1.05, Math.sin(a + 0.15) * 1.05);
            strokePath(ctx, "rgba(255, 220, 90, 0.6)", 0.07);
        }
        glow(ctx, 0, 0, 0.35, "rgba(255, 255, 240, 0.95)", "rgba(255, 220, 90, 0)");
    },

    Berserker: ctx => {
        [
            [[-1, -0.6], [-0.4, -0.2], [-0.6, 0.15], [0.2, 0.35], [0.9, 0.1]],
            [[-0.9, 0.6], [-0.2, 0.2], [0.1, 0.5], [0.8, -0.1]],
            [[-0.2, -1], [0.1, -0.5], [-0.1, -0.1], [0.4, 0.5], [0.3, 1]],
            [[0.5, -0.9], [0.2, -0.35], [0.7, 0.1]]
        ].forEach(points => {
            trace(ctx, points, false);
            strokePath(ctx, "rgba(255, 50, 60, 0.65)", 0.07);
        });
    },

    Spider: ctx => {
        for (let k = 0; k < 8; k++) {
            const a = (k / 8) * TAU;
            const b = ((k + 1) / 8) * TAU;
            const mid = a + Math.PI / 8;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * 0.3, Math.sin(a) * 0.3);
            ctx.quadraticCurveTo(Math.cos(mid) * 0.45, Math.sin(mid) * 0.45, Math.cos(b) * 0.9, Math.sin(b) * 0.9);
            strokePath(ctx, "rgba(240, 240, 240, 0.5)", 0.035);
            trace(ctx, [[0, 0], [Math.cos(a), Math.sin(a)]], false);
            strokePath(ctx, "rgba(240, 240, 240, 0.4)", 0.035);
        }
        [0.3, 0.6, 0.9].forEach(r => {
            ctx.beginPath();
            ctx.arc(0, 0, r, 0, TAU);
            strokePath(ctx, "rgba(240, 240, 240, 0.45)", 0.035);
        });
    },

    Tunneler: ctx => {
        [
            [0, 0, 0.92, 0.0, "rgba(255, 200, 120, 0.55)"],
            [0.06, -0.05, 0.66, 1.2, "rgba(200, 150, 90, 0.5)"],
            [-0.05, 0.04, 0.42, 2.9, "rgba(255, 225, 160, 0.45)"]
        ].forEach(([cx, cy, r, start, color]) => {
            [[start, start + 2.1], [start + 2.7, start + 4.9]].forEach(([a0, a1]) => {
                ctx.beginPath();
                ctx.arc(cx, cy, r, a0, a1);
                strokePath(ctx, color, 0.09);
            });
        });
        dot(ctx, -0.05, 0.04, 0.2, "rgba(20, 12, 6, 0.5)");
    },

    Tornado: ctx => {
        const band = (offset, sweep, color) => {
            const samples = 12;
            const outer = [];
            const inner = [];
            for (let i = 0; i <= samples; i++) {
                const t = i / samples;
                const a = offset + t * sweep;
                const r = 1 - 0.75 * t;
                const w = 0.02 + 0.16 * (1 - t);
                outer.push([Math.cos(a) * (r + w), Math.sin(a) * (r + w)]);
                inner.push([Math.cos(a) * (r - w), Math.sin(a) * (r - w)]);
            }
            trace(ctx, [...outer, ...inner.reverse()]);
            fillPath(ctx, color);
        };
        for (let k = 0; k < 4; k++) {
            band(k * Math.PI / 2, 2.6, k % 2 ? "rgba(140, 210, 240, 0.4)" : "rgba(220, 245, 255, 0.45)");
        }
    },

    Meteor: ctx => {
        [
            [[-1, 0.3], [-0.2, -0.1], [0.5, -0.5]],
            [[-0.9, 0.7], [-0.1, 0.25], [0.6, -0.15]],
            [[-0.4, 1], [0.1, 0.55], [0.9, 0.2]]
        ].forEach(([start, control, end]) => {
            ctx.beginPath();
            ctx.moveTo(...start);
            ctx.quadraticCurveTo(...control, ...end);
            strokePath(ctx, "rgba(255, 140, 40, 0.6)", 0.09);
        });
        [[0.55, 0.45], [-0.55, -0.35], [0.15, -0.7], [-0.2, 0.6]].forEach(([x, y]) => {
            glow(ctx, x, y, 0.16, "rgba(255, 230, 150, 0.9)", "rgba(255, 150, 40, 0)");
            dot(ctx, x, y, 0.04, "rgba(255, 255, 255, 0.9)");
        });
    },

    "Black Hole": ctx => {
        const cx = 0.22;
        const cy = 0.15;
        for (let j = 0; j < 3; j++) {
            ctx.beginPath();
            for (let i = 0; i <= 24; i++) {
                const t = i / 24;
                const a = j * 2.1 + t * TAU * 1.6;
                const r = (1.05 - t * 0.8) * (1 + 0.08 * Math.sin(3 * a + j));
                const x = cx + Math.cos(a) * r;
                const y = cy + Math.sin(a) * r;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            strokePath(ctx, j % 2 ? "rgba(150, 70, 230, 0.55)" : "rgba(200, 140, 255, 0.45)", 0.09);
        }
        [0.5, 0.75].forEach(r => {
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, TAU);
            strokePath(ctx, "rgba(190, 140, 255, 0.3)", 0.025);
        });
        glow(ctx, cx, cy, 0.34, "rgba(5, 0, 15, 0.95)", "rgba(60, 20, 110, 0)");
    },

    Striker: ctx => {
        for (let i = -2; i <= 2; i++) {
            const y = i * 0.4;
            trace(ctx, [[-1, y + 0.3], [0, y], [1, y + 0.3]], false);
            strokePath(ctx, i % 2 ? "rgba(230, 240, 255, 0.45)" : "rgba(30, 50, 90, 0.35)", 0.12);
        }
    },

    Reaper: ctx => {
        crescent(ctx, -0.3, -0.2, 0.9, 0.3, "rgba(90, 12, 28, 0.55)", "rgba(255, 40, 60, 0.6)");
        crescent(ctx, 0.25, 0.1, 1.0, -0.6, "rgba(40, 40, 46, 0.6)");
        crescent(ctx, -0.1, 0.45, 0.7, 2.0, "rgba(90, 12, 28, 0.5)", "rgba(255, 40, 60, 0.5)");
        crescent(ctx, 0.4, -0.45, 0.6, 0.8, "rgba(40, 40, 46, 0.55)", "rgba(255, 40, 60, 0.45)");
        crescent(ctx, -0.5, 0.3, 0.5, -1.4, "rgba(30, 30, 34, 0.6)");
    },

    Vampire: ctx => {
        [[0, "rgba(220, 30, 60, 0.7)"], [Math.PI, "rgba(90, 0, 25, 0.7)"]].forEach(([phase, color]) => {
            ctx.beginPath();
            for (let i = 0; i <= 24; i++) {
                const x = -1 + i / 12;
                const y = Math.sin(x * Math.PI * 1.5 + phase) * 0.45;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            strokePath(ctx, color, 0.12);
        });
    },

    Mahoraga: ctx => {
        for (let k = 0; k < 8; k++) {
            const a = (k / 8) * TAU;
            ctx.beginPath();
            ctx.arc(0, 0, 0.75, a + 0.12, a + TAU / 8 - 0.12);
            strokePath(ctx, "rgba(255, 230, 150, 0.6)", 0.12);
        }
        ctx.beginPath();
        ctx.arc(0, 0, 0.42, 0, TAU);
        strokePath(ctx, "rgba(255, 230, 150, 0.4)", 0.04);
        dot(ctx, 0, 0, 0.14, "rgba(255, 245, 200, 0.6)");
    },

    Snake: ctx => {
        staggeredGrid(2, 2, 0.45, 0.36, (x, y, parity) => {
            ctx.beginPath();
            ctx.arc(x, y, 0.26, 0, Math.PI);
            fillPath(ctx, parity % 2 ? "rgba(60, 200, 90, 0.5)" : "rgba(20, 120, 50, 0.55)");
        });
    },

    "Laser Beam": ctx => {
        [
            [[-1, 0.1], [-0.2, 0.1], [0.15, 0.55], [0.95, 0.55]],
            [[-0.45, -1], [-0.45, -0.35], [0.25, 0.05], [0.25, 0.95]],
            [[-0.9, -0.6], [-0.45, -0.35], [0.5, -0.85]],
            [[0.2, -0.5], [0.7, -0.05], [1, -0.5]],
            [[-0.2, 0.1], [0.25, 0.05], [0.7, -0.05]],
            [[-0.95, 0.75], [-0.2, 0.1]]
        ].forEach(points => {
            trace(ctx, points, false);
            strokePath(ctx, "rgba(0, 240, 255, 0.35)", 0.08);
            strokePath(ctx, "rgba(190, 255, 255, 0.8)", 0.035);
        });
        [[-0.2, 0.1], [0.15, 0.55], [-0.45, -0.35], [0.25, 0.05], [0.7, -0.05], [0.5, -0.85]].forEach(([x, y]) => {
            glow(ctx, x, y, 0.16, "rgba(180, 250, 255, 0.85)", "rgba(0, 240, 255, 0)");
            dot(ctx, x, y, 0.035, "rgba(255, 255, 255, 0.95)");
        });
    },

    Ninja: ctx => {
        trace(ctx, [[-1, -0.3], [0.2, -1], [-0.2, 0.25]]);
        fillPath(ctx, "rgba(0, 0, 0, 0.35)");
        trace(ctx, [[-0.4, 1], [0.6, 0.05], [1, 0.9]]);
        fillPath(ctx, "rgba(0, 0, 0, 0.4)");
        trace(ctx, [[0.2, -1], [-0.2, 0.25], [0.6, 0.05]], false);
        strokePath(ctx, "rgba(255, 50, 60, 0.55)", 0.035);
        trace(ctx, [[-0.4, 1], [0.1, 0.45]], false);
        strokePath(ctx, "rgba(255, 50, 60, 0.45)", 0.03);
    },

    Spearman: ctx => {
        const cells = [];
        staggeredGrid(2, 2, 0.4, 0.3, (x, y) => cells.push([x, y]));
        cells.forEach(([x, y]) => {
            trace(ctx, diamondPoints(x, y, 0.1, 0.38));
            fillPath(ctx, "rgba(225, 242, 255, 0.28)");
        });
        ctx.beginPath();
        cells.forEach(([x, y]) => {
            ctx.moveTo(x, y - 0.38);
            ctx.lineTo(x, y + 0.38);
        });
        strokePath(ctx, "rgba(255, 255, 255, 0.45)", 0.012);
    },

    Gunner: ctx => {
        const nodes = [[-0.65, -0.5], [0.05, -0.75], [0.6, -0.2], [-0.05, 0.1], [-0.7, 0.45], [0.45, 0.6]];
        trace(ctx, nodes, false);
        strokePath(ctx, "rgba(200, 255, 220, 0.5)", 0.03);
        nodes.forEach(([x, y]) => {
            ctx.beginPath();
            ctx.arc(x, y, 0.14, 0, TAU);
            strokePath(ctx, "rgba(220, 255, 230, 0.75)", 0.04);
            dot(ctx, x, y, 0.05, "rgba(220, 255, 230, 0.75)");
        });
    },

    Samurai: ctx => {
        ctx.save();
        ctx.rotate(Math.PI / 4);
        for (let i = -3; i <= 3; i++) {
            ctx.fillStyle = "rgba(235, 235, 245, 0.32)";
            ctx.fillRect(-1.5, i * 0.3 - 0.1, 3, 0.2);
        }
        ctx.restore();
        ctx.save();
        ctx.rotate(-Math.PI / 4);
        for (let i = -3; i <= 3; i++) {
            const y = i * 0.3 - 0.08;
            ctx.fillStyle = "rgba(10, 10, 20, 0.45)";
            if (i % 2) {
                ctx.fillRect(-1.5, y, 3, 0.16);
            } else {
                ctx.fillRect(-1.5, y, 1.35, 0.16);
                ctx.fillRect(0.15, y, 1.35, 0.16);
            }
        }
        ctx.restore();
    },

    Grappler: ctx => {
        staggeredGrid(1, 2, 0.5, 0.45, (x, y, parity) => {
            ctx.beginPath();
            if (parity % 2) ctx.arc(x, y, 0.3, 0, Math.PI);
            else ctx.arc(x, y, 0.3, Math.PI, TAU);
            strokePath(ctx, parity % 2 ? "rgba(255, 120, 60, 0.6)" : "rgba(255, 190, 90, 0.6)", 0.1);
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
        trace(ctx, diamondPoints(-0.2, -0.1, 0.55, 0.8));
        strokePath(ctx, "rgba(255, 215, 90, 0.6)", 0.05);
        trace(ctx, diamondPoints(0.25, 0.1, 0.5, 0.75));
        strokePath(ctx, "rgba(255, 215, 90, 0.6)", 0.05);
        heart(ctx, 0.5, -0.6, 0.2);
        fillPath(ctx, "rgba(255, 80, 100, 0.7)");
        trace(ctx, diamondPoints(-0.6, 0.6, 0.14, 0.2));
        fillPath(ctx, "rgba(255, 255, 255, 0.6)");
        [[-0.7, -0.2], [0.8, 0.5], [-0.1, 0.8]].forEach(([x, y]) => {
            dot(ctx, x, y, 0.05, "rgba(255, 215, 90, 0.8)");
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
        [
            [-0.3, -0.2, 0.55, 0.38, 0.5, "rgba(255, 80, 200, 0.3)"],
            [0.35, 0.1, 0.5, 0.3, -0.6, "rgba(80, 200, 255, 0.3)"],
            [-0.1, 0.5, 0.45, 0.25, 0.1, "rgba(255, 220, 80, 0.3)"],
            [0.45, -0.55, 0.3, 0.2, 0.9, "rgba(120, 255, 160, 0.3)"]
        ].forEach(([x, y, rx, ry, rotation, color]) => {
            ctx.beginPath();
            ctx.ellipse(x, y, rx, ry, rotation, 0, TAU);
            fillPath(ctx, color);
        });
        for (let i = -2; i <= 2; i++) {
            trace(ctx, [[-1, i * 0.35], [1, i * 0.35 + 0.3]], false);
            strokePath(ctx, "rgba(255, 255, 255, 0.25)", 0.03);
        }
    },

    Yeti: ctx => {
        trace(ctx, [[-1, -0.2], [-0.6, -0.55], [-0.25, -0.1], [0.1, -0.6], [0.5, -0.2], [0.2, 0.25], [-0.3, 0.1]]);
        fillPath(ctx, "rgba(120, 190, 255, 0.4)");
        trace(ctx, [[-0.2, 0.5], [0.2, 0.3], [0.5, 0.7], [0.9, 0.35], [0.7, 0.9], [0.2, 1], [-0.45, 0.85]]);
        fillPath(ctx, "rgba(90, 160, 240, 0.4)");
        [
            [[-0.85, 0.55], [-0.4, 0.4], [-0.1, 0.6], [0.3, 0.45]],
            [[0.1, -0.85], [0.35, -0.5], [0.7, -0.6], [0.95, -0.25]],
            [[-0.7, -0.85], [-0.4, -0.7]]
        ].forEach(points => {
            trace(ctx, points, false);
            strokePath(ctx, "rgba(255, 255, 255, 0.7)", 0.06);
        });
    },

    Summoner: ctx => {
        [
            [0.35, 0, 4.5],
            [0.6, 1.2, 5.2],
            [0.85, 2.6, 4.8]
        ].forEach(([r, start, end]) => {
            ctx.beginPath();
            ctx.arc(0, 0, r, start, end);
            strokePath(ctx, "rgba(190, 130, 255, 0.6)", 0.08);
        });
        for (let k = 0; k < 5; k++) {
            const a = (k / 5) * TAU + 0.3;
            const x = Math.cos(a) * 0.6;
            const y = Math.sin(a) * 0.6;
            glow(ctx, x, y, 0.2, "rgba(235, 215, 255, 0.8)", "rgba(190, 130, 255, 0)");
            dot(ctx, x, y, 0.06, "rgba(255, 245, 255, 0.95)");
        }
    }
};

export function drawBodyPattern(ctx, className, radius) {
    const paint = PAINTERS[className];
    if (!paint) return;
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.scale(radius, radius);
    paint(ctx);
    ctx.restore();
}
