// Smoke for the settings dialog — the boot smoke cannot catch regressions here
// because settings load lazily. Guards the exact failures we hit during the
// vanilla-JS rewrite: blank tab panes (Tabs context/eval-order), dead tab
// clicks, and frozen conditional UI. Run this after every settings-* rewrite.
import { expect, test } from "@playwright/test";
import {
  killAndWait,
  launchDesktopWithConfig,
  rendererPage,
  rmWithRetry,
  shot,
} from "./helpers.js";

test.describe("settings smoke", () => {
  let cleanup = [];

  test.afterEach(async () => {
    for (const item of cleanup.splice(0).reverse()) {
      await item();
    }
  });

  test("opens with the general tab populated and tabs switch", async () => {
    test.setTimeout(180_000);
    const { browser, child, root } = await launchDesktopWithConfig({});
    cleanup.push(async () => rmWithRetry(root));
    cleanup.push(async () => killAndWait(child));
    cleanup.push(async () => browser.close().catch(() => undefined));

    const page = await rendererPage(browser);
    await page.locator('button[aria-label="設定"]:visible').first().click();

    const dialog = page.locator('[role="dialog"]').first();
    // General tab content must be visible by default (NOT a blank pane).
    await expect(dialog.getByText("外観").first()).toBeVisible({ timeout: 30_000 });

    // Switching tabs must actually swap the pane content.
    await dialog.getByText("ショートカット", { exact: true }).first().click();
    await expect(dialog.getByText("外観")).not.toBeVisible();

    await dialog.getByText("サーバー・プロバイダ", { exact: true }).first().click();
    await expect(dialog.getByText(/プロバイダ(ー)?を追加/).first()).toBeVisible({ timeout: 15_000 });

    await shot(page, "e2e-settings-smoke");
  });
});
