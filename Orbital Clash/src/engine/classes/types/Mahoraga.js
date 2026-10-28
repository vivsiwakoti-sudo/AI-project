import { FighterBase } from "../FighterBase.js";
import { EffectSystem } from "../../systems/EffectSystem.js";

const MELEE_PARRY_CHANCE = 0.25;
const MELEE_PARRY_STUN_SECONDS = 1;

export class Mahoraga extends FighterBase {
    constructor(data, x, y) {
        super(data, x, y);
        this.adaptation = { Melee: 0, Projectile: 0, Body: 0, Beam: 0, AOE: 0 };
        this.adaptedCategories = []; // Contains {category, resistance}
        this.impactFlash = 0;
        this.impactX = 0;
        this.impactY = 0;
        this.screenShake = 0;
        this.parryFlash = 0;
        this.parryAngle = 0;
        this.parryRingRadius = 0;

        // Adaptation wheel: a spoked Dharma wheel that floats OVER Mahoraga's
        // head and turns whenever he adapts, then settles back to a slow idle
        // turn. `wheelAngle` is the continuous spin history; `wheelRenderAngle`
        // is the angle actually drawn, integrating a smoothed spin rate so the
        // wheel accelerates and eases down instead of snapping between speeds.
        this.wheelAngle = 0;
        this.wheelRenderAngle = 0;
        this.wheelSpinRate = 0.8;      // live, smoothed rad/second
        this.wheelSpinSpeed = 0.8;     // idle target rad/second
        this.wheelBurst = 0;           // extra spin imparted by an adaptation
        this.wheelTilt = 0;            // lean into the fighter's momentum
        this.wheelGlow = 0;            // 0..1 rim highlight while adapting
        this.wheelRadius = this.radius * 0.72;
        this.wheelHeight = -(this.radius + 22); // centre sits above the head

        // Mahoraga has NO attack animation of its own. It is a pure Body fighter:
        // the fists are attached to the body and the damage comes from the arena's
        // body-contact pass, exactly like the Mutant and Ghost. There is therefore
        // no swing state machine, no slash arc and no blade sweep to drive - the
        // whole animation was removed rather than left running unused.
        //
        // Mahoraga's BODY must reach the border before he bounces. The adaptation
        // wheel is the only thing that genuinely overhangs past the body's edge,
        // and it lives above the centre, so the honest overhang is only the rim
        // above the head (~slanted 8px). Making this the distance to a weapon tip
        // pushed him inward by roughly the weapon's length, so he deflected off a
        // wall a full reach before his body ever touched the border. Deriving it
        // from the wheel instead keeps the visual overhang inside the clip while
        // letting the body meet the wall, exactly like every other class.
        const wheelOverhang = this.radius + 22 + this.wheelRadius - this.radius;
        this.wallMargin = Math.max(0, wheelOverhang - this.radius);
    }

    // Kicks the wheel hard so the adaptation is visible, not just heard.
    spinAdaptationWheel() {
        this.wheelBurst = Math.PI * 6;
    }

    hasAdaptedTo(category) {
        return this.adaptedCategories.some(c => c.category === category);
    }

    // Parries only unlock with the matching adaptation: once he has adapted to
    // Projectiles he swats them away (35%), and once he has adapted to Melee he
    // parries weapon strikes (25%) and stuns the attacker. Body slams, beams and
    // AOE are never parried.
    getParryChance(category) {
        if (category === "Projectile") return this.hasAdaptedTo("Projectile") ? 0.35 : 0;
        if (category === "Melee") return this.hasAdaptedTo("Melee") ? MELEE_PARRY_CHANCE : 0;
        return 0;
    }

    // A parried weapon strike does no damage and leaves the attacker stunned:
    // frozen in place with its weapon and attacks paused.
    stunAttacker(attacker) {
        if (!attacker || attacker === this || attacker.isDead) return;
        EffectSystem.addEffect(attacker, {
            name: "stun",
            duration: MELEE_PARRY_STUN_SECONDS,
            onUpdate: (fighter) => { fighter.isStuck = true; },
            onEnd: (fighter) => { fighter.isStuck = false; }
        });
        attacker.isStuck = true;
        attacker.pauseAttacks?.(MELEE_PARRY_STUN_SECONDS);
    }

    onParried(attacker, category, projectile) {
        if (category === "Melee") this.stunAttacker(attacker);
        else this.deflectProjectile(projectile);

        // The wheel swats the shot aside and flares, then coasts back down. There
        // is no attack animation to interrupt any more - the deflect is the whole
        // response the class has to a ranged hit.
        this.parryFlash = 0.35;
        const source = projectile || attacker;
        this.parryAngle = source
            ? Math.atan2(source.y - this.y, source.x - this.x)
            : this.lastAngle + Math.PI;
        this.parryRingRadius = 0;
        this.wheelGlow = 1;
        this.spinAdaptationWheel();
        this.emitBurst("#ffe066", 14, 300);
        if (this.particleSystem) {
            this.particleSystem.ring(this.x, this.y, "#ffe066", { startRadius: this.radius, endRadius: 62, life: 0.3, lineWidth: 3 });
        }
    }

