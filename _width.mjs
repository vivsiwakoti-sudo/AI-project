export default async function run(page) {
  await page.waitForSelector('.fighter-card', { timeout: 20000 });
  await page.waitForTimeout(800);

  return await page.evaluate(async () => {
    const { FIGHTER_CLASSES } = await import('/src/engine/fighterDefinitions.js');
    const names = Object.keys(FIGHTER_CLASSES);

    // Measure each name at the skinny header font, using a canvas so we get the
    // exact rendered width rather than estimating from character counts.
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');

    const measureAt = (font, letterSpacing) => {
      ctx.font = font;
      const out = {};
      for (const n of names) {
        // Approximate letter-spacing by adding it per character.
        const w = ctx.measureText(n).width + letterSpacing * n.length;
        out[n] = Math.ceil(w);
      }
      return out;
    };

    // The skinny header currently renders at 0.72rem with 0.03em spacing.
    const skinny = measureAt('700 11.52px "Oxanium", sans-serif', 0.03 * 11.52);
    // 16px is the root default; the class font-family is --font-ui (Oxanium).
    const at16 = measureAt('700 16px "Oxanium", sans-serif', 0.03 * 16);

    const sorted = Object.entries(skinny).sort((a, b) => b[1] - a[1]);
    return {
      totalNames: names.length,
      widestSkinny: sorted.slice(0, 8),
      widest16: Object.entries(at16).sort((a, b) => b[1] - a[1]).slice(0, 8),
      // The header row is icon + gap + text. Skinny icon is 30px, gap 6px.
      skinnyIcon: 30, skinnyGap: 6,
      neededPanelWidthSkinny: sorted[0][1] + 30 + 6 + 2 * 8 /* padding */,
    };
  });
}