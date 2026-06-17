/** @file CDP debug script: attaches to the running desktop app via Playwright and, per the CLI mode argument ("dom", "reload", or default "screenshot"), inspects the review/file-tree panel layout, reloads the page, or captures a screenshot — reporting any error-boundary input value. */
import { chromium } from "playwright";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = browser.contexts();
if (!ctx.length) { console.log("No browser contexts"); process.exit(1); }
const page = ctx[0].pages().find(p => p.url().includes("renderer"));
if (!page) { console.log("No renderer page"); process.exit(1); }

const mode = process.argv[2] || "screenshot";

if (mode === "dom") {
  // Inspect the DOM layout structure
  const info = await page.evaluate(() => {
    const reviewPanel = document.getElementById("review-panel");
    const fileTreePanel = document.getElementById("file-tree-panel");
    const sessionLayout = reviewPanel?.parentElement;
    return {
      reviewPanel: reviewPanel ? {
        width: reviewPanel.style.width,
        display: getComputedStyle(reviewPanel).display,
        ariaHidden: reviewPanel.getAttribute("aria-hidden"),
        classList: Array.from(reviewPanel.classList),
        offsetWidth: reviewPanel.offsetWidth,
        offsetHeight: reviewPanel.offsetHeight
      } : null,
      fileTreePanel: fileTreePanel ? {
        width: fileTreePanel.style.width,
        display: getComputedStyle(fileTreePanel).display,
        ariaHidden: fileTreePanel.getAttribute("aria-hidden"),
        classList: Array.from(fileTreePanel.classList),
        offsetWidth: fileTreePanel.offsetWidth,
        offsetHeight: fileTreePanel.offsetHeight
      } : null,
      sessionLayout: sessionLayout ? {
        tag: sessionLayout.tagName,
        classList: Array.from(sessionLayout.classList),
        display: getComputedStyle(sessionLayout).display,
        flexDirection: getComputedStyle(sessionLayout).flexDirection,
        childCount: sessionLayout.childElementCount,
        children: Array.from(sessionLayout.children).map(c => ({
          id: c.id,
          tag: c.tagName,
          classList: Array.from(c.classList).slice(0, 10),
          width: c.style.width,
          computedWidth: getComputedStyle(c).width,
          flex: getComputedStyle(c).flex,
          offsetWidth: c.offsetWidth
        }))
      } : null,
      windowWidth: window.innerWidth
    };
  });
  console.log(JSON.stringify(info, null, 2));
} else if (mode === "reload") {
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: "artifacts/D2-reload.png" });
  console.log("Screenshot: artifacts/D2-reload.png");
  const val = await page.locator("input").first().inputValue().catch(() => "");
  if (val) console.log("ERROR BOUNDARY:", val);
} else {
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "artifacts/D1-filetree-left.png" });
  console.log("Screenshot saved");
  const val = await page.locator("input").first().inputValue().catch(() => "");
  if (val) console.log("ERROR BOUNDARY:", val);
}

await browser.close();