    // Knocks a parried projectile back along its own path, now owned by Mahoraga
    // so the reflected shot can actually hit whoever fired it.
    deflectProjectile(projectile) {
        if (!projectile) return;
        projectile.vx *= -1;
        projectile.vy *= -1;
        if (projectile.owner) projectile.owner = this;
        projectile.damage *= 1.25;
    }

    // Called by DamageSystem when hit
    onHitTaken(category, damage) {
        if (this.adaptation[category] !== undefined) {
            this.adaptation[category]++;
            if (this.adaptation[category] >= 3 && !this.adaptedCategories.find(c => c.category === category)) {
                let resistance = 0;
                if (category === "Melee") resistance = 0.3;
                else if (category === "Projectile") resistance = 0.5;
                else if (category === "Body") resistance = 0.75;

                this.adaptedCategories.push({ category, resistance });
                this.adaptFlash = 0.8;
                // The wheel spins fast the instant a new adaptation is earned.
                this.spinAdaptationWheel();
                this.emitBurst("#ffffff", 30, 420);
                if (this.particleSystem) {
                    this.particleSystem.ring(this.x, this.y, "#ffffff", { startRadius: this.radius, endRadius: 150, life: 0.6, lineWidth: 5 });
                }
            }
        }
        return true;
    }

    getDamageMultiplier(category) {
        const adaptation = this.adaptedCategories.find(c => c.category === category);
        return adaptation ? (1 - adaptation.resistance) : 1;
    }

    update(dt, opponent) {
        super.update(dt, opponent);
        // No attack state machine to run: as a Body fighter Mahoraga's damage is
        // dealt by the arena's body-contact pass. Only feedback timers and the
        // adaptation wheel are advanced here.
        this.impactFlash = Math.max(0, this.impactFlash - dt);
        this.screenShake = Math.max(0, this.screenShake - dt);
        this.adaptFlash = Math.max(0, (this.adaptFlash || 0) - dt);
        this.parryFlash = Math.max(0, (this.parryFlash || 0) - dt);
        this.parryRingRadius += dt * 190;

        // Spin the wheel: the adaptation burst decays into the slow idle turn and
        // the rendered angle integrates a smoothed rate, so the wheel winds up and
        // coasts down instead of stuttering. It also leans into the fighter's
        // momentum, which sells the weight of the headpiece.
        this.wheelBurst = Math.max(0, this.wheelBurst - dt * Math.PI * 9);
        this.wheelAngle += (this.wheelSpinSpeed + this.wheelBurst) * dt;
        const targetRate = this.wheelSpinSpeed + this.wheelBurst;
        this.wheelSpinRate += (targetRate - this.wheelSpinRate) * Math.min(1, dt * 7);
        this.wheelRenderAngle = (this.wheelRenderAngle + this.wheelSpinRate * dt) % (Math.PI * 2);
        const targetTilt = Math.max(-0.35, Math.min(0.35, this.vx * 0.05));
        this.wheelTilt += (targetTilt - this.wheelTilt) * Math.min(1, dt * 6);
        this.wheelGlow = Math.max(0, this.wheelGlow - dt * 2.2);
    }

