import { FighterBase } from "../FighterBase.js";
import { Duplicator } from "./Duplicator.js";
import { FighterFactory } from "../../FighterFactory.js";
import { FIGHTER_CLASSES } from "../../fighterDefinitions.js";

const BASE_SECONDS = 5;
const COPY_SECONDS = 11;
const EXCLUDED = new Set(["Mimic", "Mahoraga", "Mutant", "Summoner"]);
export const MIMIC_CLASSES = Object.keys(FIGHTER_CLASSES).filter(name => !EXCLUDED.has(name));

const SHARED_ABILITY_FIELDS = new Set([
    "attackType", "cooldown", "cooldownTimer", "weaponAngle", "weaponSpin",
    "weaponReach", "weaponHot"
]);
const PERSISTENT_UNITS = new Set(["clones", "root", "generation", "totalClones", "cloneLimit"]);
const copiedPrototypes = new Map();

function prototypeFor(prototype) {
    if (!copiedPrototypes.has(prototype)) {
        const combined = Object.create(prototype);
        const methods = Object.getOwnPropertyDescriptors(Mimic.prototype);
        delete methods.constructor;
        Object.defineProperties(combined, methods);
        copiedPrototypes.set(prototype, combined);
    }
    return copiedPrototypes.get(prototype);
}

export class Mimic extends FighterBase {
    constructor(data, x, y) {
        super(data, x, y);
        this.mimicBaseFields = new Set(Object.keys(this));
        this.mimicBaseSpeed = data.speed;
        this.mimicBaseDamage = data.damage;
        this.mimicTimer = BASE_SECONDS;
        this.mimicForm = null;
        this.mimicPrototype = null;
        this.mimicSavedFields = null;
        this.mimicAbilityCleaned = false;
        this.placedAttacks = [];
        this.clones = [];
        this.root = null;
        this.generation = 0;
        this.totalClones = 0;
        this.cloneLimit = 50;
    }

    update(dt, opponent) {
        if (this.isDead || this.health <= 0) {
            this.cleanupCopiedAbility();
            this.clearUnits();
            return;
        }

        let remaining = dt;
        while (remaining > 0 && !this.isDead && this.health > 0) {
            if (this.mimicForm && this.mimicTimer <= 0) {
                if (!this.hasActiveCopiedAttack()) {
                    this.endCopiedForm();
                    continue;
                }
                this.holdCopiedAttackStarts();
            }
            const step = this.mimicTimer > 0
                ? Math.min(remaining, this.mimicTimer)
                : remaining;
            const form = this.mimicForm;
            this.updatePlacedAttacks(step, opponent);
            const update = this.mimicPrototype?.update ?? FighterBase.prototype.update;
            update.call(this, step, opponent);
            if (this.isDead || this.health <= 0) {
                this.cleanupCopiedAbility();
                this.clearUnits();
                return;
            }
            if (form !== "Duplicator" && this.clones.length) this.updateClones(step, opponent);
            this.mimicTimer -= step;
            remaining -= step;
            if (this.mimicTimer <= 1e-9) {
                if (this.mimicForm) {
                    // A copy-cycle ending is presentation timing, not an attack
                    // cancellation. Finish the active move, then restore the base form.
                    if (!this.hasActiveCopiedAttack()) this.endCopiedForm();
                } else {
                    this.startCopiedForm(MIMIC_CLASSES[Math.floor(Math.random() * MIMIC_CLASSES.length)]);
                }
            }
        }
    }

    holdCopiedAttackStarts() {
        // Existing attacks keep updating, but every copied class's next cast is
        // held so a finishing move cannot chain into a fresh move forever.
        // Solar Beam starts and advances its charge under the same cooldown
        // condition, so freezing that field here would freeze the beam at 1.78s.
        // Its release sets a normal cooldown, which prevents a second charge.
        if ("cooldownTimer" in this && this.mimicForm !== "Solar Beam") {
            this.cooldownTimer = Infinity;
        }
        if ("spearCooldown" in this) this.spearCooldown = Infinity;
        if ("attackTimer" in this) this.attackTimer = Infinity;
        if ("dashRoll" in this) this.dashRoll = Infinity;
    }

