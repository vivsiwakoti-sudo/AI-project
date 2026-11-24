import { FighterBase } from "../FighterBase.js";
import { DamageSystem } from "../../systems/DamageSystem.js";
import { EffectSystem } from "../../systems/EffectSystem.js";
import { audioManager } from "../../audio/AudioManager.js";

function rollNinjaEffect() {
    const roll = Math.random();
    if (roll < 0.33) return "fire";
    if (roll < 0.66) return "electric";
    return "shrink";
}

export class Ninja extends FighterBase {
    constructor(data, x, y) {
        super(data, x, y);
        this.ropeActive = false;
        this.ropeTimer = 0;
        this.cooldownTimer = 0;
        this.ropeDart = null;
        this.ropeSwing = 0;
        // Px/frame. The dart flies straight once launched and never re-aims.
        this.ropeDartSpeed = 14;
        // Effect (from NINJA_EFFECTS) applied to every dart hit, or null for the 33% random roll.
        this.fixedEffect = null;
    }

    setFixedEffect(id) {
        this.fixedEffect = id;
    }

    update(dt, opponent) {
        super.update(dt, opponent);
        // cooldownTimer is ticked by FighterBase; do not decrement it again here.

        if (!this.ropeActive && this.cooldownTimer <= 0 && opponent) {
            const leadX = opponent.x + opponent.vx * 10;
            const leadY = opponent.y + opponent.vy * 10;
            const dx = leadX - this.x;
            const dy = leadY - this.y;
            const dist = Math.hypot(dx, dy);

            const targetAngle = Math.atan2(dy, dx);
            const finalAngle = targetAngle;

            // The rope dart reaches 300px (spec), not the whole arena.
            if (dist <= 300) {
                this.ropeActive = true;
                this.ropeTimer = 1.2;
                this.ropeSwing = 0;
                this.lastAngle = finalAngle;
                this.useAbility();
                this.ropeDart = {
                    x: this.x,
                    y: this.y,
                    vx: Math.cos(finalAngle) * this.ropeDartSpeed,
                    vy: Math.sin(finalAngle) * this.ropeDartSpeed,
                    traveled: 0,
                    maxDistance: 300,
                    hit: false,
                    target: null,
                    savedVx: 0,
                    savedVy: 0
                };
                audioManager.playShotSfx("Ninja");
            }
        }

        if (this.ropeActive && this.ropeDart) {
            this.ropeTimer -= dt;
            this.ropeSwing += dt * 24;

            const dart = this.ropeDart;
            dart.x += dart.vx;
            dart.y += dart.vy;
            dart.traveled += Math.hypot(dart.vx, dart.vy);

            // The dart catches the first living fighter its line crosses, not only the one this class aimed at.
            const pool = this.reachableVictims(opponent);
            const hooked = dart.target;
            if (dart.hit && hooked && !hooked.isDead) {
                const pullX = this.x - hooked.x;
                const pullY = this.y - hooked.y;
                const pullDistance = Math.hypot(pullX, pullY);
                const pullSpeed = 12 * dt * 60;

                if (pullDistance > this.radius + hooked.radius) {
                    hooked.x += (pullX / pullDistance) * Math.min(pullSpeed, pullDistance);
                    hooked.y += (pullY / pullDistance) * Math.min(pullSpeed, pullDistance);
                }
                dart.arrived = Math.hypot(this.x - hooked.x, this.y - hooked.y) <= this.radius + hooked.radius;
                hooked.vx = 0;
                hooked.vy = 0;
                dart.x = hooked.x;
                dart.y = hooked.y;
            }

            if (!dart.hit) {
                const struck = pool.find(f => Math.hypot(f.x - dart.x, f.y - dart.y) < f.radius + 8);
                if (struck) {
                    // A dodged or deflected dart cannot pull or apply its effects.
                    if (!DamageSystem.applyDamage(this, struck, 11, "Melee", { ignoreCooldown: true })) {
                        this.ropeActive = false;
                        this.ropeDart = null;
                        this.cooldownTimer = this.cooldown || 6;
                        return;
                    }
                    dart.target = struck;
                    dart.hit = true;
                    dart.x = struck.x;
                    dart.y = struck.y;
                    dart.savedVx = struck.vx;
                    dart.savedVy = struck.vy;
                    if (struck.particleSystem) struck.particleSystem.emitImpact(struck.x, struck.y, "#d9d9d9", 18);

                    const hitEffect = this.fixedEffect ?? (Math.random() < 0.33 ? rollNinjaEffect() : null);
                    if (hitEffect === "fire") {
                        EffectSystem.addEffect(struck, {
                            name: "fire",
                            duration: 5,
                            tickTimer: 0,
                            onUpdate: (fighter, effect, elapsed) => {
                                effect.tickTimer += elapsed;
                                if (effect.tickTimer >= 1) {
                                    effect.tickTimer = 0;
                                    // A burn tick is a lingering effect, not the
                                    // Ninja's attack: passing no attacker keeps it
                                    // from arming the per-attacker damage
                                    // cooldown and blocking the next rope dart
                                    // for 0.5s out of every second.
                                    DamageSystem.applyDamage(null, fighter, 1, "Body", { ignoreCooldown: true });
                                }
                            }
                        });
                    } else if (hitEffect === "electric") {
                        EffectSystem.addEffect(struck, {
                            name: "electric",
                            duration: 2.5,
                            onEnd: (fighter) => { fighter.jitter = 0; }
                        });
                        DamageSystem.applyDamage(this, struck, 3, "Melee", { ignoreCooldown: true });
                    } else if (hitEffect === "shrink") {
                        const reducedMax = Math.max(1, struck.maxHealth * 0.8);
                        struck.maxHealth = reducedMax;
                        struck.health = Math.min(struck.health, struck.maxHealth);
                    }
                }
            }

            // The punch lands once the pull has brought the victim into reach. A dart
            // that misses ends at its full range; the timer is only a safety net.
            const pullDone = dart.hit ? (dart.arrived || !dart.target || dart.target.isDead) : dart.traveled >= dart.maxDistance;
            if (pullDone || this.ropeTimer <= 0) {
                const punched = dart.target;
                if (dart.hit && punched && !punched.isDead) {
                    // The punch that follows the pull.
                    DamageSystem.applyDamage(this, punched, 4, "Melee", { ignoreCooldown: true });
                    const angle = Math.atan2(punched.y - this.y, punched.x - this.x);
                    const dirX = Math.cos(angle);
                    const dirY = Math.sin(angle);

                    // Hand the victim their momentum back instead of leaving them
                    // frozen. The punch sets a guaranteed launch speed along the
                    // release direction, and their tangential momentum (motion
                    // *across* that line) is preserved so a shove never simply
                    // cancels out the speed they already had.
                    const savedVx = dart.savedVx || 0;
                    const savedVy = dart.savedVy || 0;
                    const along = savedVx * dirX + savedVy * dirY;   // component into the punch
                    const tangentX = savedVx - dirX * along;         // component perpendicular
                    const tangentY = savedVy - dirY * along;

                    const punch = 1.05;      // launch speed straight away from the ninja
                    const keepTangential = 0.7;
                    punched.vx = dirX * punch + tangentX * keepTangential;
                    punched.vy = dirY * punch + tangentY * keepTangential;

                    // Re-normalise so the victim never exceeds their own top speed.
                    const magnitude = Math.hypot(punched.vx, punched.vy);
                    if (magnitude > 1.4) {
                        punched.vx = (punched.vx / magnitude) * 1.4;
                        punched.vy = (punched.vy / magnitude) * 1.4;
                    }

                    if (punched.particleSystem) punched.particleSystem.emitImpact(punched.x, punched.y, "#bfefff", 20);
                }
                this.ropeActive = false;
                this.ropeDart = null;
                this.cooldownTimer = this.cooldown || 6;
            }
        }
    }

