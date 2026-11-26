// Arena stage rendering.
//
// Pure presentation: everything here is drawn under the fighters and never
// touches simulation state or the playable square (inset by ARENA_INSET, which
// is where fighters bounce).
//
// The static parts (floor, perspective grid, circuit traces and their bloom)
// are rasterised once per arena size into offscreen canvases. Each frame only
// blits those and draws the moving parts: pulses travelling along the traces,
// node twinkle and a slow scan band.

const TAU = Math.PI * 2;

// Matches Arena.jsx: fighters bounce off a border inset 20px from the canvas.
export const ARENA_INSET = 20;

const CYAN = "0, 242, 255";
const ELECTRIC_BLUE = "47, 123, 255";
const HOT_CORE = "230, 252, 255";
const HORIZON_RATIO = 0.44;
const TRACE_END_RATIO = 0.28;
const WIRES_PER_SIDE = 7;
const PULSES_PER_WIRE = 2;
const FLOOR_ROWS = 14;
const FLOOR_COLUMNS = 18;

function createSeededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function positiveMod(value, modulus) {
  return ((value % modulus) + modulus) % modulus;
}

function lerpPoint(a, b, u) {
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
}

function makeWire(points) {
  const unique = points.filter(
    (point, i) => i === 0 || point[0] !== points[i - 1][0] || point[1] !== points[i - 1][1]
  );
  const cumulative = [0];
  for (let i = 1; i < unique.length; i++) {
    const [ax, ay] = unique[i - 1];
    const [bx, by] = unique[i];
    cumulative.push(cumulative[i - 1] + Math.hypot(bx - ax, by - ay));
  }
  return { points: unique, cumulative, length: cumulative[cumulative.length - 1] };
}

// Octilinear traces: each starts on a side edge, runs horizontally, bends
// through a 45-degree diagonal and ends in a hub just outside the centre.
// The right side is the mirror of the left, so the stage stays balanced.
function buildCircuitLayout(size) {
  const random = createSeededRandom(size * 9301 + 49297);
  const inner = ARENA_INSET;
  const span = size - inner * 2;
  const horizon = size * HORIZON_RATIO;
  const traceEndX = size * TRACE_END_RATIO;

  const wires = [];
  const nodes = [];

  const addWire = points => {
    const wire = makeWire(points);
    wires.push(wire);
    const last = wire.points.length - 1;
    wire.points.slice(1, last).forEach(([x, y]) => {
      nodes.push({ x, y, r: 2.2, hub: false, phase: random() * TAU });
    });
    const [hx, hy] = wire.points[last];
    nodes.push({ x: hx, y: hy, r: 4, hub: true, phase: random() * TAU });
  };

  for (let i = 0; i < WIRES_PER_SIDE; i++) {
    const lane = (i + 0.5) / WIRES_PER_SIDE;
    const startY = inner + span * (0.08 + lane * 0.84);
    const bendX = inner + span * (0.08 + random() * 0.06);
    const maxDiagonal = traceEndX - bendX;
    const rawDy = horizon + (lane - 0.5) * size * 0.34 + (random() - 0.5) * size * 0.03 - startY;
    const dy = Math.max(-maxDiagonal, Math.min(maxDiagonal, rawDy));
    const endY = startY + dy;
    const left = [
      [inner, startY],
      [bendX, startY],
      [bendX + Math.abs(dy), endY],
      [traceEndX, endY]
    ];
    addWire(left);
    addWire(left.map(([x, y]) => [size - x, y]));
  }

  const pulses = [];
  wires.forEach((wire, index) => {
    for (let p = 0; p < PULSES_PER_WIRE; p++) {
      pulses.push({
        wire: index,
        speed: 70 + random() * 90,
        offset: random(),
        tail: 60 + random() * 80,
        color: random() < 0.7 ? CYAN : ELECTRIC_BLUE,
        brightness: 0.65 + random() * 0.35
      });
    }
  });

  return { wires, nodes, pulses };
}

function pointAt(wire, distance) {
  const { points, cumulative } = wire;
  for (let i = 1; i < points.length; i++) {
    if (distance <= cumulative[i]) {
      const u = (distance - cumulative[i - 1]) / (cumulative[i] - cumulative[i - 1]);
      return lerpPoint(points[i - 1], points[i], u);
    }
  }
  return points[points.length - 1];
}

