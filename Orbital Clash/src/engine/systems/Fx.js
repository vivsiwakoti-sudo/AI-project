// Shared effect drawing helpers.
//
// Every helper draws in ARENA coordinates and guards itself with ctx.save()/restore()
// so a caller can never leak canvas state (fillStyle, shadow, transforms) into the
// next fighter's draw call.

const TAU = Math.PI * 2;

export function glowCircle(ctx, x, y, radius, color, opts = {}) {
  const { alpha = 1, blur = radius * 1.6, core = "rgba(255,255,255,0.9)", coreScale = 0.4 } = opts;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowBlur = blur;
  ctx.shadowColor = color;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fill();
  if (coreScale > 0) {
    ctx.shadowBlur = 0;
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(x, y, radius * coreScale, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

export function shockwaveRing(ctx, x, y, radius, color, opts = {}) {
  const { alpha = 0.8, lineWidth = 3, dash = null, rotation = 0 } = opts;
  ctx.save();
  if (dash) ctx.setLineDash(dash);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.shadowBlur = lineWidth * 4;
  ctx.shadowColor = color;
  ctx.translate(x, y);
  if (rotation) ctx.rotate(rotation);
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(radius, 0.5), 0, TAU);
  ctx.stroke();
  ctx.restore();
}

// Expanding ring driven by a 0..1 progress value (used for impacts and burst telegraphs).
export function expandingRing(ctx, x, y, progress, startRadius, endRadius, color, opts = {}) {
  const p = Math.max(0, Math.min(1, progress));
  const radius = startRadius + (endRadius - startRadius) * p;
  shockwaveRing(ctx, x, y, radius, color, { alpha: (1 - p) * (opts.alpha ?? 0.9), lineWidth: opts.lineWidth ?? 3 });
}

export function lightningBolt(ctx, x1, y1, x2, y2, opts = {}) {
  const { color = "#8ef6ff", alpha = 1, lineWidth = 3, segments = 6, jitter = 14, blur = 14 } = opts;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.max(Math.hypot(dx, dy), 0.0001);
  const nx = -dy / length;
  const ny = dx / length;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = "round";
  ctx.shadowBlur = blur;
  ctx.shadowColor = color;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const offset = (Math.random() - 0.5) * jitter;
    ctx.lineTo(x1 + dx * t + nx * offset, y1 + dy * t + ny * offset);
  }
  ctx.lineTo(x2, y2);
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = Math.max(1, lineWidth * 0.4);
  ctx.stroke();
  ctx.restore();
}

export function slashArc(ctx, x, y, angle, radius, opts = {}) {
  const { spread = Math.PI * 0.55, alpha = 1, color = "rgba(255,255,255,0.9)", lineWidth = 5, blur = 16 } = opts;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.shadowBlur = blur;
  ctx.shadowColor = color;
  ctx.beginPath();
  ctx.arc(radius, 0, radius * 0.85, -spread / 2, spread / 2);
  ctx.stroke();

  ctx.globalAlpha = alpha * 0.6;
  ctx.lineWidth = Math.max(1, lineWidth * 0.35);
  ctx.beginPath();
  ctx.arc(radius + 6, 0, radius * 0.95, -spread / 2.4, spread / 2.4);
  ctx.stroke();
  ctx.restore();
}

export function trailLine(ctx, points, opts = {}) {
  if (!points || points.length < 2) return;
  const { color = "rgba(255,255,255,0.6)", lineWidth = 10, blur = 18 } = opts;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowBlur = blur;
  ctx.shadowColor = color;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();
  ctx.restore();
}

// Applies a squash-and-stretch deformation around the current origin. The
// caller must have translated to the body centre first. `angle` is the surface
// normal the impact came along; we flatten across it and stretch along it.
export function squashTransform(ctx, scaleX, scaleY, angle = 0) {
  ctx.rotate(angle);
  ctx.scale(scaleX, scaleY);
  ctx.rotate(-angle);
}

// Fading streak behind a fast-moving body. Points are oldest-first; each may
// carry its own life for a tapered tail.
export function motionTrail(ctx, points, color, opts = {}) {
  if (!points || points.length < 2) return;
  const { lineWidth = 10, alpha = 0.35, blur = 16 } = opts;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowBlur = blur;
  ctx.shadowColor = color;
  for (let i = 1; i < points.length; i++) {
    const t = i / points.length; // 0 (old) -> 1 (newest)
    ctx.globalAlpha = alpha * t;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth * (0.35 + t * 0.65);
    ctx.beginPath();
    ctx.moveTo(points[i - 1].x, points[i - 1].y);
    ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
  }
  ctx.restore();
}

export function hitFlash(ctx, x, y, radius, color, progress) {
  const p = Math.max(0, Math.min(1, progress));
  ctx.save();
  ctx.globalAlpha = (1 - p) * 0.85;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.shadowBlur = 10;
  ctx.shadowColor = color;
  ctx.beginPath();
  ctx.arc(x, y, radius * (0.8 + p * 0.7), 0, TAU);
  ctx.stroke();

  ctx.globalAlpha = (1 - p) * 0.5;
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * TAU + p * 1.2;
    const inner = radius * 0.9;
    const outer = radius * (1.15 + p * 0.9);
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner);
    ctx.lineTo(x + Math.cos(angle) * outer, y + Math.sin(angle) * outer);
    ctx.stroke();
  }
  ctx.restore();
}

