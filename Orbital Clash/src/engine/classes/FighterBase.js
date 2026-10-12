import { EffectSystem } from "../systems/EffectSystem.js";
import { audioManager } from "../audio/AudioManager.js";
import { glowCircle, hitFlash, squashTransform, critBurst, castSigil } from "../systems/Fx.js";
import { traceShape } from "../systems/Shapes.js";

// Longest a pin/stun may last when the class that applied it never set a timer.
// Grappler pins run 2s and Spearman impales 2-3s; four seconds guarantees even a
// stale flag clears before it can swallow the rest of the match.
const STUN_FALLBACK_SECONDS = 4;

export class FighterBase {
    constructor(data, x, y) {
        Object.assign(this, data);
        this.maxHealth = data.health;
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 4;
        this.vy = (Math.random() - 0.5) * 4;
        this.statusEffects = [];
        this.radius = data.bodySize / 2;
        this.isDead = false;
        this.isInvulnerable = false;
        this.isUntargetable = false;
        this.damageCooldown = 0;
        this.attackPauseTimer = 0;
        this.totalDamageDealt = 0;
        this.totalDamageTaken = 0;  // damage this fighter has received this battle
        this.totalHits = 0;         // landed attacks (per hit, not per damage point)
        this.totalKills = 0;        // fighters this fighter has eliminated
        this.lastAngle = 0; // Track facing direction

        // Shared combat/ability bookkeeping used by the HUD and hit feedback.
        this.cooldownTimer = 0;        // normalised ability cooldown
        this.castTimer = 0;            // visual wind-up window
        this.isCharging = false;
        this.hitFlashTimer = 0;        // white pop when damaged
        this.damageNumbers = [];       // floating damage readouts
        this.particleSystem = null;    // injected by the arena
        this.spinAngle = Math.random() * Math.PI * 2;
        this.comboCount = 0;           // rapid hits inside the combo window
        this.comboTimer = 0;           // seconds left before the combo resets

        // Bounce / deflection state -------------------------------------------------
        // squashX/squashY are render-only scale factors driven by impacts. They
        // decay back to 1 so a fighter visibly deforms on a bounce and ripples
        // back to its normal shape afterwards.
        this.squashX = 1;
        this.squashY = 1;
        this.squashAngle = 0;      // direction the squash is aligned to
        this.impactAngle = 0;      // last incoming hit direction (for feedback)
        this.impactStrength = 0;   // 0..1.6, decays; drives trails / streaks
        this.angularVelocity = 0;  // radians/second of extra spin from bounces
        this.bounceTimer = 0;      // >0 briefly after a deflection (telegraphs)
        this.trailPoints = [];     // motion trail, filled while moving fast

        // Melee swing animation ---------------------------------------------------
        // Every melee class calls triggerSwing() the moment its weapon lands (or
        // starts to swing). This drives a short, snappy arc drawn over the body so
        // close-range attacks visibly read instead of the weapon just being there.
        this.swingTimer = 0;       // counts down; >0 means the arc is showing
        this.swingDuration = 0.22; // seconds the arc animates for
        this.swingAngle = 0;       // world angle the swing is centred on
        this.swingReach = 34;      // how far the arc extends past the body
        this.swingDirection = 1;   // +1 / -1 alternate so swings feel dynamic
        this.swingColor = null;    // defaults to the fighter's accent

        // Constant spinning weapon --------------------------------------------
        // Every melee class now keeps its weapon orbiting the body continuously
        // instead of only lunging on approach, so a swinging blade is always in
        // play. `weaponAngle` is the live orbit angle, `weaponSpin` its speed
        // (radians/second) and `weaponReach` how far past the body the strike
        // lands. meleeSpinUpdate() advances the angle and resolves the sweep.
        this.weaponAngle = Math.random() * Math.PI * 2;
        this.weaponSpin = 4.2;     // radians/second; classes may retune this
        this.weaponReach = 44;     // distance from body centre to the striking edge
        // Each spinning weapon may only connect once per revolution with a given
        // target, so a blade parked on an opponent cannot tick every frame.
        this.weaponHot = false;

        // Presentation-only combat feedback -------------------------------------
        // None of these affect damage, cooldowns or hit detection; they exist so
        // the arena can render readable feedback for critical hits, healing,
        // shields and buffs without any class needing to know about them.
        this.criticalFlashTimer = 0;   // bright pop for a big/critical hit
        this.healFlashTimer = 0;       // green pop when health is restored
        this.shieldFlashTimer = 0;     // ring when a shield/parry absorbs a blow
        this.buffFlashTimer = 0;       // upward glow when a buff is applied
        this.damageVignette = 0;       // 0..1 low-HP danger tint behind the body

        // Ability animation -------------------------------------------------------
        // A single, shared "cast" window every class's ability fires through. It
        // drives one quick, category-tinted sigil so an ability reads as a moment
        // rather than an instant snap. castKind picks which sigil shape is drawn.
        this.castKind = "burst";       // burst | beam | projectile | aoe
        this.castSigilTimer = 0;       // counts down; >0 means the sigil is showing
        this.castSigilDuration = 0.3;  // seconds the sigil animates for
        this.castColor = null;         // defaults to the fighter's accent
        this.hitStopTimer = 0;         // brief freeze-frame on a heavy/critical hit
    }

