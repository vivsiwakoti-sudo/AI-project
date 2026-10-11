import { FighterBase } from "../FighterBase.js";
import { DamageSystem } from "../../systems/DamageSystem.js";
import { audioManager } from "../../audio/AudioManager.js";

export class SolarBeam extends FighterBase {
    constructor(data, x, y) {
        super(data, x, y);
        this.cooldown = 7;
        this.cooldownTimer = 0;
        this.isCharging = false;
        this.chargeTimer = 0;
        this.beamActive = false;
        this.beamDuration = 0;
        this.beamAngle = 0;
        this.hasHit = false; // Prevent multi-hit per beam
        this.beamProjectile = null;
    }

    update(dt, opponent) {
        super.update(dt, opponent);

        if (this.beamActive) {
            // The beam is a travelling hitbox, so it can strike any fighter it
            // sweeps over - not only the single opponent reference handed over by
            // the arena. The early return used to sit inside the `beamProjectile`
            // guard, so a beam whose projectile was ever missing skipped the rest
            // of the fighter's update entirely (no charge, no re-fire) and it
            // stopped attacking for the remainder of the match.
            if (this.beamProjectile) {
                const beamSpeed = 1800;
                this.beamProjectile.x += Math.cos(this.beamAngle) * beamSpeed * dt;
                this.beamProjectile.y += Math.sin(this.beamAngle) * beamSpeed * dt;
                this.beamProjectile.distance += beamSpeed * dt;

                const inBeam = (this.victims?.length ? this.victims : [opponent])
                    .filter(f => f && !f.isDead && Math.hypot(this.beamProjectile.x - f.x, this.beamProjectile.y - f.y) < f.radius + 12);
                for (const victim of inBeam) {
                    if (!DamageSystem.applyDamage(this, victim, this.damage, "Beam")) continue;
                    this.hasHit = true;
                    // Each landed beam permanently shortens the cycle by 10%, down to a 2s floor.
                    const shortened = Math.max(2, this.cooldown * 0.9);
                    this.cooldownTimer = Math.max(0, this.cooldownTimer - (this.cooldown - shortened));
                    this.cooldown = shortened;
                    this.charge = Math.max(0, (this.charge || 0) - 1);
                    if (victim.particleSystem) {
                        victim.particleSystem.emitImpact(victim.x, victim.y, "#ffe066", 30);
                        victim.particleSystem.ring(victim.x, victim.y, "#ffd700", { startRadius: 10, endRadius: 110, life: 0.45, lineWidth: 5 });
                    }
                    // Distinct solar burn/crack when the beam lands.
                    audioManager.playSolarBeamHit();
                    break;
                }

                if (this.beamProjectile.distance >= (this.arenaSize ?? 800) || this.hasHit) {
                    this.beamActive = false;
                    this.beamProjectile = null;
                    this.hasHit = false;
                }
            } else {
                this.beamActive = false;
                this.hasHit = false;
            }
            return;
        }

        if (this.cooldownTimer <= 0 && opponent) {
            if (!this.isCharging) {
                this.isCharging = true;
                // One layered charge-up hum for the wind-up, tuned to the 2s charge.
                audioManager.playSolarCharge(2);
            }
            // Track the opponent throughout the charge, then lock this angle on release.
            this.beamAngle = Math.atan2(opponent.y - this.y, opponent.x - this.x);
            this.chargeTimer += dt;
            this.chargeProgress = Math.min(1, this.chargeTimer / 2);
            if (Math.random() < 0.5) {
                this.particleSystem?.emit(this.x, this.y, "#ffe066", 1, {
                    angle: Math.random() * Math.PI * 2,
                    spread: 0.6,
                    speed: 90 + this.chargeProgress * 160,
                    size: 2.6,
                    life: 0.5
                });
            }
            if (this.chargeTimer >= 2) {
                this.isCharging = false;
                this.chargeProgress = 0;
                this.chargeTimer = 0;
                this.beamActive = true;
                // Each cycle starts its cooldown on release, whether or not the beam hits.
                this.cooldownTimer = this.cooldown;
                // Fire the discharge the instant the beam releases.
                audioManager.playSolarBeamFire();
                this.beamProjectile = {
                    x: this.x,
                    y: this.y,
                    distance: 0
                };
            }
        }
    }

