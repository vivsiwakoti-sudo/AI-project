// Drives a real 4-way battle to the results screen and reports what happened.
// The point is to exercise the damage system + targeting changes in the app, and
// to read the CAST (un-minified) arena sources via plain fetch, which returns the
// files vite serves without transforming them.
export default async function run(page, ui) {
  const out = { steps: [] };

  // Pick four very different classes: a body class (Mahoraga), a ranged class
  // (Spearman), a melee class (Knight) and an AoE class (Meteor).
  // Click the cards by their own DOM rather than by accessibility ref: the cards
  // are divs, so a re-snapshot renumbers the refs and a stale one hangs.
  for (const name of ['Mahoraga', 'Spearman', 'Knight', 'Meteor']) {
    const card = page.locator('.fighter-card').filter({ has: page.locator(`h3:text-is("${name}")`) }).first();
    if (await card.count() === 0) { out.steps.push(`no card for ${name}`); continue; }
    await card.click({ timeout: 3000 }).catch(async () => { await card.click({ force: true }); });
    out.steps.push(`selected ${name}`);
  }

  out.selected = await page.evaluate(() => document.querySelectorAll('.fighter-card-selected').length);

  const start = page.locator('.start-battle-button');
  await page.waitForFunction(() => { const b = document.querySelector('.start-battle-button'); return b && !b.disabled; }, null, { timeout: 8000 })
    .catch(() => {});
  await start.click({ timeout: 5000 });
  out.steps.push('started battle');

  // Wait for the results screen rather than a fixed delay: a fight can run for
  // minutes, and a client-rendered screen that is merely slow looks broken.
  const reachedResults = await page.waitForSelector('.results-screen', { timeout: 240000 })
    .then(() => true).catch(() => false);
  out.reachedResults = reachedResults;

  if (!reachedResults) {
    out.hud = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 1200));
    return out;
  }

  // Read the results table exactly as the player sees it.
  out.results = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.result-row')].map(row => ({
      order: row.querySelector('.result-placement')?.innerText ?? '',
      name: row.querySelector('.result-name')?.innerText.replace(/\s+/g, ' ') ?? '',
      outcome: row.querySelector('.result-outcome')?.innerText ?? '',
      metrics: [...row.querySelectorAll('.result-metrics > div')].map(m => m.innerText.replace(/\s+/g, ' ').trim())
    }));
    // The pair that proves ordering: the placement shown in the row label next to
    // the SURVIVED seconds the row reports. If these two ever disagree, the list
    // is being sorted by something other than survival time.
    return {
      summary: document.querySelector('.results-summary')?.innerText.replace(/\s+/g, ' ') ?? '',
      winner: document.querySelector('.results-screen h1')?.innerText ?? '',
      orderVsSurvival: rows.map(r => `${r.order}=${r.metrics.find(m => m.startsWith('SURVIVED')) ?? '?'}`),
      rows
    };
  });

  return out;
}