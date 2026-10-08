// Arena stage rendering.
//
// The battle screen should read as a dedicated competitive stage rather than a
// plain black square. Everything here is PURE PRESENTATION: it draws under the
// fighters and never touches simulation state, hitboxes or the playable bounds.
//
// Performance is the whole reason this is a separate module:
//   - The expensive part (dark backdrop, grid, vignette, corner brackets) is
//     rasterised ONCE into an offscreen canvas and blitted per frame. That turns
//     hundreds of grid strokes per frame into a single drawImage.
//   - Only a handful of cheap, time-driven ambient elements are drawn live
//     (a slow scanline sweep and a pulsing boundary glow), so the stage stays
//     smooth with four fighters and simultaneous abilities.
//
// The playable area is [20, 20]..[size-20, size-20], matching the arena's own
// border and clip rectangle, so the stage frame always lines up with the
// boundary fighters actually bounce off.

const TAU = Math.PI * 2;

// Matches Arena.jsx: fighters bounce off a border inset 20px from the canvas.
export const ARENA_INSET = 20;

function makeStaticLayer(size) {
  // Offscreen canvas is only created in the browser; a headless/SSR import must
  // not throw.
  if (typeof document === "undefined") return null;
  const layer = document.createElement("canvas");
  layer.width = size;
  layer.height = size;
  const ctx = layer.getContext("2d");
  if (!ctx) return null;

  const inner = ARENA_INSET;
  const innerSize = size - ARENA_INSET * 2;

  // --- Dark stage floor: near-black with a faint blue radial lift -------
  const floor = ctx.createRadialGradient(
    size / 2, size / 2, size * 0.1,
    size / 2, size / 2, size * 0.72
  );
  floor.addColorStop(0, "#0a1120");
  floor.addColorStop(0.55, "#060a14");
  floor.addColorStop(1, "#02030a");
  ctx.fillStyle = floor;
  ctx.fillRect(0, 0, size, size);

  // --- Subtle grid, clipped to the playable area ------------------------
  ctx.save();
  ctx.beginPath();
  ctx.rect(inner, inner, innerSize, innerSize);
  ctx.clip();

  const cell = 40;
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(0, 242, 255, 0.05)";
  ctx.beginPath();
  for (let x = inner; x <= size - inner; x += cell) {
    ctx.moveTo(x, inner);
    ctx.lineTo(x, size - inner);
  }
  for (let y = inner; y <= size - inner; y += cell) {
    ctx.moveTo(inner, y);
    ctx.lineTo(size - inner, y);
  }
  ctx.stroke();

  // Stronger centre cross-hair lines, so the stage has an obvious centre.
  ctx.strokeStyle = "rgba(47, 123, 255, 0.10)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(size / 2, inner);
  ctx.lineTo(size / 2, size - inner);
  ctx.moveTo(inner, size / 2);
  ctx.lineTo(size - inner, size / 2);
  ctx.stroke();

  // Centre ring: a clean geometric landmark that never obscures fighters.
  ctx.strokeStyle = "rgba(0, 242, 255, 0.10)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 96, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 150, 0, TAU);
  ctx.stroke();

  // Corner notches inside the playable area for a "stage" feel.
  ctx.strokeStyle = "rgba(0, 242, 255, 0.18)";
  ctx.lineWidth = 2;
  const notch = 26;
  const corners = [
    [inner, inner, 1, 1],
    [size - inner, inner, -1, 1],
    [inner, size - inner, 1, -1],
    [size - inner, size - inner, -1, -1]
  ];
  corners.forEach(([cx, cy, sx, sy]) => {
    ctx.beginPath();
    ctx.moveTo(cx + sx * notch, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + sy * notch);
    ctx.stroke();
  });

  // --- Vignette: darkens the edges so the centre stage reads as the focus.
  const vignette = ctx.createRadialGradient(
    size / 2, size / 2, innerSize * 0.32,
    size / 2, size / 2, innerSize * 0.72
  );
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, "rgba(0, 0, 0, 0.55)");
  ctx.fillStyle = vignette;
  ctx.fillRect(inner, inner, innerSize, innerSize);

  ctx.restore();

  return layer;
}

export class ArenaStage {
  constructor(size) {
    this.size = size;
    this.staticLayer = makeStaticLayer(size);
  }

  // Draws the cached stage, then the cheap live ambient layer on top. Called
  // once per frame from the arena's draw pass, before fighters and particles.
  draw(ctx, time) {
    const size = this.size;

    // Static stage (grid, vignette, floor) - one blit.
    if (this.staticLayer) {
      ctx.drawImage(this.staticLayer, 0, 0);
    } else {
      ctx.fillStyle = "#02030a";
      ctx.fillRect(0, 0, size, size);
    }

    const inner = ARENA_INSET;
    const innerSize = size - inner * 2;

    ctx.save();
    ctx.beginPath();
    ctx.rect(inner, inner, innerSize, innerSize);
    ctx.clip();

    // --- Slow scanline sweep: very subtle ambient motion -----------------
    const sweepY = inner + ((time * 26) % innerSize);
    const sweep = ctx.createLinearGradient(0, sweepY - 60, 0, sweepY + 60);
    sweep.addColorStop(0, "rgba(0, 242, 255, 0)");
    sweep.addColorStop(0.5, "rgba(0, 242, 255, 0.05)");
    sweep.addColorStop(1, "rgba(0, 242, 255, 0)");
    ctx.fillStyle = sweep;
    ctx.fillRect(inner, sweepY - 60, innerSize, 120);

    ctx.restore();
  }

  // The stage boundary frame, drawn OUTSIDE the clip so it always reads as the
  // crisp edge of the stage. Pulses gently so the boundary feels alive without
  // drawing attention away from the fight.
  drawBoundary(ctx, time, { danger = false } = {}) {
    const size = this.size;
    const inner = ARENA_INSET;
    const innerSize = size - inner * 2;
    const pulse = 0.5 + 0.5 * Math.sin(time * 1.6);
    const accent = danger ? "#ff4d6d" : "#00f2ff";

    ctx.save();

    // Outer soft glow line.
    ctx.globalAlpha = 0.28 + pulse * 0.22;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 6;
    ctx.shadowBlur = 24;
    ctx.shadowColor = accent;
    ctx.strokeRect(inner, inner, innerSize, innerSize);

    // Crisp inner border.
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 2;
    ctx.shadowBlur = 10;
    ctx.strokeRect(inner, inner, innerSize, innerSize);

    ctx.restore();
  }
}