    // ---- Presentation-only feedback hooks -----------------------------------
    // These are called by the arena when it observes something in the simulation
    // (a big damage number, a heal, a fresh shield). They set timers that the draw
    // pass reads; they never mutate combat state.

    // A big hit pops brighter and shows a star burst. Threshold is presentation
    // only - it decides how loud a hit LOOKS, never how much it hurts.
    triggerCriticalFlash() {
        this.criticalFlashTimer = 0.34;
    }

    // Fire the shared ability-cast sigil. `kind` selects the silhouette so a
    // projectile ability, a beam and a burst each announce themselves differently
    // without any class needing its own bespoke animation. Purely visual.
    triggerCastVisual(kind = "burst", color = null, duration = 0.3) {
        this.castKind = kind;
        this.castColor = color;
        this.castSigilTimer = duration;
        this.castSigilDuration = duration;
    }

    // A brief freeze-frame on a heavy blow. Attack pause already exists for the
    // victim's attacks; this one is presentation-only and just holds the pose so a
    // crit lands with weight. It never blocks damage (nothing consults it in
    // DamageSystem) so two fighters can never deadlock by freezing each other.
    triggerHitStop(seconds = 0.12) {
        this.hitStopTimer = Math.max(this.hitStopTimer || 0, seconds);
    }

    triggerHealFlash() {
        this.healFlashTimer = 0.5;
    }

    triggerShieldFlash() {
        this.shieldFlashTimer = 0.45;
    }

    triggerBuffFlash() {
        this.buffFlashTimer = 0.55;
    }

    // Advances the constant orbit and returns the live weapon tip position, so a
    // subclass can run its own hit test against it. `lanes` draws several blades
    // (e.g. Berserker's two axes) evenly spaced around the ring.
    // Freezes a fighter's attacks for `seconds`: its weapon stops spinning, its
    // ability cooldown stops ticking (so cooldown-gated classes like the Fireball
    // or Tornado cannot fire a fresh attack) and none of its attacks can deal
    // damage while the pause is live (see DamageSystem.applyDamage).
    pauseAttacks(seconds) {
        this.attackPauseTimer = Math.max(this.attackPauseTimer || 0, seconds);
    }

    meleeSpinUpdate(dt, { speed = this.weaponSpin, lanes = 1 } = {}) {
        if (this.attackPauseTimer <= 0) this.weaponAngle = (this.weaponAngle + speed * dt) % (Math.PI * 2);
        return Array.from({ length: lanes }, (_, i) => {
            const angle = this.weaponAngle + (i * Math.PI * 2) / lanes;
            return {
                angle,
                x: this.x + Math.cos(angle) * this.weaponReach,
                y: this.y + Math.sin(angle) * this.weaponReach
            };
        });
    }

    // True when the blade, swept from the body edge out to (tipX, tipY), touches
    // any part of the target's body - not just its centre point.
    bladeTouches(tipX, tipY, target, edge = 0) {
        const ax = this.x, ay = this.y;
        const bx = tipX - ax, by = tipY - ay;
        const lenSq = bx * bx + by * by || 1;
        const t = Math.max(0, Math.min(1, ((target.x - ax) * bx + (target.y - ay) * by) / lenSq));
        return Math.hypot(ax + bx * t - target.x, ay + by * t - target.y) < target.radius + edge;
    }

    // Starts a quick melee swing arc. `angle` defaults to the facing direction;
    // pass a shorter duration/reach for snappier or longer weapons.
    triggerSwing(angle = this.lastAngle, { duration = 0.22, reach = 34, color = null } = {}) {
        this.swingTimer = duration;
        this.swingDuration = duration;
        this.swingAngle = angle;
        this.swingReach = reach;
        this.swingColor = color;
        // Alternate swing direction each time so repeated hits don't look robotic.
        this.swingDirection *= -1;
    }

