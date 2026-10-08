import { FighterBase } from "../FighterBase.js";
import { Projectile } from "../Projectile.js";
import { DamageSystem } from "../../systems/DamageSystem.js";
import { drawSpear } from "../../systems/Weapons.js";

class Spear extends Projectile {
    constructor(x, y, vx, vy, owner) {
        super(x, y, vx, vy, 8, owner);
        this.stuckTarget = null;
        this.stuckTime = 0;
        this.stuckDuration = 2.5 + Math.random() * 0.5; // 2-3 seconds
        this.isStuck = false;
        this.wallTarget = null; // {x, y} - which wall coordinate to pull to
        this.pullSpeed = 7; // pixels per frame (60fps ~= 420px/s)
        this.damageTimer = 0; // Timer for damage per second while stuck
        this.savedVx = 0; // Store original velocity
        this.savedVy = 0; // Store original velocity
    }

    setWallTarget(arenaSize) {
        const target = this.stuckTarget;
        const innerBoundary = 20;
        const minX = innerBoundary + target.radius;
        const maxX = arenaSize - innerBoundary - target.radius;
        const minY = innerBoundary + target.radius;
        const maxY = arenaSize - innerBoundary - target.radius;
        const directionX = this.vx / Math.hypot(this.vx, this.vy);
        const directionY = this.vy / Math.hypot(this.vx, this.vy);
        const intersections = [];

        if (directionX > 0) {
            intersections.push((maxX - target.x) / directionX);
        } else if (directionX < 0) {
            intersections.push((minX - target.x) / directionX);
        }

        if (directionY > 0) {
            intersections.push((maxY - target.y) / directionY);
        } else if (directionY < 0) {
            intersections.push((minY - target.y) / directionY);
        }

        const distance = Math.min(...intersections.filter(value => value > 0));
        this.wallTarget = {
            x: target.x + directionX * distance,
            y: target.y + directionY * distance
        };
    }

    update(dt, opponent) {
        if (this.isStuck && this.stuckTarget) {
            const arenaSize = 800;
            
            // Use the impact trajectory to choose the wall, with a safe fallback.
            if (!this.wallTarget) {
                this.setWallTarget(arenaSize);
            }
            
            // Slowly pull opponent along the spear's impact angle toward the wall.
            const dx = this.wallTarget.x - this.stuckTarget.x;
            const dy = this.wallTarget.y - this.stuckTarget.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > 0.1) {
                const moveDistance = Math.min(this.pullSpeed, distance);
                const moveX = (dx / distance) * moveDistance;
                const moveY = (dy / distance) * moveDistance;
                
                this.stuckTarget.x += moveX;
                this.stuckTarget.y += moveY;
            }

            const reachedWall = Math.hypot(
                this.wallTarget.x - this.stuckTarget.x,
                this.wallTarget.y - this.stuckTarget.y
            ) <= 0.1;
            
            // Keep opponent immobilized (stun)
            this.stuckTarget.vx = 0;
            this.stuckTarget.vy = 0;
            this.stuckTarget.isStunned = true;
            
            // Spear stays with opponent
            this.x = this.stuckTarget.x;
            this.y = this.stuckTarget.y;
            
            // Apply bonus damage only after the target reaches the wall.
            if (reachedWall) {
                this.damageTimer -= dt;
                if (this.damageTimer <= 0) {
                    // Impale ticks are a lingering effect; ignore the attack
                    // cooldown so they never block the Spearman's next throw.
                    DamageSystem.applyDamage(this.owner, this.stuckTarget, 2, "Body", { ignoreCooldown: true });
                    this.damageTimer = 1; // Damage every 1 second
                }
            }
            
            this.stuckTime -= dt;
            if (this.stuckTime <= 0) {
                // Restore opponent's original velocity and free them
                this.stuckTarget.vx = this.savedVx;
                this.stuckTarget.vy = this.savedVy;
                this.stuckTarget.isStunned = false;
                this.active = false;
            }
            return;
        }
        super.update(dt);
    }
    
    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        
        const shaftLength = 32;

        if (!this.isStuck) {
            // Angle the spear in direction of travel
            ctx.rotate(Math.atan2(this.vy, this.vx));
            drawSpear(ctx, { length: shaftLength, head: 14 });
        } else {
            // Spear stuck in opponent - render perpendicular and larger
            ctx.rotate(Math.PI / 4);
            drawSpear(ctx, { length: shaftLength + 8, head: 16, glow: "#ffffff" });

            // Energy pulse around stuck spear
            const pulse = Math.sin(Date.now() / 100) * 0.5 + 0.5;
            ctx.strokeStyle = `rgba(220, 235, 255, ${pulse * 0.6})`;
            ctx.lineWidth = 2;
            ctx.shadowBlur = 10;
            ctx.shadowColor = "#dfe8ff";
            ctx.beginPath();
            ctx.arc(12, 0, 10 + pulse * 4, 0, Math.PI * 2);
            ctx.stroke();
        }
        
        ctx.restore();
    }
}

