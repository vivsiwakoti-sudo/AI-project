// Shared melee weapon renderers.
//
// Every helper draws along +x from the CURRENT origin (the caller translates to
// the fighter and rotates to the weapon angle) and saves/restores its own state.

const TAU = Math.PI * 2;

function steelGradient(ctx, halfWidth, light, mid, dark) {
  const g = ctx.createLinearGradient(0, -halfWidth, 0, halfWidth);
  g.addColorStop(0, light);
  g.addColorStop(0.45, mid);
  g.addColorStop(0.55, dark);
  g.addColorStop(1, mid);
  return g;
}

// Fading wedge behind a spinning weapon. Drawn in fighter space BEFORE the
// weapon rotation. `direction` is +1 for clockwise spin, -1 for counter-clockwise.
export function weaponTrail(ctx, angle, direction, innerR, outerR, color, { sweep = 1, alpha = 0.45, steps = 6 } = {}) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowBlur = 6;
  ctx.shadowColor = color;
  for (let i = 0; i < steps; i++) {
    const a0 = angle - direction * sweep * (i / steps);
    const a1 = angle - direction * sweep * ((i + 1) / steps);
    ctx.globalAlpha = alpha * Math.pow(1 - i / steps, 2);
    ctx.beginPath();
    ctx.arc(0, 0, outerR, a0, a1, a1 < a0);
    ctx.arc(0, 0, innerR, a1, a0, a0 < a1);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function guard(ctx, x, span, thickness, color, trim) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.roundRect(x - thickness / 2, -span / 2, thickness, span, thickness / 2);
  ctx.fill();
  ctx.strokeStyle = trim;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function grip(ctx, from, to, width, color, wrap) {
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.fillStyle = color;
  ctx.fillRect(from, -width / 2, to - from, width);
  ctx.strokeStyle = wrap;
  ctx.lineWidth = 1;
  for (let x = from + 2; x < to; x += 3) {
    ctx.beginPath();
    ctx.moveTo(x, -width / 2);
    ctx.lineTo(x + 2, width / 2);
    ctx.stroke();
  }
  ctx.restore();
}

function pommel(ctx, x, radius, color, gem) {
  ctx.save();
  ctx.shadowBlur = gem ? 8 : 0;
  ctx.shadowColor = gem || color;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, 0, radius, 0, TAU);
  ctx.fill();
  if (gem) {
    ctx.fillStyle = gem;
    ctx.beginPath();
    ctx.arc(x, 0, radius * 0.5, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

// Straight double-edged sword with a bevelled blade, fuller, guard and grip.
export function drawSword(ctx, {
  start, length, width = 10,
  light = "#f4f8ff", mid = "#b9c4d2", dark = "#6c7888",
  glow = null, glowBlur = 8,
  guardColor = "#d4a72c", guardTrim = "#7a5a10", guardSpan = null,
  gripColor = "#3a2418", wrapColor = "#1d110b",
  pommelColor = "#d4a72c", gem = null
}) {
  const hw = width / 2;
  const shoulder = start + length * 0.84;
  ctx.save();

  if (glow) {
    ctx.shadowBlur = glowBlur;
    ctx.shadowColor = glow;
  }
  ctx.fillStyle = steelGradient(ctx, hw, light, mid, dark);
  ctx.beginPath();
  ctx.moveTo(start, -hw);
  ctx.lineTo(shoulder, -hw);
  ctx.lineTo(start + length, 0);
  ctx.lineTo(shoulder, hw);
  ctx.lineTo(start, hw);
  ctx.closePath();
  ctx.fill();

  ctx.shadowBlur = 0;
  // Fuller: the darker groove that makes it read as a forged blade.
  ctx.strokeStyle = "rgba(20, 30, 45, 0.45)";
  ctx.lineWidth = Math.max(1, width * 0.14);
  ctx.beginPath();
  ctx.moveTo(start + 4, 0);
  ctx.lineTo(start + length * 0.8, 0);
  ctx.stroke();

  // Bright edge catching the light, plus a glint near the tip.
  ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(start, -hw + 0.6);
  ctx.lineTo(shoulder, -hw + 0.6);
  ctx.lineTo(start + length - 1, 0);
  ctx.stroke();
  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.beginPath();
  ctx.arc(start + length * 0.9, 0, 1.4, 0, TAU);
  ctx.fill();

  const gripLen = Math.max(8, width * 1.1);
  guard(ctx, start, guardSpan ?? width * 2.1, Math.max(4, width * 0.45), guardColor, guardTrim);
  grip(ctx, start - gripLen - 2, start - 2, Math.max(3.5, width * 0.4), gripColor, wrapColor);
  pommel(ctx, start - gripLen - 3, Math.max(3, width * 0.38), pommelColor, gem);
  ctx.restore();
}

// Single-edged curved katana: slim blade with a wavy hamon line and a round tsuba.
export function drawKatana(ctx, { start, length, width = 6, glow = "#ff4d4d", edge = "#ffffff" }) {
  const hw = width / 2;
  const tip = start + length;
  ctx.save();
  ctx.shadowBlur = 6;
  ctx.shadowColor = glow;
  ctx.fillStyle = steelGradient(ctx, hw, "#f2f5fa", "#a9b3c2", "#5f6a7a");
  ctx.beginPath();
  ctx.moveTo(start, hw);
  ctx.lineTo(start, -hw);
  ctx.quadraticCurveTo(start + length * 0.6, -hw - 3, tip, -hw - 4);
  ctx.quadraticCurveTo(tip - length * 0.1, hw * 0.4, start + length * 0.55, hw - 0.5);
  ctx.closePath();
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255,255,255,0.65)";
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(start + 2, hw * 0.2);
  for (let x = 0; x <= 1; x += 0.1) {
    ctx.lineTo(start + 2 + (length - 8) * x, hw * 0.2 - 3 * x + Math.sin(x * 18) * 0.7);
  }
  ctx.stroke();
  ctx.strokeStyle = edge;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(start, -hw + 0.5);
  ctx.quadraticCurveTo(start + length * 0.6, -hw - 2.5, tip, -hw - 3.5);
  ctx.stroke();

  ctx.fillStyle = "#b8862b";
  ctx.beginPath();
  ctx.ellipse(start, 0, 2.2, hw + 3.2, 0, 0, TAU);
  ctx.fill();
  grip(ctx, start - 11, start - 2, 4, "#2a1214", "#8c1f2c");
  pommel(ctx, start - 12, 2.6, "#b8862b", null);
  ctx.restore();
}

// Curved dagger / kunai with a ring pommel.
export function drawDagger(ctx, { start, length, width = 6, glow = "#dfe8ff" }) {
  const hw = width / 2;
  const tip = start + length;
  ctx.save();
  ctx.shadowBlur = 6;
  ctx.shadowColor = glow;
  ctx.fillStyle = steelGradient(ctx, hw, "#ffffff", "#c3ccd8", "#707d8d");
  ctx.beginPath();
  ctx.moveTo(start, -hw);
  ctx.quadraticCurveTo(start + length * 0.55, -hw - 1.5, tip, 0);
  ctx.quadraticCurveTo(start + length * 0.55, hw + 1, start, hw);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(start + 1, -hw + 0.5);
  ctx.quadraticCurveTo(start + length * 0.55, -hw - 1, tip - 1, 0);
  ctx.stroke();

  guard(ctx, start, width * 2.4, 3, "#3b3b46", "#8d8d9c");
  grip(ctx, start - 9, start - 1.5, 3.6, "#5a0f18", "#2b060a");
  ctx.strokeStyle = "#d4a72c";
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(start - 13, 0, 4, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

// Hooked scythe: wooden snath, steel crescent blade with a glowing edge.
export function drawScythe(ctx, { start, length, glow = "#8b2cff", edge = "#e2b8ff", body = "#4a1590", intensity = 0 }) {
  const bs = start + 5;
  ctx.save();

  // Snath.
  const wood = ctx.createLinearGradient(0, -3, 0, 3);
  wood.addColorStop(0, "#4a3a58");
  wood.addColorStop(0.5, "#241532");
  wood.addColorStop(1, "#150c1e");
  ctx.fillStyle = wood;
  ctx.shadowBlur = 8;
  ctx.shadowColor = glow;
  ctx.fillRect(start - 10, -2.6, 22, 5.2);
  ctx.fillStyle = "#b99a46";
  ctx.fillRect(start + 6, -3.4, 3, 6.8);

  // Blade body with a vertical gradient from steel to deep violet.
  const blade = ctx.createLinearGradient(0, -16, 0, 11);
  blade.addColorStop(0, "#d9c4f5");
  blade.addColorStop(0.45, body);
  blade.addColorStop(1, "#1d0840");
  ctx.shadowBlur = 6 + intensity * 4;
  ctx.fillStyle = blade;
  ctx.beginPath();
  ctx.moveTo(bs, 0);
  ctx.quadraticCurveTo(bs + length * 0.65, -17, bs + length, -6);
  ctx.quadraticCurveTo(bs + length * 0.65, 5, bs + 7, 11);
  ctx.lineTo(bs + 3, 5);
  ctx.closePath();
  ctx.fill();

  // Glowing cutting edge with a white-hot core.
  ctx.strokeStyle = edge;
  ctx.shadowBlur = 7;
  ctx.shadowColor = glow;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(bs + 2, 0);
  ctx.quadraticCurveTo(bs + length * 0.65, -17, bs + length, -6);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Spine rivets.
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath();
    ctx.arc(bs + length * 0.2 * i + 4, -3 - i * 0.6, 1.2, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

// Wooden stake: tapered, banded in iron, with a blood-soaked point.
export function drawStake(ctx, { start, length, glow = "#ff2038" }) {
  const tip = start + length;
  ctx.save();
  const wood = ctx.createLinearGradient(0, -4, 0, 4);
  wood.addColorStop(0, "#b08a5c");
  wood.addColorStop(0.5, "#7b5a36");
  wood.addColorStop(1, "#3f2c18");
  ctx.fillStyle = wood;
  ctx.shadowBlur = 6;
  ctx.shadowColor = glow;
  ctx.beginPath();
  ctx.moveTo(start - 4, -3.5);
  ctx.lineTo(start + length * 0.6, -3.2);
  ctx.lineTo(tip, 0);
  ctx.lineTo(start + length * 0.6, 3.2);
  ctx.lineTo(start - 4, 3.5);
  ctx.closePath();
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(30, 18, 8, 0.55)";
  ctx.lineWidth = 0.8;
  for (const y of [-1.5, 1.2]) {
    ctx.beginPath();
    ctx.moveTo(start, y);
    ctx.lineTo(start + length * 0.7, y * 0.6);
    ctx.stroke();
  }
  ctx.fillStyle = "#3a3d46";
  ctx.fillRect(start + 3, -4, 2.5, 8);
  ctx.fillRect(start + length * 0.38, -3.8, 2.5, 7.6);

  // Blood on the point.
  const blood = ctx.createLinearGradient(start + length * 0.55, 0, tip, 0);
  blood.addColorStop(0, "rgba(160, 10, 30, 0)");
  blood.addColorStop(1, "rgba(220, 20, 50, 0.95)");
  ctx.fillStyle = blood;
  ctx.shadowBlur = 7;
  ctx.shadowColor = glow;
  ctx.beginPath();
  ctx.moveTo(start + length * 0.55, -3);
  ctx.lineTo(tip, 0);
  ctx.lineTo(start + length * 0.55, 3);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// Double-bitted war axe head centred on the origin; the handle trails behind (-x).
export function drawAxeHead(ctx, { size = 10, glow = "#ff2a2a", intensity = 0 }) {
  ctx.save();
  // Handle.
  ctx.shadowBlur = 0;
  const wood = ctx.createLinearGradient(0, -2.5, 0, 2.5);
  wood.addColorStop(0, "#8a5a32");
  wood.addColorStop(1, "#3b2412");
  ctx.fillStyle = wood;
  ctx.fillRect(-size * 2.8, -2.4, size * 2.8, 4.8);

  // Glow halo that builds with blade speed.
  ctx.shadowBlur = 6 + intensity * 7;
  ctx.shadowColor = glow;
  const steel = ctx.createLinearGradient(0, -size * 1.5, 0, size * 1.5);
  steel.addColorStop(0, "#f2d4d4");
  steel.addColorStop(0.5, "#8d97a6");
  steel.addColorStop(1, "#3c2229");
  ctx.fillStyle = steel;

  // Two crescent bits, top and bottom.
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(-size * 0.3, 0);
    ctx.quadraticCurveTo(-size * 0.9, s * size * 1.5, size * 0.4, s * size * 1.45);
    ctx.quadraticCurveTo(size * 0.9, s * size * 0.7, size * 0.3, 0);
    ctx.closePath();
    ctx.fill();
  }

  ctx.shadowBlur = 5;
  ctx.strokeStyle = `rgba(255, ${Math.round(120 - intensity * 80)}, ${Math.round(120 - intensity * 80)}, 0.95)`;
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(-size * 0.75, s * size * 1.1);
    ctx.quadraticCurveTo(-size * 0.2, s * size * 1.55, size * 0.4, s * size * 1.45);
    ctx.stroke();
  }

  ctx.shadowBlur = 0;
  ctx.fillStyle = "#b8862b";
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.32, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// Comet-style glowing bolt: tapered tail behind (px,py) along the reverse of (vx,vy).
export function drawBolt(ctx, px, py, vx, vy, { color = "#ffd54a", core = "#ffffff", radius = 5, tail = 28 } = {}) {
  const speed = Math.hypot(vx, vy) || 1;
  const ux = vx / speed;
  const uy = vy / speed;
  ctx.save();
  const g = ctx.createLinearGradient(px, py, px - ux * tail, py - uy * tail);
  g.addColorStop(0, color);
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.strokeStyle = g;
  ctx.lineCap = "round";
  ctx.shadowBlur = 14;
  ctx.shadowColor = color;
  ctx.lineWidth = radius * 1.6;
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(px - ux * tail, py - uy * tail);
  ctx.stroke();

  const halo = ctx.createRadialGradient(px, py, 0, px, py, radius * 2.2);
  halo.addColorStop(0, core);
  halo.addColorStop(0.35, color);
  halo.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(px, py, radius * 2.2, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// Spear drawn along +x from the origin: turned shaft, leaf blade, bound collar.
export function drawSpear(ctx, { length = 32, head = 14, glow = "#dfe8ff" } = {}) {
  ctx.save();
  const wood = ctx.createLinearGradient(0, -3, 0, 3);
  wood.addColorStop(0, "#b08a5c");
  wood.addColorStop(0.5, "#7b5a36");
  wood.addColorStop(1, "#3f2c18");
  ctx.fillStyle = wood;
  ctx.fillRect(-4, -2.5, length - head + 6, 5);

  ctx.fillStyle = "#b8862b";
  ctx.fillRect(length - head - 1, -3.4, 3, 6.8);
  ctx.fillStyle = "#c4151c";
  ctx.fillRect(-4, -3, 4, 6);

  ctx.shadowBlur = 7;
  ctx.shadowColor = glow;
  const blade = ctx.createLinearGradient(0, -7, 0, 7);
  blade.addColorStop(0, "#ffffff");
  blade.addColorStop(0.5, "#b9c4d2");
  blade.addColorStop(1, "#6c7888");
  ctx.fillStyle = blade;
  ctx.beginPath();
  ctx.moveTo(length + 4, 0);
  ctx.quadraticCurveTo(length - head * 0.4, -8, length - head, -2);
  ctx.lineTo(length - head, 2);
  ctx.quadraticCurveTo(length - head * 0.4, 8, length + 4, 0);
  ctx.closePath();
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(length - head + 1, 0);
  ctx.lineTo(length + 2, 0);
  ctx.stroke();
  ctx.restore();
}
