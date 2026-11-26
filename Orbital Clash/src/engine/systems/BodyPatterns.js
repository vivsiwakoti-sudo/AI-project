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

const PAINTERS = {
    "Ice Sword": ctx => {
        ctx.rotate(-Math.PI / 4);
        for (let i = -3; i <= 3; i++) {
            ctx.fillStyle = i % 2 ? "rgba(214, 246, 255, 0.3)" : "rgba(150, 224, 255, 0.22)";
            ctx.fillRect(-1.5, i * 0.3 - 0.12, 3, 0.24);
        }
        trace(ctx, [[-0.9, -0.2], [-0.4, 0.05], [0.1, -0.15], [0.7, 0.2]], false);
        strokePath(ctx, "rgba(255, 255, 255, 0.75)", 0.04);
        trace(ctx, [[-0.2, 0.7], [0.1, 0.4], [0.35, 0.45]], false);
        strokePath(ctx, "rgba(255, 255, 255, 0.6)", 0.03);
    },

    Fireball: ctx => {
        const tongue = (x, tipX, tipY, color) => {
            ctx.beginPath();
            ctx.moveTo(x - 0.4, 1.1);
            ctx.quadraticCurveTo(x - 0.55, 0.2, tipX, tipY);
            ctx.quadraticCurveTo(x + 0.45, 0.25, x + 0.4, 1.1);
            ctx.closePath();
            fillPath(ctx, color);
        };
        tongue(-0.35, -0.3, -0.9, "rgba(255, 110, 30, 0.55)");
        tongue(0.25, 0.1, -0.55, "rgba(255, 170, 50, 0.55)");
        tongue(0.1, 0.4, -0.25, "rgba(255, 240, 170, 0.5)");
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
            [-0.45, -0.35, 0.38, 0.26, 0.4, "rgba(120, 255, 140, 0.35)"],
            [0.4, 0.2, 0.22, 0.16, -0.3, "rgba(40, 140, 70, 0.4)"],
            [-0.1, 0.55, 0.14, 0.11, 0, "rgba(160, 255, 120, 0.35)"],
            [0.35, -0.5, 0.12, 0.1, 0.8, "rgba(40, 140, 70, 0.4)"]
        ].forEach(([x, y, rx, ry, rotation, color]) => {
            ctx.beginPath();
            ctx.ellipse(x, y, rx, ry, rotation, 0, TAU);
            fillPath(ctx, color);
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
            [0.9, 0, "rgba(255, 200, 120, 0.55)"],
            [0.64, 2.1, "rgba(200, 150, 90, 0.5)"],
            [0.4, 4.2, "rgba(255, 225, 160, 0.45)"]
        ].forEach(([r, start, color]) => {
            ctx.beginPath();
            ctx.arc(0, 0, r, start, start + TAU - 0.7);
            strokePath(ctx, color, 0.08);
        });
    },

    Tornado: ctx => {
        [[0.92, 0.12], [0.7, 0.09], [0.5, 0.06], [0.32, 0.035]].forEach(([r, width], i) => {
            ctx.beginPath();
            ctx.arc(0, 0, r, i * 0.9, i * 0.9 + 4.6);
            strokePath(ctx, "rgba(220, 245, 255, 0.5)", width);
        });
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
        ctx.beginPath();
        for (let i = 0; i <= 40; i++) {
            const t = i / 40;
            const a = t * TAU * 2.2;
            const r = 0.08 + t * 0.6;
            if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
            else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        strokePath(ctx, "rgba(10, 0, 25, 0.85)", 0.09);
        ctx.beginPath();
        ctx.arc(0, 0, 0.85, 0.3, 2.6);
        strokePath(ctx, "rgba(170, 90, 255, 0.5)", 0.1);
        ctx.beginPath();
        ctx.arc(0, 0, 0.85, 3.5, 5.8);
        strokePath(ctx, "rgba(170, 90, 255, 0.5)", 0.1);
        ctx.beginPath();
        ctx.arc(0, 0, 0.55, 4.0, 6.0);
        strokePath(ctx, "rgba(190, 120, 255, 0.45)", 0.07);
    },

    Striker: ctx => {
        for (let i = -2; i <= 2; i++) {
            const y = i * 0.4;
            trace(ctx, [[-1, y + 0.3], [0, y], [1, y + 0.3]], false);
            strokePath(ctx, i % 2 ? "rgba(230, 240, 255, 0.45)" : "rgba(30, 50, 90, 0.35)", 0.12);
        }
    },

    Reaper: ctx => {
        for (let i = 0; i < 3; i++) {
            const radius = 0.6 + i * 0.25;
            ctx.beginPath();
            ctx.arc(0, -0.5, radius, 0.2, Math.PI - 0.2);
            strokePath(ctx, "rgba(10, 0, 10, 0.4)", 0.14);
            ctx.beginPath();
            ctx.arc(0, -0.5, radius + 0.12, 0.2, Math.PI - 0.2);
            strokePath(ctx, "rgba(255, 40, 60, 0.8)", 0.03);
        }
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
            [[-1, -0.55], [-0.3, -0.55], [-0.3, 0], [0.45, 0], [0.45, 0.6], [1, 0.6]],
            [[-0.6, 0.95], [-0.6, 0.25], [0.7, 0.25], [0.7, -0.8]],
            [[-0.95, 0.1], [-0.55, 0.1], [-0.2, -0.3]]
        ].forEach(points => {
            trace(ctx, points, false);
            strokePath(ctx, "rgba(0, 240, 255, 0.7)", 0.05);
        });
        [[-0.3, 0], [0.45, 0], [-0.6, 0.25], [0.7, 0.25]].forEach(([x, y]) => {
            dot(ctx, x, y, 0.07, "rgba(180, 250, 255, 0.9)");
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
        staggeredGrid(2, 2, 0.42, 0.36, (x, y) => {
            trace(ctx, diamondPoints(x, y, 0.12, 0.2));
            fillPath(ctx, "rgba(225, 242, 255, 0.3)");
        });
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
        ctx.rotate(Math.PI / 4);
        for (let i = -3; i <= 3; i++) {
            ctx.fillStyle = i % 2 ? "rgba(255, 255, 255, 0.28)" : "rgba(0, 0, 0, 0.3)";
            ctx.fillRect(-1.5, i * 0.3 - 0.15, 3, 0.3);
        }
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