// Adds the portion of a wire between two distances along it to the current path.
function tracePartial(ctx, wire, from, to) {
  const { points, cumulative } = wire;
  ctx.beginPath();
  let started = false;
  for (let i = 1; i < points.length; i++) {
    const segStart = cumulative[i - 1];
    const segEnd = cumulative[i];
    if (segEnd < from || segStart > to) continue;
    const segLength = segEnd - segStart;
    const a = points[i - 1];
    const b = points[i];
    const start = lerpPoint(a, b, (Math.max(from, segStart) - segStart) / segLength);
    const end = lerpPoint(a, b, (Math.min(to, segEnd) - segStart) / segLength);
    if (!started) {
      ctx.moveTo(start[0], start[1]);
      started = true;
    }
    ctx.lineTo(end[0], end[1]);
  }
}

function strokeWirePaths(ctx, layout) {
  ctx.beginPath();
  for (const wire of layout.wires) {
    wire.points.forEach(([x, y], i) => {
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
  }
  ctx.stroke();
}

function paintFloor(ctx, size) {
  const inner = ARENA_INSET;
  const span = size - inner * 2;
  const horizon = size * HORIZON_RATIO;
  const bottom = size - inner;

  ctx.fillStyle = "#02030a";
  ctx.fillRect(0, 0, size, size);

  const haze = ctx.createRadialGradient(size / 2, horizon, 0, size / 2, horizon, size * 0.6);
  haze.addColorStop(0, `rgba(${ELECTRIC_BLUE}, 0.22)`);
  haze.addColorStop(1, `rgba(${ELECTRIC_BLUE}, 0)`);
  ctx.fillStyle = haze;
  ctx.fillRect(inner, inner, span, span);

  ctx.save();
  ctx.beginPath();
  ctx.rect(inner, horizon, span, bottom - horizon);
  ctx.clip();

  ctx.lineWidth = 1;
  // Rows bunch up toward the horizon, which is what gives the floor its depth.
  for (let row = 1; row <= FLOOR_ROWS; row++) {
    const t = row / FLOOR_ROWS;
    const y = horizon + (bottom - horizon) * t * t;
    ctx.strokeStyle = `rgba(${CYAN}, ${0.05 + 0.16 * t})`;
    ctx.beginPath();
    ctx.moveTo(inner, y);
    ctx.lineTo(size - inner, y);
    ctx.stroke();
  }

  // Columns all converge on the vanishing point at the horizon centre.
  for (let column = 0; column <= FLOOR_COLUMNS; column++) {
    const x = inner + span * (column / FLOOR_COLUMNS);
    const fade = ctx.createLinearGradient(size / 2, horizon, x, bottom);
    fade.addColorStop(0, `rgba(${CYAN}, 0)`);
    fade.addColorStop(1, `rgba(${CYAN}, 0.2)`);
    ctx.strokeStyle = fade;
    ctx.beginPath();
    ctx.moveTo(size / 2, horizon);
    ctx.lineTo(x, bottom);
    ctx.stroke();
  }
  ctx.restore();

  const seam = ctx.createLinearGradient(inner, 0, size - inner, 0);
  seam.addColorStop(0, `rgba(${CYAN}, 0)`);
  seam.addColorStop(0.5, `rgba(${CYAN}, 0.55)`);
  seam.addColorStop(1, `rgba(${CYAN}, 0)`);
  ctx.strokeStyle = seam;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(inner, horizon);
  ctx.lineTo(size - inner, horizon);
  ctx.stroke();

  const vignette = ctx.createRadialGradient(
    size / 2, size / 2, span * 0.34,
    size / 2, size / 2, span * 0.74
  );
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, "rgba(0, 0, 0, 0.6)");
  ctx.fillStyle = vignette;
  ctx.fillRect(inner, inner, span, span);
}

function paintBloom(ctx, layout) {
  ctx.lineJoin = "round";
  ctx.shadowColor = `rgba(${CYAN}, 0.9)`;
  ctx.shadowBlur = 16;
  ctx.strokeStyle = `rgba(${CYAN}, 0.85)`;
  ctx.lineWidth = 2.5;
  strokeWirePaths(ctx, layout);
  ctx.shadowBlur = 0;
}

function paintWires(ctx, layout) {
  ctx.lineJoin = "round";
  ctx.strokeStyle = `rgba(${CYAN}, 0.3)`;
  ctx.lineWidth = 1.4;
  strokeWirePaths(ctx, layout);

  layout.nodes.forEach(node => {
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.r + 1.5, 0, TAU);
    ctx.fillStyle = "#02030a";
    ctx.fill();
    ctx.strokeStyle = `rgba(${CYAN}, ${node.hub ? 0.7 : 0.5})`;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  });
}