// Rotating energy ring used for charge states (Solar Beam, Meteor, Black Hole, ...).
export function chargeAura(ctx, x, y, radius, progress, color, opts = {}) {
  const p = Math.max(0, Math.min(1, progress));
  const { rings = 3, blur = 12 } = opts;
  ctx.save();
  ctx.translate(x, y);
  ctx.shadowBlur = blur;
  ctx.shadowColor = color;
  for (let i = 0; i < rings; i++) {
    const ringProgress = (p * 1.4 + i / rings) % 1;
    ctx.globalAlpha = (1 - ringProgress) * 0.75;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 + (1 - ringProgress) * 2;
    ctx.beginPath();
    ctx.arc(0, 0, radius + ringProgress * radius * 0.9, 0, TAU);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.85;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, radius, -Math.PI / 2, -Math.PI / 2 + TAU * p);
  ctx.stroke();
  ctx.restore();
}

// A rectangle telegraph with corner brackets - shared by large AOE warnings.
export function zoneWarning(ctx, rect, progress, color, opts = {}) {
  const { corner = 26, lineWidth = 3, dash = [12, 8] } = opts;
  const blink = 0.35 + 0.35 * Math.sin(progress * Math.PI * 12);
  ctx.save();
  ctx.globalAlpha = blink;
  if (dash) ctx.setLineDash(dash);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.shadowBlur = 18;
  ctx.shadowColor = color;
  ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);

  ctx.setLineDash([]);
  ctx.globalAlpha = Math.min(1, blink + 0.25);
  ctx.lineWidth = lineWidth + 2;
  const corners = [
    [rect.x, rect.y, 1, 1],
    [rect.x + rect.width, rect.y, -1, 1],
    [rect.x, rect.y + rect.height, 1, -1],
    [rect.x + rect.width, rect.y + rect.height, -1, -1]
  ];
  corners.forEach(([cx, cy, sx, sy]) => {
    ctx.beginPath();
    ctx.moveTo(cx + sx * corner, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + sy * corner);
    ctx.stroke();
  });
  ctx.restore();
}