    draw(ctx) {
        if (this.isDead || this.health <= 0) return;
        super.draw(ctx);

        // Impact readout: a bright ring where a body slam just connected, so the
        // contact damage still reads as a hit even without a weapon animation.
        if (this.impactFlash > 0) {
            ctx.save();
            ctx.globalAlpha = this.impactFlash / 0.2;
            ctx.strokeStyle = "#fff6b0";
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(this.impactX, this.impactY, 12 + (1 - this.impactFlash / 0.2) * 18, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // Parry readout: a bright gold ring snaps out of the body wherever a
        // ranged shot was swatted away by the wheel.
        if (this.parryFlash > 0) {
            ctx.save();
            ctx.globalAlpha = Math.max(0, this.parryFlash / 0.35);
            ctx.strokeStyle = "#ffe066";
            ctx.lineWidth = 4;
            ctx.shadowBlur = 16;
            ctx.shadowColor = "#ffe066";
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius + 8 + this.parryRingRadius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        ctx.save();
        ctx.translate(this.x, this.y);
        
        // --- Adaptation wheel -------------------------------------------------
        // A spoked Dharma wheel floats OVER Mahoraga's head, held up by a short
        // neck. It turns constantly at a slow idle rate and whips around hard the
        // instant a new adaptation lands, so "I just adapted" is readable at a
        // glance. Rim, spokes and nodes all ride the same angle, and the nodes
        // corresponding to an earned adaptation light up in its category colour.
        const wheelRadius = this.wheelRadius;
        const wheelY = this.wheelHeight;
        const wheelColor = (adaptation) => {
            if (adaptation.category === "Melee") return "#FFD700";
            if (adaptation.category === "Projectile") return "#00BFFF";
            if (adaptation.category === "Body") return "#FF69B4";
            return "#FF0000";
        };

        // The whole wheel leans into the fighter's momentum around a pivot level
        // with the rim centre, so it swings with the body instead of being welded
        // flat. The lean is applied to the mount, not the rim, so it never fights
        // the spin angle.
        ctx.save();
        ctx.translate(0, wheelY);
        ctx.rotate(this.wheelTilt);
        ctx.translate(0, -wheelY);

        // Neck holding the wheel above the head, drawn under the rim so the wheel
        // reads as mounted rather than floating detached.
        ctx.strokeStyle = "rgba(190, 205, 230, 0.65)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, -this.radius * 0.85);
        ctx.lineTo(0, wheelY + wheelRadius * 0.25);
        ctx.stroke();

        ctx.save();
        ctx.translate(0, wheelY);
        ctx.rotate(this.wheelTilt);
        ctx.save();
        ctx.rotate(this.wheelRenderAngle);
        const glowing = this.adaptFlash > 0 || this.wheelGlow > 0;
        ctx.strokeStyle = glowing ? "rgba(255,255,255,0.95)" : "rgba(180, 200, 230, 0.65)";
        ctx.lineWidth = 2.5;
        ctx.shadowBlur = glowing ? 18 : 8;
        ctx.shadowColor = "#ffffff";

        // Outer rim.
        ctx.beginPath();
        ctx.arc(0, 0, wheelRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Spokes from the hub out to the rim, so the wheel visibly turns instead
        // of only the nodes moving.
        const spokeCount = 8;
        for (let i = 0; i < spokeCount; i++) {
            const spokeAngle = (i / spokeCount) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(Math.cos(spokeAngle) * wheelRadius * 0.22, Math.sin(spokeAngle) * wheelRadius * 0.22);
            ctx.lineTo(Math.cos(spokeAngle) * wheelRadius, Math.sin(spokeAngle) * wheelRadius);
            ctx.stroke();
        }

        // Hub.
        ctx.beginPath();
        ctx.arc(0, 0, wheelRadius * 0.22, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Adaptation nodes ride the rim inside the rotated frame, so each earned
        // adaptation keeps its own slot and physically turns with the wheel.
        ctx.shadowBlur = 0;
        this.adaptedCategories.forEach((adaptation, index) => {
            const slot = adaptation.category;
            const slotOrder = { Melee: 0, Projectile: 1, Body: 2, Beam: 3, AOE: 4 };
            const order = slotOrder[slot] ?? index;
            const angle = (order / 5) * Math.PI * 2 - Math.PI / 2 + this.wheelRenderAngle;
            const nodeX = Math.cos(angle) * wheelRadius;
            const nodeY = Math.sin(angle) * wheelRadius;
            const color = wheelColor(adaptation);
            const pulse = 1 + Math.sin(this.spinAngle * 3 + index) * 0.15;

            ctx.fillStyle = color + "55";
            ctx.beginPath();
            ctx.arc(nodeX, nodeY, 9 * pulse, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.shadowBlur = 10;
            ctx.shadowColor = color;
            ctx.beginPath();
            ctx.arc(nodeX, nodeY, 9 * pulse, 0, Math.PI * 2);
            ctx.stroke();
            ctx.shadowBlur = 0;

            // The letter is counter-rotated so it stays upright while the node
            // itself physically turns with the wheel.
            ctx.save();
            ctx.translate(nodeX, nodeY);
            ctx.rotate(-this.wheelRenderAngle);
            ctx.fillStyle = color;
            ctx.font = "bold 9px Arial";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(slot[0], 0, 0);
            ctx.restore();
        });
        // Close the rim/spoke frame and the wheel's tilt+translate frame.
        // These two must be balanced: the wheel mount opened two saves (line
        // ~360 and ~374) on top of the outer body translate, so the nodes frame
        // closes the inner one here and the mount frame is closed below.
        ctx.restore();
        ctx.restore();

        // Fists attached to the body: glowing gauntlets with knuckle ridges.
        for (const side of [-1, 1]) {
            const fx = side * (this.radius + 10);
            const fist = ctx.createRadialGradient(fx - 2, -2, 1, fx, 0, 8);
            fist.addColorStop(0, "#e0b27a");
            fist.addColorStop(0.6, "#8B4513");
            fist.addColorStop(1, "#3a1d08");
            ctx.save();
            ctx.shadowBlur = this.impactFlash > 0 ? 18 : 8;
            ctx.shadowColor = "#ffe066";
            ctx.fillStyle = fist;
            ctx.beginPath();
            ctx.arc(fx, 0, 7, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.strokeStyle = "rgba(255, 230, 160, 0.7)";
            ctx.lineWidth = 1;
            for (let k = -1; k <= 1; k++) {
                ctx.beginPath();
                ctx.arc(fx + side * 4, k * 3, 1.4, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.restore();
        }

        // Close the outer body translate opened at the top of draw(). Every save
        // in this method now matches exactly one restore; leaving an extra
        // restore here used to pop the arena's clip region, which let the other
        // fighter and its particles render outside the arena border.
        ctx.restore();
    }
}
