import { chromium } from "playwright";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = browser.contexts();
const page = ctx[0].pages().find(p => p.url().includes("renderer"));

// Navigate to a session route
await page.evaluate(() => {
  window.location.hash = "#/session/test-empty-state";
});
await page.waitForTimeout(2000);

// Check what's in the center area by looking at all visible text and structure
const info = await page.evaluate(() => {
  // Check center area by finding the flex-column container
  const flexCols = document.querySelectorAll(".d-flex.flex-column.h-full, .flex.flex-col.h-full, [class*='flex'][class*='col']");

  // Check if there's a bi-code-square anywhere in the DOM
  const allIcons = document.querySelectorAll("[class*='bi-']");
  const iconClasses = Array.from(allIcons).slice(0, 20).map(i => i.className);

  // Check the Switch output — find template markers
  // Look for the center content wrapper
  const editorAreas = document.querySelectorAll(".flex-1.min-h-0.overflow-hidden");
  const editorInfo = Array.from(editorAreas).map(el => ({
    id: el.id,
    children: el.childElementCount,
    firstChildTag: el.firstElementChild?.tagName,
    firstChildClasses: el.firstElementChild?.className?.substring(0, 100),
    text: el.textContent?.trim().substring(0, 200)
  }));

  // Check the hash router params
  const hash = window.location.hash;

  // Check for "何でも作る" text — where does it appear?
  const buildAnything = document.evaluate(
    "//*[contains(text(), '何でも作る')]",
    document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
  ).singleNodeValue;
  const buildAnythingParent = buildAnything?.parentElement;

  return {
    hash,
    editorAreas: editorInfo,
    iconClasses: iconClasses,
    buildAnythingTag: buildAnything?.tagName,
    buildAnythingClasses: buildAnything?.className?.substring(0, 100),
    buildAnythingParentClasses: buildAnythingParent?.className?.substring(0, 200),
    buildAnythingGrandparentClasses: buildAnythingParent?.parentElement?.className?.substring(0, 200),
  };
});

console.log(JSON.stringify(info, null, 2));

// Navigate back
await page.evaluate(() => { window.location.hash = ""; });
await browser.close();
