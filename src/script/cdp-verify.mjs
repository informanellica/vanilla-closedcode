import { chromium } from "playwright";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = browser.contexts();
if (!ctx.length) { console.log("No browser contexts"); process.exit(1); }
const page = ctx[0].pages().find(p => p.url().includes("renderer"));
if (!page) { console.log("No renderer page"); process.exit(1); }

const errors = [];
page.on("console", msg => {
  if (msg.type() === "error") errors.push(msg.text());
});
page.on("pageerror", err => errors.push("PAGE ERROR: " + err.message));

await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(5000);

console.log("Console errors:", errors.length);
errors.forEach(e => console.log("  -", e.substring(0, 300)));

const val = await page.locator("input").first().inputValue().catch(() => "");
if (val) console.log("ERROR BOUNDARY:", val);
else console.log("No error boundary");

await page.screenshot({ path: "artifacts/G1-devmode-verify.png" });
console.log("Screenshot: artifacts/G1-devmode-verify.png");

await browser.close();
