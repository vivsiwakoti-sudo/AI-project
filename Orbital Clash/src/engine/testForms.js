// Optional setup for testing enemy forms before a battle. Each control maps to
// one starting value on the fighter; anything not listed here keeps its normal
// behaviour.
// A choice control picks one of its options. "random" keeps the fighter's normal roll
// and is the default; any other option applies to every throw, shot or hit.
function choice(key, label, options) {
    return {
        key,
        label,
        type: "choice",
        value: "random",
        options: [{ value: "random", label: "Random" }, ...options]
    };
}

const fixedChoice = value => (value === "random" ? null : value);

export const TEST_FORM_CONTROLS = {
    Vampire: [
        { key: "stage", label: "Evolution stage", min: 1, max: 4, step: 1, value: 1, unit: "" }
    ],
    "Solar Beam": [
        { key: "cooldown", label: "Cooldown", min: 2, max: 8, step: 0.5, value: 8, unit: "s" }
    ],
    Berserker: [
        { key: "speedPercent", label: "Starting speed", min: 100, max: 1000, step: 10, value: 100, unit: "%" }
    ],
    Mutant: [
        { key: "damage", label: "Damage", min: 10, max: 100, step: 1, value: 55, unit: "" },
        { key: "health", label: "Health", min: 100, max: 250, step: 1, value: 175, unit: " HP" }
    ],
    Mahoraga: [
        { key: "stage", label: "Pre-adapted stage", min: 1, max: 3, step: 1, value: 1, unit: "" }
    ],
    Fireball: [
        { key: "amount", label: "Starting fireballs", min: 1, max: 50, step: 1, value: 1, unit: "" }
    ],
    Duplicator: [
        { key: "clones", label: "Starting clones", min: 0, max: 75, step: 1, value: 0, unit: "" }
    ],
    Alchemist: [
        choice("potion", "Potion", [
            { value: "slow", label: "Slow" },
            { value: "poison", label: "Poison" },
            { value: "stun", label: "Stun" },
            { value: "percent", label: "Percent" },
            { value: "vampire", label: "Vampire" }
        ])
    ],
    Gambler: [
        choice("face", "Die face", [
            { value: "stun", label: "Stun" },
            { value: "burn", label: "Burn" },
            { value: "percent", label: "Percent" },
            { value: "heal", label: "Heal" },
            { value: "selfPercent", label: "Self percent" },
            { value: "selfBurn", label: "Self burn" },
            { value: "shield", label: "Shield" },
            { value: "vulnerable", label: "Vulnerable" }
        ])
    ],
    Gunner: [
        choice("pattern", "Combo", [
            { value: 0, label: "1 bullet · 15 dmg" },
            { value: 1, label: "10 bullets · 10 dmg" },
            { value: 2, label: "3 bullets · 7 dmg" },
            { value: 3, label: "4 bullets · 5 dmg" }
        ])
    ],
    Ninja: [
        choice("effect", "Rope dart effect", [
            { value: "fire", label: "Fire" },
            { value: "electric", label: "Electric" },
            { value: "shrink", label: "Shrink" }
        ])
    ],
    Yeti: [
        { key: "freezeChance", label: "Freeze chance", min: 0, max: 100, step: 5, value: 25, unit: "%" }
    ]
};

export const TEST_FORM_FIGHTERS = Object.keys(TEST_FORM_CONTROLS);

export function hasTestableFighter(names) {
    return names.some(name => TEST_FORM_FIGHTERS.includes(name));
}

export function defaultTestForm(name) {
    return Object.fromEntries((TEST_FORM_CONTROLS[name] ?? []).map(control => [control.key, control.value]));
}

export function applyTestForm(fighter, form) {
    if (!form) return;
    switch (fighter.name) {
        case "Vampire":
            // Stage 1 is the base Vampire; each further stage applies one evolution's stats.
            for (let i = 1; i < form.stage; i++) fighter.gainEvolutionStats();
            break;
        case "Solar Beam":
            fighter.cooldown = form.cooldown;
            break;
        case "Berserker":
            fighter.rotationSpeed = form.speedPercent / 100;
            break;
        case "Mutant":
            fighter.setFixedMutation({ damage: form.damage, maxHealth: form.health });
            break;
        case "Mahoraga":
            fighter.preAdapt(form.stage);
            break;
        case "Fireball":
            // The first volley fires shotsFired + 1 fireballs, so this sets its size to `amount`.
            fighter.shotsFired = form.amount - 1;
            break;
        case "Duplicator":
            for (let i = 0; i < form.clones; i++) fighter.spawnClone();
            break;
        case "Alchemist":
            fighter.setFixedPotion(fixedChoice(form.potion));
            break;
        case "Gambler":
            fighter.setFixedFace(fixedChoice(form.face));
            break;
        case "Gunner":
            fighter.setFixedPattern(fixedChoice(form.pattern));
            break;
        case "Ninja":
            fighter.setFixedEffect(fixedChoice(form.effect));
            break;
        case "Yeti":
            fighter.freezeChance = form.freezeChance / 100;
            break;
    }
}
