import { FighterBase } from "../FighterBase.js";
import { EffectSystem } from "../../systems/EffectSystem.js";

const MELEE_PARRY_CHANCE = 0.25;
const MELEE_PARRY_STUN_SECONDS = 1;

export const ADAPTATION_STEPS = [
    { hits: 3, resistance: 0.3 },
    { hits: 5, resistance: 0.5 },
    { hits: 7, resistance: 0.7 }
];

// Projectile reflection unlocks with the 2nd adaptation step, earned on any attack.
const REFLECT_UNLOCK_RESISTANCE = ADAPTATION_STEPS[1].resistance;

// Adaptations take effect the moment they are earned, but the wheel reveals them
// one at a time, at least this many seconds apart, so back-to-back adaptations
// do not blur together.
const WHEEL_REVEAL_GAP = 3;

// Each revealed adaptation nests one more wheel inside the base wheel, so the
// total is capped at the base plus these layers (3 wheels).
const WHEEL_LAYER_SCALES = [0.66, 0.4];
const WHEEL_POP_SECONDS = 0.6;
const ADAPTATION_GOLD = "#FFD700";

// Every attack is adapted to on its own. The key is the attacking class plus the
// damage category, and a Mimic counts as the form it is copying, so a Knight's
// sword and a Samurai's sword are separate attacks, and so is a Mimic's sword
// after it switches form.
const attackKeyOf = (attacker, category) => `${attacker?.mimicForm ?? attacker?.name ?? "World"}:${category}`;

