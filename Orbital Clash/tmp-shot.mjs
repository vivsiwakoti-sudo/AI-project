import { chromium } from "playwright";

const out = "C:/Users/siwak/AppData/Local/Temp/";
const size = Number(process.argv[2] || 1000);
let browser;
try { browser = await chromium.launch({ channel: "chrome" }); } catch { browser = await chromium.launch(); }
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", e => console.log("PAGEERROR", e.message));
await page.goto("http://localhost:5199/");
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.getByRole("button", { name: /TOURNAMENT MODE/ }).click();
await page.waitForSelector(".tournament-overview");
await page.waitForTimeout(700);

const info = () => page.evaluate(() => {
  const q = s => document.querySelector(s);
  return {
    stage: [q(".tournament-overview-stage")?.clientWidth, q(".tournament-overview-stage")?.clientHeight],
    bracket: [q(".overview-bracket")?.offsetWidth, q(".overview-bracket")?.offsetHeight],
    transform: q(".overview-bracket")?.style.transform
  };
});
console.log("overview", JSON.stringify(await info()));
await page.screenshot({ path: out + "ov-1-default.png" });

await page.getByRole("radio", { name: `${size}x${size}` }).click();
await page.waitForTimeout(200);
console.log("saved size:", await page.evaluate(() => JSON.parse(localStorage.getItem("orbital-clash-tournament-active")).arenaSize));

await page.getByRole("button", { name: /BEGIN TOURNAMENT/ }).click();
const t0 = Date.now();
for (const ms of [350, 800, 1150, 1450]) {
  await page.waitForTimeout(Math.max(0, ms - (Date.now() - t0)));
  const r = await page.evaluate(() => {
    const card = document.querySelector('.overview-bracket [data-match-id="prelim-1"]')?.getBoundingClientRect();
    const stage = document.querySelector(".tournament-overview-stage")?.getBoundingClientRect();
    const ov = document.querySelector(".tournament-overview");
    return {
      card: card && [Math.round(card.width), Math.round(card.height)],
      stage: stage && [Math.round(stage.width), Math.round(stage.height)],
      overlayOpacity: ov ? getComputedStyle(ov).opacity : "gone"
    };
  });
  console.log(`t=${Date.now() - t0}ms`, JSON.stringify(r));
  await page.screenshot({ path: out + `ov-2-zoom-${ms}.png` });
}
await page.waitForTimeout(2500);
console.log("overview gone:", (await page.locator(".tournament-overview").count()) === 0);
const arena = await page.evaluate(() => {
  const c = document.querySelector(".tournament-canvas");
  const r = c.getBoundingClientRect();
  return { attr: [c.width, c.height], css: [Math.round(r.width), Math.round(r.height)], badge: [...document.querySelectorAll(".tournament-progress")].map(e => e.textContent) };
});
console.log("arena", JSON.stringify(arena));
await page.waitForTimeout(3500);
await page.screenshot({ path: out + "ov-3-arena.png" });
await browser.close();
