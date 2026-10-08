import { DamageSystem } from "./DamageSystem.js";

// Physics tuning ------------------------------------------------------------
// Velocities in this game are NORMALISED (roughly -1..1) and multiplied by
// `speed * 60` inside FighterBase.update, so a "speed" of 5 means ~5px/frame.
// We convert them back to px/second to reason about real bounce energy.
const FRAME_SCALE = 60;

// How much normal velocity survives a bounce. 1 = perfectly elastic, 0 = dead stop.
const WALL_RESTITUTION = 0.94;      // walls barely eat energy -> lively, pinbally
const FIGHTER_RESTITUTION = 1.05;   // fighters are a touch springier than walls
const MAX_SPEED_FACTOR = 2.15;      // hard cap so a bounce can never teleport a fighter
const MIN_SPEED_FACTOR = 0.45;      // a bounce never kills all momentum
const TANGENTIAL_FRICTION = 0.985;  // grazing hits keep sliding along the surface

// Below this separation speed, two touching fighters are treated as resting
// contact (nudged apart gently) instead of squashing each other into the wall.
const RESTING_CONTACT_SPEED = 6;

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

export class CollisionSystem {
  // Convert a normalised velocity into px/second for one fighter.
  static _toPixelSpeed(fighter) {
    return Math.max(0.001, (fighter.speed ?? 5) * FRAME_SCALE);
  }

  static _clampSpeed(fighter, factor = MAX_SPEED_FACTOR) {
    const limit = CollisionSystem._toPixelSpeed(fighter) * factor;
    const magnitude = Math.hypot(fighter.vx, fighter.vy);
    if (magnitude > limit) {
      const scale = limit / magnitude;
      fighter.vx *= scale;
      fighter.vy *= scale;
      return true;
    }
    return false;
  }

  // Reflect a velocity vector off a surface normal, preserving the tangential
  // component (with a little friction) and scaling the normal component by the
  // restitution. This is a proper reflection, not a naive `vx *= -1`.
  static _reflectVelocity(fighter, nx, ny, restitution, friction = TANGENTIAL_FRICTION) {
    const speed = CollisionSystem._toPixelSpeed(fighter);
    const vx = fighter.vx * speed;
    const vy = fighter.vy * speed;

    const dot = vx * nx + vy * ny; // component along the incoming normal
    // Only reverse the approaching component; tangentially-moving fighters
    // should slide along the wall rather than be flipped back the way they came.
    const normalX = nx * dot;
    const normalY = ny * dot;
    const tangentX = vx - normalX;
    const tangentY = vy - normalY;

    let newVx = tangentX * friction - normalX * restitution;
    let newVy = tangentY * friction - normalY * restitution;

    let newSpeed = Math.hypot(newVx, newVy);
    const minSpeed = speed * MIN_SPEED_FACTOR;
    if (newSpeed < minSpeed) {
      // Guarantee a visible rebound even on a near-perpendicular stall.
      const push = minSpeed / Math.max(newSpeed, 0.001);
      newVx *= push;
      newVy *= push;
      newSpeed = minSpeed;
    }

    fighter.vx = newVx / speed;
    fighter.vy = newVy / speed;
    CollisionSystem._clampSpeed(fighter);
    return newSpeed / speed; // 0..~2, how hard the bounce was (for feedback)
  }

  // Extra distance from the fighter's CENTRE to its wall-contact point, used by
  // classes whose weapon or effect genuinely draws past the body and would look
  // wrong clipped at the border.
  //
  // This defaults to 0 on purpose: every class's BODY should travel all the way
  // to the inner border and bounce there, so contact reads as hitting the wall.
  // Deriving this from `weaponReach` (as an earlier version did) wrongly pushed
  // every armed class inward, making them bounce before they ever touched the
  // border. Only a class that explicitly opts in with `wallMargin` is held back,
  // and the arena clip guarantees nothing can paint outside the border anyway.
  static visualMargin(fighter) {
    return Math.max(0, fighter.wallMargin ?? 0);
  }

  static resolveFighterWall(fighter, arenaSize = 800) {
    const INNER_BOUNDARY = 20; // Inner border offset
    // Keep the fighter far enough from the wall that its weapon and effects do
    // not draw outside the border.
    const radius = (fighter.radius ?? 0) + CollisionSystem.visualMargin(fighter);
    const hitWalls = [];

    if (fighter.x - radius < INNER_BOUNDARY) {
      fighter.x = INNER_BOUNDARY + radius;
      CollisionSystem._reflectVelocity(fighter, 1, 0, WALL_RESTITUTION);
      hitWalls.push("left");
    } else if (fighter.x + radius > arenaSize - INNER_BOUNDARY) {
      fighter.x = arenaSize - INNER_BOUNDARY - radius;
      CollisionSystem._reflectVelocity(fighter, -1, 0, WALL_RESTITUTION);
      hitWalls.push("right");
    }

    if (fighter.y - radius < INNER_BOUNDARY) {
      fighter.y = INNER_BOUNDARY + radius;
      CollisionSystem._reflectVelocity(fighter, 0, 1, WALL_RESTITUTION);
      hitWalls.push("top");
    } else if (fighter.y + radius > arenaSize - INNER_BOUNDARY) {
      fighter.y = arenaSize - INNER_BOUNDARY - radius;
      CollisionSystem._reflectVelocity(fighter, 0, -1, WALL_RESTITUTION);
      hitWalls.push("bottom");
    }

    if (hitWalls.length === 0) return false;

    // Squash toward the wall we hit so the bounce reads as physical contact.
    if (typeof fighter.applyDeflection === "function") {
      const nx = hitWalls.includes("left") ? 1 : hitWalls.includes("right") ? -1 : 0;
      const ny = hitWalls.includes("top") ? 1 : hitWalls.includes("bottom") ? -1 : 0;
      fighter.applyDeflection(nx, ny, Math.hypot(fighter.vx, fighter.vy), { source: "wall" });
    }

    const wallHit = hitWalls[0];
    if (fighter.onWallHit) fighter.onWallHit(wallHit);

    const momentum = fighter.statusEffects?.find(e => e.name === "MomentumBoost");
    if (momentum) {
      const hitIndex = momentum.wallHits ?? 0;
      momentum.wallHits = hitIndex + 1;
      const scale = 1 + hitIndex * 0.5;
      DamageSystem.applyDamage(null, fighter, 2 * scale, "Body", { ignoreCooldown: true });
      const particles = fighter.particleSystem;
      if (particles) particles.emitImpact(fighter.x, fighter.y, "#ffd7a1", 12 * scale);
    }

    return true;
  }

