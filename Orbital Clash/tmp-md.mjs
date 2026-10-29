import { chromium } from "playwright";

const out = "C:/Users/siwak/AppData/Local/Temp/";
let browser;
try { browser = await chromium.launch({ channel: "chrome" }); } catch { browser = await chromium.launch(); }
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", e => console.log("PAGEERROR", e.message));
await page.goto("http://localhost:5199/harness-tmp.html");
await page.waitForSelector(".champion-bracket-section .tb-match", { timeout: 60000 });
console.log("matches in bracket:", await page.locator(".champion-bracket-section .tb-match").count());

const card = page.locator('.champion-bracket-section [data-match-id="final-1"]');
await card.scrollIntoViewIfNeeded();
await card.click({ button: "right" });
await page.waitForSelector(".match-details");
console.log("popup text:", (await page.locator(".match-details").innerText()).replace(/\n+/g, " | "));
await page.screenshot({ path: out + "md-final.png" });

await page.keyboard.press("Escape");
await page.waitForTimeout(200);
console.log("closed by Esc:", (await page.locator(".match-details").count()) === 0);

// Another match, closed by clicking the backdrop.
await page.locator('.champion-bracket-section [data-match-id="prelim-1"]').click({ button: "right" });
await page.waitForSelector(".match-details");
console.log("prelim-1 title:", (await page.locator(".match-details-title").innerText()).replace(/\n+/g, " "));
await page.mouse.click(20, 20);
await page.waitForTimeout(200);
console.log("closed by backdrop:", (await page.locator(".match-details").count()) === 0);

// The page's own context menu must not open on a played match.
const prevented = await page.evaluate(() => new Promise(resolve => {
  const el = document.querySelector('.champion-bracket-section [data-match-id="prelim-2"]');
  const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
  el.dispatchEvent(event);
  resolve(event.defaultPrevented);
}));
console.log("native menu suppressed:", prevented);
await browser.close();
