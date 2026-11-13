import { FighterBase } from "../FighterBase.js";
import { Duplicator } from "./Duplicator.js";
import { Summoner } from "./Summoner.js";
import { FighterFactory } from "../../FighterFactory.js";
import { FIGHTER_CLASSES } from "../../fighterDefinitions.js";

const BASE_SECONDS = 5;
const COPY_SECONDS = 11;
const EXCLUDED = new Set(["Mimic", "Mahoraga", "Mutant"]);
export const MIMIC_CLASSES = Object.keys(FIGHTER_CLASSES).filter(name => !EXCLUDED.has(name));

const SHARED_ABILITY_FIELDS = new Set([
    "attackType", "cooldown", "cooldownTimer", "weaponAngle", "weaponSpin",
    "weaponReach", "weaponHot"
]);
const PERSISTENT_UNITS = new Set(["clones", "summons", "root", "generation", "totalClones", "cloneLimit"]);
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
        this.clones = [];
        this.summons = [];
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
            const step = Math.min(remaining, this.mimicTimer);
            const form = this.mimicForm;
            const update = this.mimicPrototype?.update ?? FighterBase.prototype.update;
            update.call(this, step, opponent);
            if (this.isDead || this.health <= 0) {
                this.cleanupCopiedAbility();
                this.clearUnits();
                return;
            }
            if (form !== "Duplicator" && this.clones.length) this.updateClones(step, opponent);
            if (form !== "Summoner") {
                this.summons = this.summons.filter(summon => {
                    if (!summon.isDead && summon.health > 0) return true;
                    summon.killCloneTree?.();
                    return false;
                });
            }
            this.mimicTimer -= step;
            remaining -= step;
            if (this.mimicTimer <= 1e-9) {
                if (this.mimicForm) this.endCopiedForm();
                else this.startCopiedForm(MIMIC_CLASSES[Math.floor(Math.random() * MIMIC_CLASSES.length)]);
            }
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
        // A fresh Summoner normally waits 15 seconds, longer than a copied form.
        if (name === "Summoner") this.summonTimer = 0;
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

    updateClones(dt, opponent) { Duplicator.prototype.updateClones.call(this, dt, opponent); }
    applyCloneCombatHits(clone, opponent) { Duplicator.prototype.applyCloneCombatHits.call(this, clone, opponent); }
    resolveCloneCollisions(clones, victims) { Duplicator.prototype.resolveCloneCollisions.call(this, clones, victims); }
    keepCloneInArena(clone) { Duplicator.prototype.keepCloneInArena.call(this, clone); }
    spawnClone() { Duplicator.prototype.spawnClone.call(this); }

    clearUnits() {
        for (const clone of this.clones) clone.killCloneTree();
        this.clones = [];
        Summoner.prototype.killSummons.call(this);
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
        if (this.mimicForm !== "Duplicator") Duplicator.prototype.drawClones.call(this, ctx);
        if (this.mimicForm !== "Summoner") {
            for (const summon of this.summons) {
                if (!summon.isDead && summon.health > 0) summon.draw(ctx);
            }
        }
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