  static pushApart(fighter, x, y, hitRadius = 0) {
    const dx = fighter.x - x;
    const dy = fighter.y - y;
    const distance = Math.max(Math.hypot(dx, dy), 0.0001);
    const overlap = fighter.radius + hitRadius - distance;
    if (overlap <= 0) return false;
    const nx = dx / distance;
    const ny = dy / distance;
    fighter.x += nx * overlap;
    fighter.y += ny * overlap;
    return true;
  }

  // Impulse-based circle-vs-circle collision. Both fighters trade momentum
  // along the contact normal (weighted by mass = radius^2 so the bigger body
  // shoves the smaller one around) and keep their tangential motion, so hits
  // ricochet off at believable angles instead of both fighters reversing.
  static resolveFighterFighter(f1, f2) {
    const dx = f2.x - f1.x;
    const dy = f2.y - f1.y;
    const distance = Math.max(Math.sqrt(dx * dx + dy * dy), 0.0001);
    const minDistance = f1.radius + f2.radius;

    if (distance >= minDistance) return false;

    const overlap = minDistance - distance;
    const nx = dx / distance; // normal pointing from f1 -> f2
    const ny = dy / distance;

    // Mass from area so size differences actually matter.
    const m1 = Math.max(0.1, f1.radius * f1.radius);
    const m2 = Math.max(0.1, f2.radius * f2.radius);
    const totalMass = m1 + m2;

    // Positional correction: the heavier fighter resists being pushed.
    f1.x -= nx * overlap * (m2 / totalMass);
    f1.y -= ny * overlap * (m2 / totalMass);
    f2.x += nx * overlap * (m1 / totalMass);
    f2.y += ny * overlap * (m1 / totalMass);

    const s1 = CollisionSystem._toPixelSpeed(f1);
    const s2 = CollisionSystem._toPixelSpeed(f2);
    const v1n = (f1.vx * s1) * nx + (f1.vy * s1) * ny; // f1 velocity along normal
    const v2n = (f2.vx * s2) * nx + (f2.vy * s2) * ny; // f2 velocity along normal
    const relativeNormal = v2n - v1n;

    // Already separating? Don't double-bounce them.
    if (relativeNormal > 0) return true;

    if (-relativeNormal < RESTING_CONTACT_SPEED) {
      // Gentle resting contact (e.g. both pinned together): settle the overlap
      // without flipping either fighter's direction.
      return true;
    }

    const impulse = (-(1 + FIGHTER_RESTITUTION) * relativeNormal) / (1 / m1 + 1 / m2);
    const impulseX = impulse * nx;
    const impulseY = impulse * ny;

    // Apply the impulse, preserving each fighter's tangential velocity.
    let v1x = f1.vx * s1 - (impulseX / m1);
    let v1y = f1.vy * s1 - (impulseY / m1);
    let v2x = f2.vx * s2 + (impulseX / m2);
    let v2y = f2.vy * s2 + (impulseY / m2);

    // A little tangential friction so glancing blows scrub speed believably.
    const tx = -ny, ty = nx;
    const tan1 = v1x * tx + v1y * ty;
    const tan2 = v2x * tx + v2y * ty;
    const avgTan = (tan1 + tan2) / 2;
    const friction1 = (avgTan - tan1) * 0.08;
    const friction2 = (avgTan - tan2) * 0.08;
    v1x += tx * friction1; v1y += ty * friction1;
    v2x += tx * friction2; v2y += ty * friction2;

    f1.vx = v1x / s1;
    f1.vy = v1y / s1;
    f2.vx = v2x / s2;
    f2.vy = v2y / s2;

    CollisionSystem._clampSpeed(f1);
    CollisionSystem._clampSpeed(f2);

    // Bounce strength for feedback: how fast the collision was, normalised.
    const bounceStrength = clamp(Math.abs(relativeNormal) / (s1 * 1.4), 0, 1.6);

    if (typeof f1.applyDeflection === "function") {
      f1.applyDeflection(-nx, -ny, bounceStrength, { source: "fighter", other: f2 });
    }
    if (typeof f2.applyDeflection === "function") {
      f2.applyDeflection(nx, ny, bounceStrength, { source: "fighter", other: f1 });
    }

    return true;
  }
}
