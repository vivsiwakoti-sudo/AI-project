// Optional setup for testing enemy forms before a battle. Each control maps to
// one starting value on the fighter; anything not listed here keeps its normal
// behaviour.
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
    }
}
