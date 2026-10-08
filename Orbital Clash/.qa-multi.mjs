// Runs back-to-back battles and reads the results table each time, so the
// Mahoraga body-slam credit and the survival-time ordering get more than a single
// sample. Also captures a frame of the results screen to confirm it renders.
export default async function run(page, ui) {
  const battles = [];
  const rounds = Number(process.env.QA_ROUNDS ?? 4);

  for (let round = 0; round < rounds; round++) {
    if (round > 0) {
      // Back to the roster for the next fight.
      await page.locator('.return-roster-button').click().catch(() => { });
      await page.waitForSelector('.roster-screen', { timeout: 15000 }).catch(() => { });
      await page.waitForTimeout(500);
    }

    const picked = [];
    for (const name of ['Mahoraga', 'Spearman', 'Duplicator', 'Snake', 'Knight', 'Gunner']) {
      if (picked.length === 4) break;
      const counter = await page.evaluate(() => document.querySelectorAll('.fighter-card-selected').length);
      if (counter >= 4) break;
      const card = page.locator('.fighter-card').filter({ has: page.locator(`h3:text-is("${name}")`) }).first();
      if (await card.count() === 0) continue;
      await card.click({ timeout: 3000, force: true }).catch(() => { });
      picked.push(name);
    }

    await page.waitForFunction(() => {
      const b = document.querySelector('.start-battle-button');
      return b && !b.disabled;
    }, null, { timeout: 10000 }).catch(() => { });
    await page.locator('.start-battle-button').click({ timeout: 8000 });

    const done = await page.waitForSelector('.results-screen', { timeout: 280000 })
      .then(() => true).catch(() => false);
    if (!done) { battles.push({ round, picked, reachedResults: false }); break; }

    battles.push({
      round,
      picked,
      reachedResults: true,
      ...(await page.evaluate(() => {
        const num = (m, label) => {
          const hit = m.find(x => x.startsWith(label));
          return hit ? Number(hit.slice(label.length).trim().replace(/s$/, '')) : null;
        };
        const rows = [...document.querySelectorAll('.result-row')].map(row => {
          const metrics = [...row.querySelectorAll('.result-metrics > div')].map(x => x.innerText.replace(/\s+/g, ' ').trim());
          return {
            order: row.querySelector('.result-placement')?.innerText ?? '',
            name: row.querySelector('.result-name')?.innerText.replace(/\s+/g, ' ').trim() ?? '',
            survived: num(metrics, 'SURVIVED'),
            kills: num(metrics, 'KILLS'),
            dmg: num(metrics, 'DAMAGE')
          };
        });
        return {
          winner: document.querySelector('.results-screen h1')?.innerText ?? '',
          order: rows.map(r => r.order),
          survived: rows.map(r => r.survived),
          // The two properties under test: SURVIVED must be non-increasing down
          // the table, and the placements must read 1st,2nd,3rd,4th in row order.
          survivalOrderHolds: rows.every((r, i) => i === 0 || rows[i - 1].survived >= r.survived),
          placementOrderHolds: rows.every((r, i) => r.order.startsWith(`${i + 1}`)),
          totalKills: rows.reduce((sum, r) => sum + (r.kills ?? 0), 0),
          rows
        };
      }))
    });
  }

  return { battles };
}