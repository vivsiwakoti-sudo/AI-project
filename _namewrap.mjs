export default async function run(page) {
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  // Use the longest names so we test the worst case: "Duplicator" (61px) and
  // "Grappler" were the two that wrapped in the report.
  const runCount = async (count, names) => {
    await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.fighter-card', { timeout: 20000 });
    await page.waitForTimeout(600);
    await page.evaluate(() => document.querySelectorAll('.fighter-card-selected').forEach((c) => c.click()));
    await page.waitForTimeout(250);

    for (const n of names.slice(0, count)) {
      await page.locator('.fighter-card', { hasText: n }).first().click();
      await page.waitForTimeout(140);
    }
    await page.waitForTimeout(250);
    await page.locator('.start-battle-button').click();
    await page.waitForTimeout(4600);

    return await page.evaluate((count) => {
      const report = [];
      for (const p of document.querySelectorAll('.hud-panel')) {
        const h2 = p.querySelector('h2');
        const pb = p.getBoundingClientRect();
        // Measure how many line boxes the name occupies. A single line means it
        // did not wrap; two or more means the panel is still too skinny.
        const cs = getComputedStyle(h2);
        const lineHeight = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
        const lines = Math.round(h2.getBoundingClientRect().height / lineHeight);
        report.push({
          name: h2.textContent,
          panelW: Math.round(pb.width),
          nameBoxW: Math.round(h2.getBoundingClientRect().width),
          nameLines: lines,
          wrapped: lines > 1,
          overflowX: p.scrollWidth > p.clientWidth + 1,
        });
      }
      const layout = document.querySelector('.arena-layout');
      return {
        count,
        gridCols: getComputedStyle(layout).gridTemplateColumns,
        panels: report,
        anyWrapped: report.some((r) => r.wrapped),
        anyOverflow: report.some((r) => r.overflowX),
        horizontalScroll: document.documentElement.scrollWidth > innerWidth + 1,
      };
    }, count);
  };

  const two = await runCount(2, ['Duplicator', 'Grappler']);
  const three = await runCount(3, ['Duplicator', 'Grappler', 'Alchemist']);
  const four = await runCount(4, ['Duplicator', 'Grappler', 'Alchemist', 'Berserker']);

  return { two, three, four, pageErrors };
}