    draw(ctx, time = 0) {
        super.draw(ctx, time);
        if (this.isCharging) {
            const progress = Math.min(1, this.chargeTimer / 2);
            const pulse = (Math.sin(time * 14) + 1) / 2;
            const core = this.radius + 6 + progress * 10;

            ctx.save();

            // Outer corona that swells and sears toward white-hot at full charge.
            const coronaRadius = this.radius + 22 + progress * 34;
            const corona = ctx.createRadialGradient(this.x, this.y, this.radius * 0.4, this.x, this.y, coronaRadius);
            corona.addColorStop(0, `rgba(255, 240, 150, ${0.5 * progress})`);
            corona.addColorStop(0.55, `rgba(255, 190, 60, ${0.3 * progress})`);
            corona.addColorStop(1, "rgba(255, 140, 0, 0)");
            ctx.fillStyle = corona;
            ctx.beginPath();
            ctx.arc(this.x, this.y, coronaRadius, 0, Math.PI * 2);
            ctx.fill();

            // Counter-rotating energy rings that tighten inward as the charge builds.
            for (let i = 0; i < 3; i++) {
                const dir = i % 2 === 0 ? 1 : -1;
                const ringRadius = (this.radius + 14 + i * 9) * (1.35 - progress * 0.35) + pulse * 2;
                const arcStart = time * dir * (2.2 + i * 0.8) + i * 1.3;
                ctx.strokeStyle = `rgba(255, 215, 0, ${0.35 + progress * 0.55})`;
                ctx.lineWidth = 2 + progress * 1.5;
                ctx.beginPath();
                ctx.arc(this.x, this.y, ringRadius, arcStart, arcStart + Math.PI * 1.35);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(this.x, this.y, ringRadius, arcStart + Math.PI, arcStart + Math.PI * 1.7);
                ctx.stroke();
            }

            // Inward-converging sparks: motes streaming to the core telegraph the build.
            const sparkCount = 5;
            for (let i = 0; i < sparkCount; i++) {
                const a = time * 3 + (i / sparkCount) * Math.PI * 2;
                const dist = (this.radius + 30) * (1 - progress) + core + 4;
                ctx.fillStyle = `rgba(255, 250, 200, ${0.4 + progress * 0.5})`;
                ctx.beginPath();
                ctx.arc(this.x + Math.cos(a) * dist, this.y + Math.sin(a) * dist, 2.2, 0, Math.PI * 2);
                ctx.fill();
            }

            // The growing core: brightens to a blinding white at full charge.
            const coreGrad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, core);
            coreGrad.addColorStop(0, `rgba(255, 255, 255, ${0.65 + progress * 0.35})`);
            coreGrad.addColorStop(0.5, `rgba(255, 235, 130, ${0.55 + progress * 0.4})`);
            coreGrad.addColorStop(1, `rgba(255, 190, 40, ${0.15 + progress * 0.3})`);
            ctx.shadowBlur = 20 + progress * 30;
            ctx.shadowColor = "#ffd700";
            ctx.fillStyle = coreGrad;
            ctx.beginPath();
            ctx.arc(this.x, this.y, core, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;

            // Final-burst flicker right before release: a sharp white flare.
            if (progress > 0.82) {
                const flash = (progress - 0.82) / 0.18;
                ctx.globalAlpha = flash * (0.4 + pulse * 0.6);
                ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
                ctx.beginPath();
                ctx.arc(this.x, this.y, core + 6 + pulse * 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
            }

            ctx.restore();
        }
        if (this.beamActive) {
            const beamHead = this.beamProjectile || { x: this.x, y: this.y };
            const flicker = 0.85 + 0.15 * Math.sin(time * 40);

            ctx.save();
            ctx.lineCap = "round";
            // Layered beam: wide soft halo, golden body, white-hot core.
            const layers = [
                { w: 30, c: "rgba(255, 170, 0, 0.18)", blur: 30 },
                { w: 20, c: "rgba(255, 210, 40, 0.45)", blur: 24 },
                { w: 11 * flicker, c: "#fff27a", blur: 16 },
                { w: 4, c: "#ffffff", blur: 0 }
            ];
            layers.forEach(layer => {
                ctx.shadowBlur = layer.blur;
                ctx.shadowColor = "#ffb000";
                ctx.strokeStyle = layer.c;
                ctx.lineWidth = layer.w;
                ctx.beginPath();
                ctx.moveTo(this.x, this.y);
                ctx.lineTo(beamHead.x, beamHead.y);
                ctx.stroke();
            });

            // Energy beads streaming along the beam.
            ctx.shadowBlur = 8;
            ctx.fillStyle = "rgba(255,255,255,0.9)";
            for (let i = 0; i < 6; i++) {
                const t = ((time * 2.5) + i / 6) % 1;
                ctx.beginPath();
                ctx.arc(this.x + (beamHead.x - this.x) * t, this.y + (beamHead.y - this.y) * t, 2.4, 0, Math.PI * 2);
                ctx.fill();
            }

            // Head flare and muzzle glow.
            [[beamHead.x, beamHead.y, 13], [this.x, this.y, 10]].forEach(([fx, fy, fr]) => {
                const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, fr * 1.8);
                g.addColorStop(0, "rgba(255,255,255,1)");
                g.addColorStop(0.4, "rgba(255,225,90,0.85)");
                g.addColorStop(1, "rgba(255,170,0,0)");
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(fx, fy, fr * 1.8, 0, Math.PI * 2);
                ctx.fill();
            });
            ctx.restore();
        }
    }
}
