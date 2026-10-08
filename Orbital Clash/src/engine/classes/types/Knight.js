import { FighterBase } from "../FighterBase.js";
import { DamageSystem } from "../../systems/DamageSystem.js";
import { drawSword, weaponTrail } from "../../systems/Weapons.js";

export class Knight extends FighterBase {
    constructor(data, x, y) {
        super(data, x, y);
        this.shieldActive = false;
        this.shieldTimer = 0;
        this.slashTimer = 0;
        this.slashCooldown = 0;
        // The greatsword never stops orbiting and is now 50% longer again on top
        // of its last growth (37.5px -> 56.25px blade), with a matching faster
        // sweep so the longer blade still covers the ring at a threatening rate.
        this.swordLength = 56.25;
        this.weaponSpin = 3.6;   // up from 2.6: a longer blade needs a quicker turn
        this.weaponReach = this.radius + 8 + this.swordLength;
        // The Knight's BODY must reach the border before he bounces. Only his
        // actual silhouette reaches past the body: the shield dome (radius + 10)
        // and the parry flare (radius + 8 + parryRingRadius). Using the sword
        // length here wrongly held the whole body a blade's length off every wall,
        // so he deflected well before the border. Deriving the margin from the
        // widest drawn radius keeps that overhang inside the clip while the body
        // still meets the wall, exactly like every other class.
        this.wallMargin = 10;
        // Shield parry: the rim turns ranged bolts aside, and the flat also takes
        // the edge off an incoming melee swing. The captured projectile is sent
        // back at whoever fired it; a deflected melee strike is simply shrugged
        // off for no damage. Beams and AOE are never parried.
        this.parryChance = 0.35;      // ranged projectiles
        this.meleeParryChance = 0.25; // sword, axe, claw and spear strikes
        this.parryFlash = 0;
        this.parryAngle = 0;
        this.parryRingRadius = 0;
    }

    // Projectiles are turned aside at 35%; melee blows are deflected at 25%.
    // Beams and AOE always go through.
    getParryChance(category) {
        if (category === "Projectile") return this.parryChance;
        if (category === "Melee") return this.meleeParryChance;
        if (category === "Body") return this.meleeParryChance;
        return 0;
    }

    // Throws the attacker's blade the other way, or shoves a body attacker off
    // with no damage.
    repelAttacker(attacker, category) {
        if (!attacker || attacker === this) return;
        if (category === "Body") {
            attacker.vx = -(attacker.vx || 0);
            attacker.vy = -(attacker.vy || 0);
            // A refused body hit must not be re-rolled every frame of the contact.
            attacker.damageCooldown = 0.5;
            return;
        }
        if (Number.isFinite(attacker.weaponSpin)) attacker.weaponSpin = -attacker.weaponSpin;
        for (const key of ["weaponAngle", "swordAngle", "scytheAngle", "bladeAngle"]) {
            if (Number.isFinite(attacker[key])) attacker[key] += Math.PI;
        }
    }

    onParried(attacker, category, projectile) {
        this.repelAttacker(attacker, category);
        // Only a captured projectile is reversible; a melee strike has nothing to
        // send back, so it is just deflected away.
        if (projectile) this.deflectProjectile(projectile);
        this.shieldTimer = 2;
        this.shieldActive = true;
        this.parryFlash = 0.35;
        this.parryAngle = projectile
            ? Math.atan2(projectile.y - this.y, projectile.x - this.x)
            : attacker ? Math.atan2(attacker.y - this.y, attacker.x - this.x) : this.lastAngle + Math.PI;
        this.parryRingRadius = 0;
        this.blockFlash = 0.3;
        // A deflected melee swing is answered with a steel-on-steel spark, so the
        // block is readable instead of the hit silently vanishing.
        if (category === "Melee" && this.particleSystem) {
            const sparkAngle = this.parryAngle + Math.PI;
            this.particleSystem.emit(
                this.x + Math.cos(this.parryAngle) * this.radius,
                this.y + Math.sin(this.parryAngle) * this.radius,
                "#ffffff",
                12,
                { angle: sparkAngle, spread: 1.2, speed: 320, size: 2.2, life: 0.32 }
            );
        }
        if (this.particleSystem) {
            this.particleSystem.emit(this.x, this.y, "#00FFFF", 14, { speed: 300 });
            this.particleSystem.ring(this.x, this.y, "#00FFFF", { startRadius: this.radius, endRadius: 58, life: 0.3, lineWidth: 3 });
        }
    }