    hasActiveCopiedAttack() {
        if (!this.mimicForm) return false;

        // Projectile-like attacks keep their class update loop alive until they
        // hit, expire, or leave the arena.
        const movingAttacks = [
            this.projectiles,
            this.dice,
            this.spikes,
            this.planes,
            this.bombs
        ];
        if (movingAttacks.some(attacks => attacks?.some(attack => attack?.active !== false))) {
            return true;
        }

        switch (this.mimicForm) {
            case "Solar Beam":
                return this.isCharging || this.beamActive || Boolean(this.beamProjectile);
            case "Meteor":
                return this.warningTimer > 0 || Boolean(this.targetZone);
            case "Black Hole":
                return Boolean(this.activeHole);
            case "Dragon":
                return this.windupTimer !== null && this.windupTimer !== undefined;
            case "Tornado":
                return this.aoeActive;
            case "Ninja":
                return this.ropeActive || Boolean(this.ropeDart);
            case "Grappler":
                return this.isHookActive || this.latched;
            case "Yeti":
                return this.leapState !== "idle";
            case "Vampire":
                return this.dashState !== "idle";
            case "Tunneler":
                return this.isUnderground;
            case "Samurai":
                return this.comboActive;
            case "Ghost":
                return this.isGhost;
            default:
                return false;
        }
    }

    startCopiedForm(name) {
        if (!MIMIC_CLASSES.includes(name)) throw new Error(`Mimic cannot copy class: ${name}`);
        const template = FighterFactory.createFighter(name, this.x, this.y, {
            name: this.name,
            health: this.maxHealth,
            damage: this.mimicBaseDamage,
            speed: this.mimicBaseSpeed,
            bodySize: this.bodySize,
            color: this.color,
            shape: this.shape
        });
        const saved = new Map();
        for (const [key, value] of Object.entries(template)) {
            if (PERSISTENT_UNITS.has(key)) continue;
            if (this.mimicBaseFields.has(key) && !SHARED_ABILITY_FIELDS.has(key)) continue;
            saved.set(key, Object.hasOwn(this, key) ? { value: this[key] } : null);
            this[key] = value;
        }
        for (const key of ["speed", "damage", "dodgeChance", "isCharging", "chargeProgress"]) {
            if (!saved.has(key)) saved.set(key, Object.hasOwn(this, key) ? { value: this[key] } : null);
        }
        this.mimicSavedFields = saved;
        this.mimicForm = name;
        this.mimicAbilityCleaned = false;
        this.mimicPrototype = Object.getPrototypeOf(template);
        this.mimicTimer = COPY_SECONDS;
        Object.setPrototypeOf(this, prototypeFor(this.mimicPrototype));
    }

    cleanupCopiedAbility() {
        if (this.mimicAbilityCleaned || !this.mimicForm) return;
        this.mimicAbilityCleaned = true;
        if (this.mimicForm === "Ghost" && this.isGhost) this.isInvulnerable = false;
        if (this.mimicForm === "Samurai" && this.isInvisible) this.isInvulnerable = false;
        if (this.mimicForm === "Tunneler" && this.isUnderground) this.isUntargetable = false;
        if (this.mimicForm === "Black Hole") {
            this.stopHoleLoop();
            if (this.activeHole) {
                for (const victim of this.victims ?? []) victim.isPulledIn = false;
            }
        }
        if (this.mimicForm === "Yeti" && this.leapState === "leap") this.cancelLeap();
        if (this.mimicForm === "Vampire" && this.dashState !== "idle") this.endBloodDash(true);
        if (this.mimicForm === "Grappler" && this.latched && this.hookTarget) this.hookTarget.releasePin();
        if (this.mimicForm === "Ninja" && this.ropeDart?.hit && this.ropeDart.target) {
            this.ropeDart.target.vx = this.ropeDart.savedVx;
            this.ropeDart.target.vy = this.ropeDart.savedVy;
        }
        if (this.mimicForm === "Spearman") {
            for (const spear of this.projectiles) {
                if (!spear.isStuck || !spear.stuckTarget) continue;
                spear.stuckTarget.vx = spear.savedVx;
                spear.stuckTarget.vy = spear.savedVy;
                spear.stuckTarget.isStunned = false;
            }
        }
    }

    endCopiedForm() {
        this.preservePlacedAttacks();
        this.cleanupCopiedAbility();
        for (const [key, previous] of this.mimicSavedFields) {
            if (previous) this[key] = previous.value;
            else delete this[key];
        }
        this.mimicForm = null;
        this.mimicPrototype = null;
        this.mimicSavedFields = null;
        this.mimicTimer = BASE_SECONDS;
        Object.setPrototypeOf(this, Mimic.prototype);
    }