export class Spearman extends FighterBase {
    constructor(data, x, y) {
        super(data, x, y);
        this.projectiles = [];
        this.spearCooldown = 0;
        this.spearAngle = 0;
    }

    update(dt, opponent) {
        super.update(dt, opponent);
        this.spearCooldown -= dt;
        
        // The thrown spear is an actual missile that can miss (and lodge in the
        // wall), so it flies at the SKINNY fighter - the one this class is aimed
        // at - rather than homing onto whoever is nearest. This is deliberately
        // NOT "nearest": locking the flight onto the closest body made the spear
        // swerve mid-air, so it never missed and the whole dodge/miss mechanic
        // evaporated.
        if (opponent) {
            this.spearAngle = Math.atan2(opponent.y - this.y, opponent.x - this.x);
        }

        // Update spears
        this.projectiles.forEach(spear => {
            spear.update(dt, opponent);

            // Hit detection (only if not already stuck). A thrown spear is a
            // travelling hitbox: it has to be able to impale ANY fighter it
            // crosses, not only the one opponent this class happens to be aiming
            // at, or the other two fighters of a four-way brawl could walk through
            // it unharmed.
            if (!spear.isStuck && !spear.active) return;
            if (!spear.isStuck) {
                const candidates = this.victims?.length ? this.victims : (opponent ? [opponent] : []);
                const struck = candidates.find(f => f && !f.isDead
                    && DamageSystem.checkHitbox({x: spear.x, y: spear.y, radius: 5}, f, "Body"));
                if (struck) {
                    // Apply initial impact damage. The spear is handed over so a parry
                    // can knock it aside instead of letting it pin the target.
                    // A parried spear is consumed here: left active it would keep
                    // re-testing the same parry every frame for as long as it
                    // travelled through the victim, and would keep pinning them.
                    if (!DamageSystem.applyDamage(this, struck, 5, "Projectile", { projectile: spear })) {
                        spear.active = false;
                        return;
                    }

                    // Save opponent's current velocity to restore later
                    spear.savedVx = struck.vx;
                    spear.savedVy = struck.vy;

                    // Pin opponent to wall and stun
                    spear.isStuck = true;
                    spear.stuckTarget = struck;
                    spear.stuckTime = spear.stuckDuration;
                    spear.setWallTarget(800);
                    struck.isStunned = true;
                    struck.vx = 0;
                    struck.vy = 0;
                }
            }
        });
        this.projectiles = this.projectiles.filter(s => s.active);

        // Throw spear
        if (this.spearCooldown <= 0 && opponent) {
            const angle = Math.atan2(opponent.y - this.y, opponent.x - this.x);
            // 50% faster than the original 8 px/frame.
            const vx = Math.cos(angle) * 12;
            const vy = Math.sin(angle) * 12;
            this.projectiles.push(new Spear(this.x, this.y, vx, vy, this));
            this.spearCooldown = 3.5;
        }
    }

    draw(ctx) {
        super.draw(ctx);
        if (this.isDead || this.health <= 0) return;
        
        this.projectiles.forEach(spear => {
            spear.draw(ctx);
        });
        
        const attachedOffset = this.radius + 10;
        const spearLength = this.radius + 34;

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.spearAngle);

        // Mount the spear from the side of the body, pointing straight forward.
        const mountX = attachedOffset;

        ctx.translate(mountX, 0);

        // Spear: turned shaft, bound collar and leaf-shaped blade.
        drawSpear(ctx, { length: spearLength, head: 18 });

        // Cooldown indicator glow (shows charge)
        const chargeProgress = 1 - (this.spearCooldown / 3.5);
        if (chargeProgress > 0.3) {
            const charge = ctx.createRadialGradient(spearLength, 0, 0, spearLength, 0, 16);
            charge.addColorStop(0, `rgba(255, 255, 255, ${chargeProgress * 0.8})`);
            charge.addColorStop(1, "rgba(200, 220, 255, 0)");
            ctx.fillStyle = charge;
            ctx.beginPath();
            ctx.arc(spearLength, 0, 16, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }
}
