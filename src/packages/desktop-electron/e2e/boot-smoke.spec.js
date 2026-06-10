// FIRST-PRIORITY smoke: the app must boot to a working renderer — not the
// "問題が発生しました" crash page. Three real regressions this would have
// caught: createElement(component-fn) in DropdownMenuTrigger, and two
// InvalidCharacterError classList bugs, each of which killed boot entirely.
import { expect, test } from "@playwright/test";
import {
  killAndWait,
  launchDesktopWithConfig,
  rendererPage,
  rmWithRetry,
  shot,
} from "./helpers.js";

test.describe("boot smoke", () => {
  let cleanup = [];

  test.afterEach(async () => {
    for (const item of cleanup.splice(0).reverse()) {
      await item();
    }
  });

  test("boots to the home screen without the crash page", async () => {
    test.setTimeout(180_000); // first run migrates the DB in a cold temp profile
    const { browser, child, root } = await launchDesktopWithConfig({});
    cleanup.push(async () => rmWithRetry(root));
    cleanup.push(async () => killAndWait(child));
    cleanup.push(async () => browser.close().catch(() => undefined));

    const page = await rendererPage(browser);
    // SPA mounted with real content…
    await page.waitForFunction(
      () => document.body && document.body.innerText.trim().length > 0,
      { timeout: 30_000 },
    );
    const body = await page.locator("body").innerText();
    // …and it is NOT the error boundary.
    expect(body).not.toContain("問題が発生しました");
    // Home shows the welcome hero (unique, always visible on the home route).
    await expect(page.getByText("ようこそ")).toBeVisible({ timeout: 30_000 });
    await shot(page, "e2e-boot-smoke");
  });
});