    preservePlacedAttacks() {
        const fields = { "Mine Layer": "mines", Spider: "webs", Snake: "trail", "Laser Beam": "lasers", Dragon: "fires" };
        const field = fields[this.mimicForm];
        if (!field || !this[field]?.length) return;
        const owner = Object.assign(Object.create(this.mimicPrototype), {
            [field]: this[field],
            damage: this.damage,
            particleSystem: this.particleSystem,
            MINE_RADIUS: this.MINE_RADIUS,
            trailLife: this.trailLife,
            dotAccumulators: this.dotAccumulators,
            animTime: this.animTime
        });
        if (field === "lasers") {
            for (const laser of owner.lasers) {
                if (!laser.fixed) {
                    laser.points.push({ x: this.x, y: this.y });
                    laser.fixed = true;
                }
            }
        }
        this.placedAttacks.push({ form: this.mimicForm, owner });
    }

    updatePlacedAttacks(dt, opponent) {
        this.placedAttacks = this.placedAttacks.filter(({ form, owner }) => {
            if (form === "Mine Layer") {
                owner.updateMines(dt, opponent, this);
                return owner.mines.length > 0;
            }
            if (form === "Spider") {
                owner.updateWebs(dt, opponent, this);
                return owner.webs.length > 0;
            }
            if (form === "Snake") {
                owner.updateTrail(dt, opponent, this);
                return owner.trail.length > 0;
            }
            if (form === "Dragon") {
                owner.animTime += dt;
                owner.updateFires(dt, opponent, this);
                return owner.fires.length > 0;
            }
            owner.animTime += dt;
            const victims = (this.victims?.length ? this.victims : [opponent]).filter(f => f && !f.isDead);
            owner.lasers = owner.lasers.filter(laser => owner.updateLaser(laser, dt, victims, this));
            return owner.lasers.length > 0;
        });
    }

    drawPlacedAttacks(ctx) {
        for (const { form, owner } of this.placedAttacks) {
            if (form === "Mine Layer") owner.drawMines(ctx);
            else if (form === "Spider") owner.drawWebs(ctx);
            else if (form === "Snake") owner.drawTrail(ctx);
            else if (form === "Dragon") for (const fire of owner.fires) owner.drawFire(ctx, fire);
            else for (const laser of owner.lasers) owner.drawLaser(ctx, laser);
        }
    }

    updateClones(dt, opponent) { Duplicator.prototype.updateClones.call(this, dt, opponent); }
    applyCloneContact(clone, victims) { Duplicator.prototype.applyCloneContact.call(this, clone, victims); }
    resolveCloneCollisions(clones, victims) { Duplicator.prototype.resolveCloneCollisions.call(this, clones, victims); }
    keepCloneInArena(clone) { Duplicator.prototype.keepCloneInArena.call(this, clone); }
    spawnClone() { Duplicator.prototype.spawnClone.call(this); }

    clearUnits() {
        this.placedAttacks = [];
        for (const clone of this.clones) clone.killCloneTree();
        this.clones = [];
    }

    killCloneTree() {
        this.cleanupCopiedAbility();
        this.isDead = true;
        this.health = 0;
        this.clearUnits();
    }

    die(particles) {
        const die = this.mimicPrototype?.die ?? FighterBase.prototype.die;
        die.call(this, particles);
        this.cleanupCopiedAbility();
        this.clearUnits();
    }

    draw(ctx) {
        if (this.isDead || this.health <= 0) return;
        this.drawPlacedAttacks(ctx);
        if (this.mimicForm !== "Duplicator") Duplicator.prototype.drawClones.call(this, ctx);
        const draw = this.mimicPrototype?.draw ?? FighterBase.prototype.draw;
        draw.call(this, ctx);
        if (!this.mimicForm && !this.isFrozen) {
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.globalAlpha *= this.isUntargetable ? 0.35 : 1;
            ctx.fillStyle = "#242020";
            for (const side of [-1, 1]) {
                ctx.beginPath();
                ctx.moveTo(side * this.radius * 0.15, -this.radius * 0.12);
                ctx.lineTo(side * this.radius * 0.65, -this.radius * 0.3);
                ctx.lineTo(side * this.radius * 0.45, this.radius * 0.05);
                ctx.closePath();
                ctx.fill();
            }
            ctx.strokeStyle = "#242020";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, this.radius * 0.28, this.radius * 0.3, 0.15, Math.PI - 0.15);
            ctx.stroke();
            ctx.restore();
        }
        if (this.mimicForm) {
            ctx.save();
            ctx.fillStyle = "#ffffff";
            ctx.font = "11px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(this.mimicForm, this.x, this.y - this.radius - 20);
            ctx.restore();
        }
    }
}
