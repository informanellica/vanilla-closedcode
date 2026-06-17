/** @file CDP debug script: attaches to the running desktop app via Playwright, toggles the Bootstrap dark/light theme on the renderer, captures before/after screenshots into artifacts/, and reports any error-boundary input value. */
import { chromium } from "playwright";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = browser.contexts();
if (!ctx.length) { console.log("No browser contexts"); process.exit(1); }
const page = ctx[0].pages().find(p => p.url().includes("renderer"));
if (!page) { console.log("No renderer page"); process.exit(1); }

// Toggle to dark mode
await page.evaluate(() => {
  document.documentElement.setAttribute("data-bs-theme", "dark");
});
await page.waitForTimeout(1000);

await page.screenshot({ path: "artifacts/G2-devmode-dark.png" });
console.log("Screenshot: artifacts/G2-devmode-dark.png");

// Toggle back to light
await page.evaluate(() => {
  document.documentElement.setAttribute("data-bs-theme", "light");
});
await page.waitForTimeout(500);

await page.screenshot({ path: "artifacts/G3-devmode-light.png" });
console.log("Screenshot: artifacts/G3-devmode-light.png");

const val = await page.locator("input").first().inputValue().catch(() => "");
if (val) console.log("ERROR BOUNDARY:", val);
else console.log("No error boundary");

await browser.close();