export class Mahoraga extends FighterBase {
    constructor(data, x, y) {
        super(data, x, y);
        this.adaptation = Object.create(null); // landed hits per attack key
        this.adaptedAttacks = [];              // Contains {key, category, resistance}
        this.preAdaptResistance = 0;           // resistance from a pre-adapted test stage, applied to every attack
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
        this.wheelGlow = 0;            // 0..1 gold rim highlight while adapting
        this.adaptFlash = 0;           // seconds the gold glow lasts after an adaptation
        this.wheelRadius = this.radius * 0.72;
        this.wheelHeight = -(this.radius + 22); // centre sits above the head
        this.wheelQueue = [];                   // earned adaptations waiting to be shown
        this.wheelRevealHold = 0;               // seconds until the next reveal
        this.wheelLayers = [];                  // categories of the extra wheels, oldest first
        this.wheelPop = 0;                      // 1 -> 0 pop-in of the newest extra wheel

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

    hasAdaptedTo(key) {
        return this.adaptedAttacks.some(a => a.key === key);
    }

    // Test setup: starts Mahoraga already adapted to the first `stage` steps. The
    // resistance applies to every attack, and the wheel shows one gold layer per
    // stage, as far as the wheel has room for.
    preAdapt(stage) {
        const step = ADAPTATION_STEPS[stage - 1];
        if (!step) return;
        this.preAdaptResistance = step.resistance;
        this.wheelLayers = Array.from({ length: Math.min(stage, WHEEL_LAYER_SCALES.length) }, () => "Pre");
    }

    reflectUnlocked() {
        return this.preAdaptResistance >= REFLECT_UNLOCK_RESISTANCE
            || this.adaptedAttacks.some(a => a.resistance === REFLECT_UNLOCK_RESISTANCE);
    }

    // Melee parries only unlock with the matching adaptation to that exact attack:
    // once he has adapted to a Knight's sword it is parried (25%) and stuns the
    // attacker. Projectile reflection (35%) unlocks once he reaches the 2nd
    // adaptation step on any attack, and then turns every projectile aside. Body
    // slams, beams and AOE are never parried.
    getParryChance(category, attacker) {
        if (category === "Projectile") return this.reflectUnlocked() ? 0.35 : 0;
        if (category === "Melee") {
            const adaptedToAll = this.preAdaptResistance > 0;
            return adaptedToAll || this.hasAdaptedTo(attackKeyOf(attacker, category)) ? MELEE_PARRY_CHANCE : 0;
        }
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

    onDamaged(amount, category, options = {}) {
        super.onDamaged(amount, category, options);
        const key = attackKeyOf(options.attacker, category);
        const hits = this.adaptation[key] = (this.adaptation[key] || 0) + 1;
        const step = ADAPTATION_STEPS.find(item => item.hits === hits);
        if (step) this.completeAdaptation({ key, category, resistance: step.resistance });
    }

    completeAdaptation({ key, category, resistance }) {
        this.adaptedAttacks.push({ key, category, resistance });

        // The wheel reacts the moment he adapts; the reveal below may wait for the
        // previous one to finish, but the spin and gold glow never do.
        this.wheelQueue.push(category);
        this.revealQueuedAdaptations();
        this.spinAdaptationWheel();
        this.adaptFlash = 0.8;
        this.emitBurst("#ffffff", 30, 420);
        if (this.particleSystem) {
            this.particleSystem.ring(this.x, this.y, "#ffffff", { startRadius: this.radius, endRadius: 150, life: 0.6, lineWidth: 5 });
        }
    }

    // Shows the next queued adaptation on the wheel once the previous reveal has
    // had its full gap on screen.
    revealQueuedAdaptations() {
        if (this.wheelRevealHold > 0 || this.wheelQueue.length === 0) return;
        const category = this.wheelQueue.shift();
        if (this.wheelLayers.length < WHEEL_LAYER_SCALES.length) {
            this.wheelLayers.push(category);
            this.wheelPop = 1;
        }
        this.adaptFlash = 0.8;
        this.spinAdaptationWheel();
        this.wheelRevealHold = WHEEL_REVEAL_GAP;
    }

    getDamageMultiplier(category, options, attacker) {
        const key = attackKeyOf(attacker, category);
        const adaptation = this.adaptedAttacks.findLast(a => a.key === key);
        return 1 - Math.max(adaptation?.resistance ?? 0, this.preAdaptResistance);
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
        this.wheelRevealHold = Math.max(0, this.wheelRevealHold - dt);
        this.revealQueuedAdaptations();

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
        this.wheelPop = Math.max(0, this.wheelPop - dt / WHEEL_POP_SECONDS);
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
        // neck. It turns constantly at a slow idle rate and whips around hard, with
        // a gold glow, the instant he adapts to an attack, so "I just adapted" is
        // readable at a glance. Each earned adaptation nests a coloured wheel inside.
        const wheelRadius = this.wheelRadius;
        const wheelY = this.wheelHeight;
        const wheelColor = (category) => {
            if (category === "Melee") return "#FF8C1A";
            if (category === "Projectile") return "#00BFFF";
            if (category === "Body") return "#FF69B4";
            if (category === "Pre") return ADAPTATION_GOLD;
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
        ctx.strokeStyle = glowing ? ADAPTATION_GOLD : "rgba(180, 200, 230, 0.65)";
        ctx.lineWidth = 2.5;
        ctx.shadowBlur = glowing ? 18 : 8;
        ctx.shadowColor = glowing ? ADAPTATION_GOLD : "#ffffff";

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

        // Each earned adaptation nests a smaller wheel inside the base one, rimmed
        // in the colour that earned it. Neighbouring wheels turn in opposite
        // directions, and the newest one pops in larger before settling.
        this.wheelLayers.forEach((category, i) => {
            const isNewest = i === this.wheelLayers.length - 1;
            const pop = isNewest ? this.wheelPop : 0;
            const layerRadius = wheelRadius * WHEEL_LAYER_SCALES[i] * (1 + pop * 0.35);
            const color = wheelColor(category);
            const direction = i % 2 === 0 ? -1 : 1;

            ctx.save();
            ctx.globalAlpha = 1 - pop * 0.5;
            ctx.rotate(direction * this.wheelRenderAngle * (1 + i * 0.5));
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = "rgba(180, 200, 230, 0.55)";
            for (let spoke = 0; spoke < 6; spoke++) {
                const spokeAngle = (spoke / 6) * Math.PI * 2;
                ctx.beginPath();
                ctx.moveTo(Math.cos(spokeAngle) * layerRadius * 0.22, Math.sin(spokeAngle) * layerRadius * 0.22);
                ctx.lineTo(Math.cos(spokeAngle) * layerRadius, Math.sin(spokeAngle) * layerRadius);
                ctx.stroke();
            }
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            ctx.shadowBlur = isNewest ? 12 : 4;
            ctx.shadowColor = color;
            ctx.beginPath();
            ctx.arc(0, 0, layerRadius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(0, 0, layerRadius * 0.22, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        });

        // Close the wheel's spin frame and its lean/mount frame. The mount opened
        // two saves on top of the outer body translate, so both are closed here.
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
