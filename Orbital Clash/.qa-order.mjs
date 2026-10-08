// Repeatedly reads the results table and asserts the two invariants the fix
// depends on: rows are ordered longest-survival-first, and SURVIVED never
// contradicts the row order.
export default async function run(page, ui) {
  const rows = await page.evaluate(() => {
    return [...document.querySelectorAll('.result-row')].map(row => {
      const text = row.innerText.replace(/\s+/g, ' ');
      return {
        heading: row.querySelector('header')?.innerText.replace(/\s+/g, ' ') ?? '',
        survived: Number(text.match(/SURVIVED (\d+)s/)?.[1] ?? NaN),
        placement: Number(text.match(/(\d)(?:st|nd|rd|th)/)?.[1] ?? NaN),
        isWinner: row.classList.contains('result-row-winner')
      };
    });
  });

  const order = rows.map(r => r.survived);
  const placements = rows.map(r => r.placement);
  return {
    rows,
    survivedDescending: order.every((v, i) => i === 0 || order[i - 1] >= v),
    placementsAscending: placements.every((v, i) => i === 0 || placements[i - 1] + 1 === v),
    winnerIsFirstRow: rows[0]?.isWinner === true
  };
}