    tickSwing(dt) {
        if (this.swingTimer > 0) this.swingTimer = Math.max(0, this.swingTimer - dt);
    }

    // Shared animated arc. Drawn in world space around (this.x, this.y) and driven
    // by the 0..1 progress of the swing, so every melee class gets the same
    // readable "whoosh" without duplicating canvas code.
    drawSwing(ctx) {
        if (this.swingTimer <= 0) return;
        const progress = 1 - this.swingTimer / this.swingDuration; // 0 -> 1
        const color = this.swingColor || this.hitColor || this.color;
        const reach = this.swingReach;

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.swingAngle);
        ctx.scale(1, this.swingDirection);

        // Sweep from one shoulder to the other across the arc.
        const sweep = Math.PI * 0.9;
        const start = -sweep / 2;
        const end = start + sweep * progress;
        const alpha = Math.sin(progress * Math.PI) * 0.9; // fade in then out

        ctx.globalAlpha = alpha;
        ctx.lineCap = "round";
        ctx.shadowColor = color;

        // Tapered crescent: thin faint tail growing to a bright, thick head.
        const steps = 8;
        const cx = this.radius * 0.4;
        for (let i = 0; i < steps; i++) {
            const t0 = i / steps;
            const t1 = (i + 1) / steps;
            const a0 = start + (end - start) * t0;
            const a1 = start + (end - start) * t1;
            ctx.globalAlpha = alpha * t1 * 0.8;
            ctx.shadowBlur = 8;
            ctx.strokeStyle = color;
            ctx.lineWidth = 3 + 9 * t1;
            ctx.beginPath();
            ctx.arc(cx, 0, reach - 5, a0, a1);
            ctx.stroke();

            ctx.globalAlpha = alpha * t1;
            ctx.shadowBlur = 0;
            ctx.strokeStyle = "rgba(255,255,255,0.95)";
            ctx.lineWidth = 1 + 3 * t1;
            ctx.beginPath();
            ctx.arc(cx, 0, reach, a0, a1);
            ctx.stroke();
        }