    draw(ctx) {
        super.draw(ctx);

        if (this.ropeActive && this.ropeDart) {
            const dart = this.ropeDart;
            const startX = this.x;
            const startY = this.y;
            const endX = dart.x;
            const endY = dart.y;
            const dx = endX - startX;
            const dy = endY - startY;
            const dist = Math.hypot(dx, dy) || 1;
            const segments = 12;

            ctx.save();
            ctx.lineCap = "round";
            ctx.lineJoin = "round";

            // Braided cord body
            for (let braid = 0; braid < 3; braid++) {
                ctx.beginPath();
                ctx.moveTo(startX, startY);
                for (let i = 1; i <= segments; i++) {
                    const t = i / segments;
                    const angle = Math.atan2(dy, dx);
                    const offset = Math.cos(angle + Math.PI / 2) * (braid - 1) * 2.5;
                    const sway = Math.sin((t * Math.PI * 2) + this.ropeSwing + braid * 0.9) * 2.2;
                    const px = startX + dx * t + Math.cos(angle + Math.PI / 2) * (offset + sway);
                    const py = startY + dy * t + Math.sin(angle + Math.PI / 2) * (offset + sway);
                    ctx.lineTo(px, py);
                }
                ctx.strokeStyle = braid === 1 ? "#9d8d70" : braid === 0 ? "#7a6856" : "#b4a17f";
                ctx.lineWidth = 1.6;
                ctx.stroke();
            }

            // Cord highlight
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            for (let i = 1; i <= segments; i++) {
                const t = i / segments;
                const angle = Math.atan2(dy, dx);
                const sway = Math.sin((t * Math.PI * 2) + this.ropeSwing + 1.5) * 1.4;
                const px = startX + dx * t + Math.cos(angle + Math.PI / 2) * sway;
                const py = startY + dy * t + Math.sin(angle + Math.PI / 2) * sway;
                ctx.lineTo(px, py);
            }
            ctx.strokeStyle = "rgba(255,255,255,0.6)";
            ctx.lineWidth = 1;
            ctx.stroke();

            // Metal tip
            const tipAngle = Math.atan2(dy, dx);
            const tipX = endX;
            const tipY = endY;
            ctx.fillStyle = "#dfe7ef";
            ctx.beginPath();
            ctx.moveTo(tipX, tipY);
            ctx.lineTo(tipX - Math.cos(tipAngle) * 12 + Math.cos(tipAngle + Math.PI / 2) * 5, tipY - Math.sin(tipAngle) * 12 + Math.sin(tipAngle + Math.PI / 2) * 5);
            ctx.lineTo(tipX - Math.cos(tipAngle) * 12 - Math.cos(tipAngle + Math.PI / 2) * 5, tipY - Math.sin(tipAngle) * 12 - Math.sin(tipAngle + Math.PI / 2) * 5);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = "rgba(255,255,255,0.8)";
            ctx.beginPath();
            ctx.arc(tipX - Math.cos(tipAngle) * 6, tipY - Math.sin(tipAngle) * 6, 2.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.lastAngle);

        // Hand hold / handle
        ctx.strokeStyle = "#8B4513";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(10, 0);
        ctx.stroke();

        // Metal dart head on the handle
        ctx.fillStyle = "#dfe7ef";
        ctx.beginPath();
        ctx.moveTo(10, 0);
        ctx.lineTo(18, -5);
        ctx.lineTo(16, 0);
        ctx.lineTo(18, 5);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = "#FFFFFF";
        ctx.beginPath();
        ctx.arc(17, -1, 1.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}
