export default async function run(page) {
  await page.waitForSelector('.fighter-card', { timeout: 20000 });
  await page.waitForTimeout(600);
  await page.evaluate(() => document.querySelectorAll('.fighter-card-selected').forEach((c) => c.click()));
  await page.waitForTimeout(250);
  for (const n of ['Duplicator', 'Grappler', 'Alchemist', 'Berserker']) {
    await page.locator('.fighter-card', { hasText: n }).first().click();
    await page.waitForTimeout(140);
  }
  await page.waitForTimeout(250);
  await page.locator('.start-battle-button').click();
  await page.waitForTimeout(4800);

  return await page.evaluate(() => {
    const out = [];
    for (const p of document.querySelectorAll('.hud-panel')) {
      const pb = p.getBoundingClientRect();
      const offenders = [];
      for (const el of p.querySelectorAll('*')) {
        const b = el.getBoundingClientRect();
        // Which descendants stick out past the panel's content box?
        if (b.right > pb.right + 1 || b.left < pb.left - 1) {
          offenders.push({
            cls: String(el.className).slice(0, 40),
            tag: el.tagName,
            text: (el.textContent || '').trim().slice(0, 18),
            left: Math.round(b.left), right: Math.round(b.right),
            overhang: Math.round(Math.max(b.right - pb.right, pb.left - b.left)),
            scrollW: el.scrollWidth, clientW: el.clientWidth,
          });
        }
      }
      out.push({
        name: p.querySelector('h2')?.textContent,
        panelW: Math.round(pb.width),
        scrollW: p.scrollWidth,
        clientW: p.clientWidth,
        offenders: offenders.slice(0, 6),
      });
    }
    return out;
  });
}