        ctx.restore();
    }
    // another fighter. (nx, ny) is the outward surface normal, strength is a
    // 0..1.6 measure of how hard the bounce was.
    applyDeflection(nx, ny, strength = 0, { source = "wall", other = null } = {}) {
        const impact = Math.max(0.15, Math.min(1.6, strength));
        const angle = Math.atan2(ny, nx);

        this.squashAngle = angle;
        // Flatten across the normal, stretch along it (classic squash & stretch).
        this.squashX = 1 - 0.35 * impact;
        this.squashY = 1 + 0.28 * impact;
        this.impactAngle = angle + Math.PI; // where the blow came from
        this.impactStrength = impact;
        this.bounceTimer = 0.28;

        // Impart a spin: tangential impact -> rotation, alternating so fighters
        // don't all spin the same way.
        const spinSign = Math.random() < 0.5 ? -1 : 1;
        this.angularVelocity += spinSign * impact * 6;

        if (this.particleSystem) {
            // Spark spray kicked off the surface, plus a shock ring on hard hits.
            this.particleSystem.emit(
                this.x - nx * this.radius,
                this.y - ny * this.radius,
                source === "fighter" ? (other?.hitColor || other?.color || this.color) : this.hitColor || this.color,
                Math.round(6 + impact * 14),
                { angle: angle + Math.PI, spread: 1.5, speed: 260 + impact * 320, size: 2.4, life: 0.5 }
            );
            if (impact > 0.7) {
                this.particleSystem.ring(this.x - nx * this.radius, this.y - ny * this.radius, this.hitColor || this.color, {
                    startRadius: 4, endRadius: 34 + impact * 22, life: 0.26, lineWidth: 2
                });
            }
        }
    }

    // Decays squash, spin and impact feedback each frame. Kept separate from
    // tickTimers so subclasses can't accidentally skip it.
    tickDeflection(dt) {
        const relax = Math.min(1, dt * 12);
        this.squashX += (1 - this.squashX) * relax;
        this.squashY += (1 - this.squashY) * relax;
        this.impactStrength = Math.max(0, this.impactStrength - dt * 2.6);
        this.bounceTimer = Math.max(0, this.bounceTimer - dt);
        this.angularVelocity *= Math.pow(0.06, dt); // exponential spin decay
        this.spinAngle += this.angularVelocity * dt;

        // Motion trail: only sample while genuinely moving.
        const speed = Math.hypot(this.vx, this.vy);
        if (speed > 0.25 && !this.isDead) {
            this.trailPoints.push({ x: this.x, y: this.y, life: 0.28 });
            if (this.trailPoints.length > 8) this.trailPoints.shift();
        } else if (this.trailPoints.length) {
            this.trailPoints.shift();
        }
    }

    // 0 -> just used, 1 -> ready again.
    getCooldownProgress() {
        if (!Number.isFinite(this.cooldown) || this.cooldown <= 0) return 1;
        const remaining = Math.max(0, this.cooldownTimer);
        return Math.max(0, Math.min(1, 1 - remaining / this.cooldown));
    }

    // Restarts the ability timer; called by every class when its ability fires.
    useAbility() {
        if (Number.isFinite(this.cooldown) && this.cooldown > 0) this.cooldownTimer = this.cooldown;
        this.castTimer = 0.16;
        // Every ability announces itself with one shared, category-tinted sigil.
        // The shape is derived from the class's own attack type, so a beam, a
        // projectile and an AOE burst read differently with no per-class code.
        this.triggerCastVisual(FighterBase.castKindFor(this));
        audioManager.playAbilityCast(this.name);
    }

    // Maps a fighter's declared attack style to one of the shared cast-sigil
    // silhouettes. Falls back to the generic burst for anything unrecognised, so a
    // new class always gets a readable cast with no extra work.
    static castKindFor(fighter) {
        const type = (fighter?.attackType || "").toLowerCase();
        if (type.includes("beam")) return "beam";
        if (type.includes("projectile") || type.includes("bullet") || type.includes("spear")
            || type.includes("rope") || type.includes("potion") || type.includes("bomb")) return "projectile";
        if (type.includes("area") || type.includes("aoe") || type.includes("zone") || type.includes("trap")) return "aoe";
        return "burst";
    }

    tickTimers(dt) {
        // While attacks are paused the ability cooldown is held still, so a class
        // gated on `cooldownTimer <= 0` (Fireball, Tornado, Gunner, ...) genuinely
        // stops firing instead of merely dealing no damage when its shots land.
        if (this.attackPauseTimer <= 0) this.cooldownTimer = Math.max(0, this.cooldownTimer - dt);
        this.castTimer = Math.max(0, this.castTimer - dt);
        this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
        // Presentation-only feedback timers. Each eases toward 0 so its effect
        // fades out smoothly instead of snapping off.
        this.criticalFlashTimer = Math.max(0, this.criticalFlashTimer - dt);
        this.healFlashTimer = Math.max(0, this.healFlashTimer - dt);
        this.shieldFlashTimer = Math.max(0, this.shieldFlashTimer - dt);
        this.buffFlashTimer = Math.max(0, this.buffFlashTimer - dt);
        this.castSigilTimer = Math.max(0, this.castSigilTimer - dt);
        this.hitStopTimer = Math.max(0, this.hitStopTimer - dt);
        // Rapid-hit combo counter. It only widens the damage readout (see
        // addDamageNumber); it has no effect on damage, cooldowns or hit detection.
        if (this.comboTimer > 0) {
            this.comboTimer = Math.max(0, this.comboTimer - dt);
            if (this.comboTimer <= 0) this.comboCount = 0;
        }
        // Low-HP danger tint: rises as health drops below 35%, so a fighter that
        // is nearly out reads as endangered at a glance. Pure presentation.
        const hpRatio = this.maxHealth > 0 ? Math.max(0, this.health) / this.maxHealth : 1;
        const targetVignette = hpRatio < 0.35 && !this.isDead ? (0.35 - hpRatio) / 0.35 : 0;
        this.damageVignette += (targetVignette - this.damageVignette) * Math.min(1, dt * 6);
        this.spinAngle += dt * 3;
        this.tickDeflection(dt);
        this.tickSwing(dt);
        if (this.damageCooldown > 0) this.damageCooldown -= dt;
        if (this.attackPauseTimer > 0) this.attackPauseTimer -= dt;
        // Grappler, Spearman and Alchemist all set `isStunned = true` directly on
        // their victim and expect the pin to expire on its own, but only the
        // Grappler ever sets `pinTimer`/`stunTimer`. Without a timer here the
        // countdown went NaN and the `stunTimer <= 0` branch never fired, so a
        // fighter pinned once stayed stunned forever and stopped attacking for
        // the rest of the match. Backstop every stun with a finite timer so a pin
        // always ends, whatever set the flag and whatever bookkeeping it did.
        if (this.isStunned) {
            if (!Number.isFinite(this.stunTimer) && !Number.isFinite(this.pinTimer)) {
                this.stunTimer = STUN_FALLBACK_SECONDS;
            }
            this.stunTimer = Number.isFinite(this.stunTimer) ? this.stunTimer - dt : 0;
            this.pinTimer = Number.isFinite(this.pinTimer) ? this.pinTimer - dt : this.pinTimer;
            const pinnedByTimer = Number.isFinite(this.pinTimer) && this.pinTimer > 0;
            if (this.stunTimer <= 0 && !pinnedByTimer) { this.isStunned = false; this.isStuck = false; }
        }
        if (this.isPinned) {
            this.pinTimer -= dt;
            if (this.pinTimer <= 0) this.releasePin();
        }
    }

    emitBurst(color = this.color, count = 16, speed = 300) {
        if (!this.particleSystem) return;
        this.particleSystem.emit(this.x, this.y, color, count, { speed });
    }

    addDamageNumber(amount, { color = this.color, crit = false, category = null } = {}) {
        const value = Math.round(amount * 10) / 10;
        if (value <= 0) return;

        // Merge rapid hits into one rising readout instead of stacking fifty
        // overlapping numbers on a chip-damage class. A combo window of 0.35s is
        // presentation only; it never changes how much damage is dealt.
        const merged = this.comboTimer > 0 && this.damageNumbers.length > 0
            ? this.damageNumbers[this.damageNumbers.length - 1]
            : null;
        this.comboCount = this.comboTimer > 0 ? this.comboCount + 1 : 1;
        this.comboTimer = 0.35;

        if (merged && !crit) {
            // Fold the new hit into the freshest readout and refresh its life, so a
            // steady stream reads as one escalating number rather than a rain of 1s.
            merged.amount = Math.round((merged.amount + value) * 10) / 10;
            merged.hits = (merged.hits || 1) + 1;
            merged.life = merged.maxLife;
            merged.pop = 1; // replay the scale pop on every contribution
            return;
        }

        this.damageNumbers.push({
            amount: value,
            life: 0.8,
            maxLife: 0.8,
            color: crit ? "#ffd166" : color,
            crit,
            category,
            hits: 1,
            pop: crit ? 1.3 : 1,   // crit reads bigger for its whole life
            drift: (Math.random() - 0.5) * 30,
            offsetX: (Math.random() - 0.5) * 18
        });
        if (this.damageNumbers.length > 6) this.damageNumbers.shift();
    }

    // Called by DamageSystem after a successful hit; drives hit feedback everywhere.
    // `options.crit` is set by the damage system (an explicit crit roll or an
    // unusually heavy blow) and only affects presentation.
    onDamaged(amount, category, options = {}) {
        const crit = options.crit === true;
        this.hitFlashTimer = crit ? 0.3 : 0.22;
        this.addDamageNumber(amount, { crit, category });
        if (crit) this.triggerHitStop(0.1);
        if (!this.particleSystem) return;
        const angle = this.lastAngle;
        this.particleSystem.emit(this.x, this.y, crit ? "#ffd166" : (this.hitColor || this.color), crit ? 18 : 10, {
            angle,
            spread: 1.6,
            speed: crit ? 420 : 300,
            size: 2.6
        });
        if (crit || category === "AOE" || amount >= 20) {
            this.particleSystem.ring(this.x, this.y, crit ? "#ffd166" : (this.hitColor || this.color), {
                startRadius: 10,
                endRadius: crit ? 90 : 70,
                life: crit ? 0.5 : 0.4,
                lineWidth: 4
            });
        }
    }

    update(dt, opponent) {
        if (this.isDead) {
            this.updateDamageNumbers(dt);
            return;
        }
        EffectSystem.updateEffects(this, dt);
        this.tickTimers(dt);
        this.updateDamageNumbers(dt);

        if (opponent && !this.isStuck) {
            const targetAngle = Math.atan2(opponent.y - this.y, opponent.x - this.x);
            this.lastAngle = targetAngle;
        }

        if (this.isStuck || this.isFrozen) return;

        const speedMultiplier = EffectSystem.slowMultiplier(this);
        if (this.speedMultiplierTimer != null) {
            this.speedMultiplierTimer -= dt;
            if (this.speedMultiplierTimer <= 0) { this.speedMultiplier = 1; this.speedMultiplierTimer = null; }
        }
        const intensity = this.speedMultiplier ?? 1;

        this.x += this.vx * this.speed * speedMultiplier * intensity * dt * 60;
        this.y += this.vy * this.speed * speedMultiplier * intensity * dt * 60;
        // Hard backstop matching the arena bounds. This used to allow -400..1200,
        // far outside the 800px arena, so a fighter knocked off-screen could sit
        // in the black margin and be drawn outside the border. The precise,
        // per-class boundary is resolved by CollisionSystem.resolveFighterWall;
        // this clamp only guarantees a body can never leave the arena entirely.
        const bound = this.arenaSize ?? 800;
        this.x = Math.max(0, Math.min(bound, this.x));
        this.y = Math.max(0, Math.min(bound, this.y));
    }

    updateDamageNumbers(dt) {
        this.damageNumbers.forEach(entry => {
            entry.life -= dt;
            // Ease-out rise: fast at first, slowing as it fades, so the number
            // "pops" up out of the body instead of sliding at a constant rate.
            const t = Math.min(1, entry.life / entry.maxLife);
            entry.offsetY = (entry.offsetY ?? 0) - dt * (16 + t * 34);
            entry.offsetX = (entry.offsetX || 0) + (entry.drift || 0) * dt;
            if (entry.pop !== undefined && entry.pop > 0) {
                entry.pop = Math.max(0, entry.pop - dt * 4);
            }
        });
        this.damageNumbers = this.damageNumbers.filter(entry => entry.life > 0);
    }

    // Called by Spearman / Ninja style effects; releases a pinned fighter.
    releasePin() {
        this.isPinned = false;
        this.isStuck = false;
        this.velocityBoost = null;
    }

    drawDamageNumbers(ctx) {
        this.damageNumbers.forEach(entry => {
            const alpha = Math.max(0, entry.life / entry.maxLife);
            const rise = 1 - alpha; // 0 on spawn -> 1 at fade-out
            // Crit numbers are larger, gold, and carry a small burst behind them so
            // a big blow is unmistakable at a glance; ordinary hits stay small and
            // tinted to the victim's accent.
            const big = entry.crit;
            const pop = 1 + (entry.pop || 0) * 0.35;
            const baseSize = big ? 22 : 15;
            const size = (baseSize + rise * 4) * pop;
            const x = this.x + (entry.offsetX || 0);
            const y = this.y - this.radius - 14 + (entry.offsetY || 0);

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.font = `bold ${size}px 'Share Tech Mono', 'Rajdhani', monospace`;

            if (big) {
                // Gold glow + a thin dark outline so the crit stays legible over any
                // background or explosion behind it.
                ctx.shadowBlur = 16;
                ctx.shadowColor = "#ffd166";
                ctx.lineWidth = 3;
                ctx.strokeStyle = "rgba(60, 30, 0, 0.85)";
                ctx.strokeText(`-${entry.amount}`, x, y);
                ctx.fillStyle = "#fff3b0";
                ctx.fillText(`-${entry.amount}`, x, y);

                // CRIT tag above the number, only for the first beat of the pop.
                if (alpha > 0.55) {
                    ctx.shadowBlur = 10;
                    ctx.font = `bold ${Math.round(11 + rise * 2)}px 'Share Tech Mono', 'Rajdhani', monospace`;
                    ctx.fillStyle = "#ffd166";
                    ctx.fillText("CRIT", x, y - size * 0.85);
                }
            } else {
                ctx.shadowBlur = 8;
                ctx.shadowColor = entry.color;
                ctx.fillStyle = entry.color;
                ctx.fillText(`-${entry.amount}`, x, y);
            }

            // A small hit-count suffix when several rapid ticks have merged, so a
            // chip stream reads as "x4" rather than silently inflating one number.
            if ((entry.hits || 1) > 2 && !big) {
                ctx.shadowBlur = 0;
                ctx.font = `bold ${Math.round(size * 0.55)}px 'Share Tech Mono', 'Rajdhani', monospace`;
                ctx.fillStyle = "rgba(255,255,255,0.75)";
                ctx.fillText(`x${entry.hits}`, x, y + size * 0.7);
            }
            ctx.restore();
        });
    }

    draw(ctx) {
        // A dead fighter is gone: `die()` has already exploded it into particles,
        // so nothing of it may be painted again. This guard must come first, before
        // any feedback ring, damage number or swing arc, because a corpse still
        // carries live timers for the frame it died on. Subclasses draw their
        // weapons after calling super.draw(), so the arena also skips dead fighters
        // entirely rather than relying on this alone.
        if (this.isDead || this.health <= 0) return;

        // Contact ring while a deflection is still fresh, so bounces read clearly.
        if (this.bounceTimer > 0) {
            const p = 1 - this.bounceTimer / 0.28;
            ctx.save();
            ctx.globalAlpha = (1 - p) * 0.75;
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 2.5;
            ctx.shadowBlur = 18;
            ctx.shadowColor = this.hitColor || this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius + 4 + p * 26, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        ctx.save();
        if (this.isUntargetable) ctx.globalAlpha = 0.35;

        // Squash & stretch is applied as a transform around the body so every
        // subclass's weapon/appendage drawing deforms along with it.
        ctx.translate(this.x, this.y);
        squashTransform(ctx, this.squashX, this.squashY, this.squashAngle);

        ctx.shadowBlur = 12;
        ctx.shadowColor = this.color;

        // Body silhouette: every class gets its own outline (see Shapes.js) so
        // two fighters are distinguishable at a glance, not just by their weapon.
        // The colourful gradient core is shared, and the aimable shapes lean
        // toward whichever way the fighter is facing.
        const aimAngle = this.lastAngle - Math.PI / 2;
        traceShape(ctx, this.radius, this.shape, { angle: aimAngle, spinAngle: this.spinAngle });
        if (this.slowVisual) {
            ctx.fillStyle = "rgba(80, 180, 255, 0.8)";
        } else {
            const grad = ctx.createRadialGradient(0, 0, this.radius * 0.2, 0, 0, this.radius);
            grad.addColorStop(0, "white");
            grad.addColorStop(0.3, this.color);
            grad.addColorStop(1, "black");
            ctx.fillStyle = grad;
        }
        ctx.fill();

        // Thin outline so even low-contrast shapes keep a readable edge.
        traceShape(ctx, this.radius, this.shape, { angle: aimAngle, spinAngle: this.spinAngle });
        ctx.shadowBlur = 0;
        ctx.strokeStyle = this.hitColor || this.color;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Hot core sparks where the deflection landed.
        if (this.impactStrength > 0.05) {
            ctx.shadowBlur = 0;
            ctx.globalAlpha = Math.min(1, this.impactStrength) * (this.isUntargetable ? 0.35 : 1);
            ctx.fillStyle = "rgba(255,255,255,0.85)";
            ctx.beginPath();
            ctx.arc(Math.cos(this.impactAngle) * this.radius * 0.7, Math.sin(this.impactAngle) * this.radius * 0.7, this.radius * 0.28, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = this.isUntargetable ? 0.35 : 1;
        }

        ctx.shadowBlur = 0;
        ctx.restore();

        // Low-HP danger tint: a pulsing red shell that intensifies as the fighter
        // nears elimination. Drawn before the hit pop so a fresh hit still reads
        // on top of it. Presentation only - it never gates anything.
        if (this.damageVignette > 0.02) {
            const pulse = 0.7 + 0.3 * Math.sin(this.spinAngle * 3);
            ctx.save();
            ctx.globalAlpha = this.damageVignette * 0.5 * pulse;
            ctx.strokeStyle = "#ff4d6d";
            ctx.lineWidth = 3;
            ctx.shadowBlur = 10;
            ctx.shadowColor = "#ff4d6d";
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius + 8, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // Incoming-hit feedback: white pop + expanding spikes, drawn over the body.
        if (this.hitFlashTimer > 0) {
            const progress = 1 - this.hitFlashTimer / 0.22;
            ctx.save();
            ctx.globalAlpha = 1 - progress;
            glowCircle(ctx, this.x, this.y, this.radius * 0.85, "#ffffff", { alpha: 0.5, blur: 26, coreScale: 0 });
            ctx.restore();
            hitFlash(ctx, this.x, this.y, this.radius, this.hitColor || this.color, progress);
        }

        // Critical / heavy-hit feedback: a bright star burst that only fires on
        // presentation-worthy hits (see triggerCriticalFlash). Sits on top of the
        // normal hit flash so a big blow is unmistakable.
        if (this.criticalFlashTimer > 0) {
            const progress = 1 - this.criticalFlashTimer / 0.34;
            critBurst(ctx, this.x, this.y, this.radius, progress, "#ffd166");
        }

        // Heal feedback: green rising sparks that read as restoration, clearly
        // distinct from the red/white of damage.
        if (this.healFlashTimer > 0) {
            const progress = 1 - this.healFlashTimer / 0.5;
            const alpha = 1 - progress;
            ctx.save();
            ctx.globalAlpha = alpha * 0.85;
            ctx.fillStyle = "#46e6a0";
            ctx.shadowBlur = 14;
            ctx.shadowColor = "#46e6a0";
            for (let i = 0; i < 5; i++) {
                const a = (i / 5) * Math.PI * 2;
                const r = this.radius + 4 + progress * 10;
                const yLift = progress * 26;
                ctx.beginPath();
                ctx.arc(this.x + Math.cos(a) * r, this.y + Math.sin(a) * r - yLift, 2.4, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }

        // Shield / parry feedback: a hexagonal barrier that flashes when a blow is
        // absorbed. Communicates "that was blocked" without moving the fighter.
        if (this.shieldFlashTimer > 0) {
            const progress = 1 - this.shieldFlashTimer / 0.45;
            const alpha = 1 - progress;
            const r = this.radius + 10 + progress * 6;
            ctx.save();
            ctx.globalAlpha = alpha * 0.9;
            ctx.strokeStyle = "#7fd3ff";
            ctx.lineWidth = 2.5;
            ctx.shadowBlur = 18;
            ctx.shadowColor = "#2f7bff";
            ctx.beginPath();
            for (let i = 0; i <= 6; i++) {
                const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
                const px = this.x + Math.cos(a) * r;
                const py = this.y + Math.sin(a) * r;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.stroke();
            ctx.restore();
        }

        // Buff feedback: a purple upward surge that marks a positive effect landing.
        if (this.buffFlashTimer > 0) {
            const progress = 1 - this.buffFlashTimer / 0.55;
            const alpha = 1 - progress;
            ctx.save();
            ctx.globalAlpha = alpha * 0.8;
            ctx.strokeStyle = "#a855f7";
            ctx.lineWidth = 2;
            ctx.shadowBlur = 16;
            ctx.shadowColor = "#a855f7";
            ctx.beginPath();
            ctx.arc(this.x, this.y - progress * 18, this.radius + 6, Math.PI * 0.15, Math.PI * 0.85);
            ctx.stroke();
            ctx.restore();
        }

        // Ability-cast sigil: one quick, category-shaped pulse the moment a class
        // fires its ability. It reads as a deliberate "cast" beat without any class
        // needing its own animation code.
        if (this.castSigilTimer > 0) {
            const progress = 1 - this.castSigilTimer / this.castSigilDuration;
            castSigil(ctx, this.x, this.y, this.radius + 6, progress, this.castColor || this.color, this.castKind);
        }

        // Wind-up/charge telegraph shared by every class.
        if (this.isCharging || this.castTimer > 0) {
            const progress = this.isCharging ? (this.chargeProgress ?? 0) : 1 - this.castTimer / 0.16;
            ctx.save();
            ctx.globalAlpha = 0.55 + 0.25 * Math.sin(this.spinAngle * 2);
            ctx.strokeStyle = this.color;
            ctx.lineWidth = 2;
            ctx.shadowBlur = 14;
            ctx.shadowColor = this.color;
            ctx.setLineDash([8, 8]);
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius + 9, this.spinAngle, this.spinAngle + Math.PI * 1.6);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
        }

        // Freeze-frame cue: a tight white flash hugging the body so a hit-stop reads
        // as weight rather than the simulation simply pausing.
        if (this.hitStopTimer > 0) {
            const p = 1 - this.hitStopTimer / 0.12;
            ctx.save();
            ctx.globalAlpha = (1 - p) * 0.5;
            ctx.fillStyle = "#ffffff";
            ctx.shadowBlur = 24;
            ctx.shadowColor = "#ffffff";
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius + 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // Dashed gold ring while this fighter's attacks are frozen by a hit-stop.
        if (this.attackPauseTimer > 0) {
            ctx.save();
            ctx.strokeStyle = "#ffd166";
            ctx.lineWidth = 2;
            ctx.shadowBlur = 10;
            ctx.shadowColor = "#ffd166";
            ctx.setLineDash([5, 6]);
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius + 12, this.spinAngle * 2, this.spinAngle * 2 + Math.PI * 1.7);
            ctx.stroke();
            ctx.restore();
        }

        // Quick melee swing arc (shared by every melee class).
        this.drawSwing(ctx);

        this.drawDamageNumbers(ctx);
    }
    die(particleSystem) {
        if (this.isDead) return;
        this.isDead = true;
        audioManager.playDeathSfx();
        const particles = particleSystem || this.particleSystem;
        if (particles) {
            // "Explodes into pixels of its respective color".
            particles.emit(this.x, this.y, this.color, 70, { speed: 640, size: 4.2, life: 1.1 });
            particles.emit(this.x, this.y, "#ffffff", 24, { speed: 820, size: 2.6, life: 0.7 });
            particles.ring(this.x, this.y, this.color, { startRadius: this.radius, endRadius: 170, life: 0.7, lineWidth: 6 });
            particles.ring(this.x, this.y, "#ffffff", { startRadius: this.radius * 0.6, endRadius: 110, life: 0.5, lineWidth: 3 });
        }
    }
}
