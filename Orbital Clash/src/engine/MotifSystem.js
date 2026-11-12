// One emoji per class, chosen for the class's main ability.
const CLASS_ICONS = {
    "Ice Sword": "\u2744\uFE0F",
    "Snake": "\u{1F40D}",
    "Ninja": "\u{1F977}",
    "Spearman": "\u{1F531}",
    "Gunner": "\u{1F52B}",
    "Samurai": "\u2694\uFE0F",
    "Grappler": "\u{1FA9D}",
    "Mine Layer": "\u{1F4A3}",
    "Fireball": "\u{1F525}",
    "Duplicator": "\u{1F46F}",
    "Ghost": "\u{1F47B}",
    "Alchemist": "\u{1F9EA}",
    "Assassin": "\u{1F5E1}\uFE0F",
    "Mutant": "\u{1F9EC}",
    "Knight": "\u{1F6E1}\uFE0F",
    "Solar Beam": "\u2600\uFE0F",
    "Berserker": "\u{1FA93}",
    "Spider": "\u{1F577}\uFE0F",
    "Tunneler": "\u26CF\uFE0F",
    "Tornado": "\u{1F32A}\uFE0F",
    "Meteor": "\u2604\uFE0F",
    "Black Hole": "\u{1F573}\uFE0F",
    "Reaper": "\u{1F480}",
    "Vampire": "\u{1F9DB}",
    "Mahoraga": "\u2638\uFE0F",
    "Summoner": "\u{1F9DF}",
    "Yeti": "\u{1F43E}",
    "Dragon": "\u{1F409}",
    "Striker": "\u2708\uFE0F",
    "Laser Beam": "\u26A1",
};

export const renderMotif = (ctx, x, y, className) => {
    ctx.save();
    ctx.translate(x, y);
    const icon = CLASS_ICONS[className];
    if (icon) {
        ctx.font = "30px 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(icon, 0, 1);
    } else {
        // Fallback ring for any class without an icon.
        ctx.strokeStyle = "#00f2ff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.restore();
};