function drawPulses(ctx, layout, time) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  layout.pulses.forEach(pulse => {
    const wire = layout.wires[pulse.wire];
    const head = positiveMod(time * pulse.speed + pulse.offset * wire.length, wire.length);
    const tail = Math.max(0, head - pulse.tail);
    if (head - tail < 1) return;

    const b = pulse.brightness;
    tracePartial(ctx, wire, tail, head);
    ctx.strokeStyle = `rgba(${pulse.color}, ${0.14 * b})`;
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.strokeStyle = `rgba(${pulse.color}, ${0.5 * b})`;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = `rgba(${HOT_CORE}, ${0.9 * b})`;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    const [hx, hy] = pointAt(wire, head);
    ctx.fillStyle = `rgba(${HOT_CORE}, ${b})`;
    ctx.beginPath();
    ctx.arc(hx, hy, 2.4, 0, TAU);
    ctx.fill();
  });
}

function drawNodeTwinkle(ctx, layout, time) {
  layout.nodes.forEach(node => {
    const twinkle = 0.5 + 0.5 * Math.sin(time * 1.8 + node.phase);
    ctx.fillStyle = `rgba(${CYAN}, ${0.25 + 0.5 * twinkle})`;
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.r, 0, TAU);
    ctx.fill();
  });
}

function drawScanBand(ctx, size, time) {
  const inner = ARENA_INSET;
  const span = size - inner * 2;
  const y = inner + positiveMod(time * 34, span);
  const band = ctx.createLinearGradient(0, y - 50, 0, y + 50);
  band.addColorStop(0, `rgba(${CYAN}, 0)`);
  band.addColorStop(0.5, `rgba(${CYAN}, 0.07)`);
  band.addColorStop(1, `rgba(${CYAN}, 0)`);
  ctx.fillStyle = band;
  ctx.fillRect(inner, y - 50, span, 100);
}

// Offscreen canvases only exist in the browser. Headless/SSR runs (and test
// mocks) get null, and the stage falls back to a plain fill.
function createLayer(size) {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  return ctx ? { canvas, ctx } : null;
}

export class ArenaStage {
  constructor(size) {
    this.size = size;
    this.layout = buildCircuitLayout(size);
    this.floor = createLayer(size);
    this.bloom = createLayer(size);
    this.wires = createLayer(size);
    this.ready = Boolean(this.floor && this.bloom && this.wires);
    if (this.ready) {
      paintFloor(this.floor.ctx, size);
      paintBloom(this.bloom.ctx, this.layout);
      paintWires(this.wires.ctx, this.layout);
    }
  }

  // Called once per frame from the arena's draw pass, after the playable clip
  // is applied and before fighters and particles.
  draw(ctx, time, { glowScale = 1 } = {}) {
    const t = Number.isFinite(time) ? time : 0;
    const size = this.size;
    const inner = ARENA_INSET;
    const span = size - inner * 2;

    ctx.save();
    ctx.beginPath();
    ctx.rect(inner, inner, span, span);
    ctx.clip();

    if (!this.ready) {
      ctx.fillStyle = "#02030a";
      ctx.fillRect(inner, inner, span, span);
      ctx.restore();
      return;
    }

    ctx.drawImage(this.floor.canvas, 0, 0);

    // The glow breathes slowly and is scaled by graphics quality (zero on low).
    const bloomAlpha = Math.min(Math.max(glowScale, 0), 1) * (0.75 + 0.25 * Math.sin(t * 1.4));
    if (bloomAlpha > 0) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = bloomAlpha;
      ctx.drawImage(this.bloom.canvas, 0, 0);
      ctx.globalAlpha = 1;
    }

    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(this.wires.canvas, 0, 0);
    drawScanBand(ctx, size, t);

    ctx.globalCompositeOperation = "lighter";
    drawPulses(ctx, this.layout, t);
    drawNodeTwinkle(ctx, this.layout, t);
    ctx.restore();
  }
}

const stageCache = new Map();

export function getArenaStage(size) {
  let stage = stageCache.get(size);
  if (!stage) {
    stage = new ArenaStage(size);
    stageCache.set(size, stage);
  }
  return stage;
}