// Diagonal energy bands that read as a sweeping beam body.
export function beamColumn(ctx, x1, y1, x2, y2, width, color, time) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const length = Math.hypot(x2 - x1, y2 - y1);
  ctx.save();
  ctx.translate(x1, y1);
  ctx.rotate(angle);
  const gradient = ctx.createLinearGradient(0, -width / 2, 0, width / 2);
  gradient.addColorStop(0, "rgba(255,255,255,0)");
  gradient.addColorStop(0.3, color);
  gradient.addColorStop(0.5, "rgba(255,255,255,0.95)");
  gradient.addColorStop(0.7, color);
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.shadowBlur = width * 1.4;
  ctx.shadowColor = color;
  ctx.fillRect(0, -width / 2, length, width);

  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = 2;
  const bands = 5;
  for (let i = 0; i < bands; i++) {
    const t = ((time * 0.9) + i / bands) % 1;
    ctx.beginPath();
    ctx.moveTo(length * t, -width / 2);
    ctx.lineTo(length * t + width * 0.4, width / 2);
    ctx.stroke();
  }
  ctx.restore();
}

// Star burst for a critical/heavy hit. `progress` runs 0..1 across the effect's
// life; spikes flare out and thin as they go. Kept deliberately simple - eight
// strokes and one ring - so it can fire on every crit without cost.
export function critBurst(ctx, x, y, radius, progress, color = "#ffd166") {
  const p = Math.max(0, Math.min(1, progress));
  const alpha = 1 - p;
  ctx.save();
  ctx.globalAlpha = alpha * 0.95;
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.shadowBlur = 16;
  ctx.shadowColor = color;

  const spikes = 8;
  const spin = p * 0.9;
  const inner = radius * (1 + p * 0.35);
  const outer = radius * (1.7 + p * 1.6);
  ctx.lineWidth = 3 * (1 - p) + 1;
  ctx.beginPath();
  for (let i = 0; i < spikes; i++) {
    const a = (i / spikes) * TAU + spin;
    ctx.moveTo(x + Math.cos(a) * inner, y + Math.sin(a) * inner);
    ctx.lineTo(x + Math.cos(a) * outer, y + Math.sin(a) * outer);
  }
  ctx.stroke();

  // Bright shock ring snapping outward underneath the spikes.
  ctx.globalAlpha = alpha * 0.7;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(x, y, radius * (0.9 + p * 1.9), 0, TAU);
  ctx.stroke();
  ctx.restore();
}

// Ability-cast sigil. A single ring whose silhouette is chosen by `kind`, so a
// beam, a projectile and an AOE burst each read differently with one helper.
// The caller drives `progress` 0..1 over the cast window.
export function castSigil(ctx, x, y, radius, progress, color, kind = "burst") {
  const p = Math.max(0, Math.min(1, progress));
  const alpha = Math.sin(p * Math.PI) * 0.9; // fade in, then out
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.shadowBlur = 14;
  ctx.shadowColor = color;
  ctx.lineCap = "round";
  ctx.translate(x, y);

  if (kind === "beam") {
    // Concentric rings collapsing inward, reading as an energy draw-down.
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 3; i++) {
      const rr = radius * (2.2 - p * 1.4 - i * 0.3);
      if (rr <= 0) continue;
      ctx.globalAlpha = alpha * (0.9 - i * 0.25);
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, TAU);
      ctx.stroke();
    }
  } else if (kind === "projectile") {
    // A single ring plus a forward chevron pointing along the cast angle (drawn
    // rotated by the caller's own transform when they want a direction).
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, radius * (1 + p * 0.6), 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(radius * 0.6, -radius * 0.5);
    ctx.lineTo(radius * (1.2 + p * 0.8), 0);
    ctx.lineTo(radius * 0.6, radius * 0.5);
    ctx.stroke();
  } else if (kind === "aoe") {
    // Two dashed rings sweeping out, like a ground-tell pulse.
    ctx.setLineDash([10, 8]);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, radius * (1.2 + p * 2), 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = alpha * 0.7;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, radius * (0.7 + p * 1.4), 0, TAU);
    ctx.stroke();
  } else {
    // Default: a bright ring plus a short six-point flare.
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, radius * (1 + p * 0.9), 0, TAU);
    ctx.stroke();
    ctx.lineWidth = 2;
    const r0 = radius * 1.05;
    const r1 = radius * (1.5 + p * 0.8);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + p * 0.5;
      ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    }
    ctx.stroke();
  }
  ctx.restore();
}

export { TAU };