// Graphics quality levels. Each level sets how much visual work a battle does.

export const GRAPHICS_LEVELS = Object.freeze(["low", "medium", "high"]);

export const DEFAULT_GRAPHICS_QUALITY = "high";

// glowScale multiplies every shadowBlur, so 0 removes glow entirely.
export const GRAPHICS_PROFILES = Object.freeze({
  low: { glowScale: 0, particleDensity: 0.4, maxParticles: 300, replayInterval: 0.5 },
  medium: { glowScale: 0.5, particleDensity: 0.8, maxParticles: 700, replayInterval: 0.3 },
  high: { glowScale: 1, particleDensity: 1.35, maxParticles: 1400, replayInterval: 0.2 }
});

export function graphicsProfile(level) {
  return GRAPHICS_PROFILES[level] ?? GRAPHICS_PROFILES[DEFAULT_GRAPHICS_QUALITY];
}

// Scales every shadowBlur write on this context, so glow is adjusted across all draw code at once.
export function applyGlowScale(ctx, scale) {
  const native = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(ctx), "shadowBlur");
  Object.defineProperty(ctx, "shadowBlur", {
    configurable: true,
    get: () => native.get.call(ctx),
    set: value => native.set.call(ctx, Number(value) * scale)
  });
}