    // Reverses the shot and transfers ownership, so a deflected bolt can actually
    // damage the fighter that fired it.
    deflectProjectile(projectile) {
        if (!projectile) return;
        projectile.vx *= -1;
        projectile.vy *= -1;
        if (projectile.owner) projectile.owner = this;
        projectile.damage *= 1.25;
    }

    update(dt, opponent) {
        super.update(dt, opponent);
        if (this.shieldTimer > 0) {
            this.shieldTimer -= dt;
            this.shieldActive = true;
        } else {
            this.shieldActive = false;
        }
        this.blockFlash = Math.max(0, (this.blockFlash || 0) - dt);
        this.parryFlash = Math.max(0, this.parryFlash - dt);
        this.parryRingRadius += dt * 170;

        // Constant spinning greatsword: it sweeps the ring every frame and the
        // strike lands whenever the blade crosses the opponent, capped to one
        // hit per revolution so a parked blade cannot shred a stationary target.
        // The damage is the class's DEFINITION (15 for the Knight) rather than the
        // old hard-coded 5, which silently ignored the stat block entirely.
        const [tip] = this.meleeSpinUpdate(dt);
        const reaching = opponent && this.bladeTouches(tip.x, tip.y, opponent, 8);
        if (reaching && !this.weaponHot && this.slashCooldown <= 0) {
            this.weaponHot = true;
            this.slashTimer = 0.3;
            this.slashCooldown = Math.min(this.cooldown || 0.25, 0.25);
            if (DamageSystem.applyDamage(this, opponent, this.damage, "Melee", { ignoreCooldown: true })) {
                this.slashFlash = 0.22;
                this.triggerSwing(tip.angle, { duration: 0.24, reach: 42, color: "#e8f4ff" });
                if (opponent.particleSystem) opponent.particleSystem.emitImpact(opponent.x, opponent.y, "#e8f4ff", 16);
            }
        } else if (!reaching) {
            this.weaponHot = false;
        }

        if (this.slashCooldown > 0) this.slashCooldown -= dt;
        if (this.slashTimer > 0) this.slashTimer -= dt;
    }

    draw(ctx) {
        super.draw(ctx);
        if (this.isDead || this.health <= 0) return;
        ctx.save();
        ctx.translate(this.x, this.y);
        weaponTrail(ctx, this.weaponAngle, Math.sign(this.weaponSpin) || 1, this.radius + 6, this.weaponReach + 2, "#cfe6ff", { sweep: 0.9, alpha: 0.32 });
        // The blade tracks its own orbit rather than the facing direction.
        ctx.rotate(this.weaponAngle);

        if (this.shieldActive) {
            const dome = ctx.createRadialGradient(0, 0, this.radius * 0.6, 0, 0, this.radius + 10);
            dome.addColorStop(0, "rgba(0, 255, 255, 0)");
            dome.addColorStop(1, "rgba(0, 255, 255, 0.35)");
            ctx.fillStyle = dome;
            ctx.beginPath();
            ctx.arc(0, 0, this.radius + 10, 0, Math.PI * 2);
            ctx.fill();

            ctx.save();
            ctx.strokeStyle = "#7ff6ff";
            ctx.lineWidth = 3;
            ctx.lineCap = "round";
            ctx.shadowBlur = 14;
            ctx.shadowColor = "#00FFFF";
            ctx.beginPath();
            ctx.arc(0, 0, this.radius + 8, -Math.PI/2, Math.PI/2);
            ctx.stroke();
            ctx.restore();
        }

        drawSword(ctx, {
            start: this.radius,
            length: this.swordLength,
            width: 9,
            glow: "#9fd4ff",
            gem: "#c4151c"
        });

        // Parry readout: a cyan shield ring flares wherever a bolt was turned.
        if (this.parryFlash > 0) {
            ctx.save();
            ctx.globalAlpha = Math.max(0, this.parryFlash / 0.35);
            ctx.strokeStyle = "#00FFFF";
            ctx.lineWidth = 4;
            ctx.shadowBlur = 16;
            ctx.shadowColor = "#00FFFF";
            ctx.beginPath();
            ctx.arc(0, 0, this.radius + 8 + this.parryRingRadius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        ctx.restore();
    }
}
