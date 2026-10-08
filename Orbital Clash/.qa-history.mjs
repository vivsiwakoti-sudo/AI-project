// QA for the saved battle history: seed a couple of entries into localStorage,
// reload the roster, open the BATTLE HISTORY panel and read what actually
// rendered. Returns plain data so the runner prints it as JSON.
export default async function run(page, ui) {
  const url = page.url();

  // Seed a history the way the end screen would have written it.
  await page.evaluate(() => {
    const now = Date.now();
    localStorage.setItem("arena-battle-history", JSON.stringify([
      {
        timestamp: now,
        winner: "Knight",
        aborted: false,
        durationSeconds: 42,
        participants: [
          { name: "Knight", color: "#ffd166", placement: 1, kills: 2 },
          { name: "Duplicator", color: "#FF00FF", placement: 2, kills: 0 }
        ]
      },
      {
        timestamp: now - 60000,
        winner: null,
        aborted: true,
        durationSeconds: 7,
        participants: [
          { name: "Ghost", color: "#FFFFFF", placement: 1, kills: 0 },
          { name: "Snake", color: "#88ff88", placement: 2, kills: 1 }
        ]
      }
    ]));
  });

  await page.reload();
  await page.waitForTimeout(400);

  // The button label should show the count from the seeded log.
  const snapshot = await ui.snapshot();
  const entry = snapshot.match(/@(e\d+) button "BATTLE HISTORY/);
  if (!entry) return { error: "no BATTLE HISTORY button in snapshot", snapshot };

  await ui.click(entry[1]);
  await page.waitForTimeout(300);

  // Read the rendered panel text directly for precise assertions.
  const rendered = await page.evaluate(() => {
    const panel = document.querySelector(".battle-history-panel");
    return {
      exists: !!panel,
      outcome: Array.from(document.querySelectorAll(".battle-history-outcome")).map(n => n.textContent.trim()),
      fighters: Array.from(document.querySelectorAll(".battle-history-fighter")).map(n => n.textContent.replace(/\s+/g, " ").trim()),
      rows: document.querySelectorAll(".battle-history-row").length,
      aborted: document.querySelectorAll(".battle-history-aborted").length,
      clearButton: document.querySelector(".battle-history-clear")?.textContent.trim() || null,
      clearDisabled: document.querySelector(".battle-history-clear")?.disabled ?? null
    };
  });

  return { url, rendered };
}
