// Click/hover-based e2e for the clock-history popup features:
//   - search box (above the top item) filters the list
//   - hovering a row reveals edit + delete icons on the right
//   - edit renames the session inline; the label updates
//   - delete asks to confirm, then removes the session (server delete)
//   - "load more" (below the bottom item) fetches sessions beyond the synced set
import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { gotoProject, killAndWait, launchDesktopWithConfig, rendererPage, rmWithRetry } from "./helpers.js";

const provider = {
  npm: "@ai-sdk/openai-compatible",
  name: "Ollama",
  options: { baseURL: "http://127.0.0.1:9/v1", apiKey: "local" },
  models: { "test-model": { name: "Test Model" } },
};

async function openProjectWithChatPane(browser, root) {
  const project = path.join(root, "p");
  await mkdir(project, { recursive: true });
  const page = await rendererPage(browser);
  await page.evaluate(async () => {
    await window.api.storeSet("closedcode.global.dat", "layout", JSON.stringify({ chatPanel: { height: 300, opened: true } }));
  });
  await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
  if (!page.url().startsWith("vcc://renderer/index.html")) {
    await page.waitForURL("vcc://renderer/index.html**", { timeout: 60_000 });
  }
  await page.waitForLoadState("domcontentloaded");
  await page.waitForFunction(() => document.body && document.body.innerText.trim().length > 0, { timeout: 60_000 });
  await gotoProject(page, project);
  return page;
}

async function makeSessions(page, n) {
  const realTabs = page.locator('[data-slot="session-tab"][data-session-id]');
  for (let i = 1; i <= n; i++) {
    await page.locator('[data-slot="session-new"]').click();
    await expect(realTabs).toHaveCount(i, { timeout: 30_000 });
  }
}

test.describe("clock-history popup actions", () => {
  test("search filters, hover-edit renames, hover-delete removes", async () => {
    test.setTimeout(240_000);
    const { browser, child, root } = await launchDesktopWithConfig({ provider: { ollama: provider } });
    try {
      const page = await openProjectWithChatPane(browser, root);
      await makeSessions(page, 4);

      const popup = page.locator('[data-slot="session-popup"]');
      const rows = page.locator('[data-slot="session-popup-row"]');
      await page.locator('[data-slot="session-switch"]').first().click();
      await expect(popup).toBeVisible({ timeout: 10_000 });
      await expect(rows).toHaveCount(4);

      // --- hover reveals the edit/delete icons (opacity 0 -> 1) ---
      const firstRow = rows.first();
      const firstId = await firstRow.getAttribute("data-session-id");
      const editIcon = page.locator(`[data-slot="session-popup-row"][data-session-id="${firstId}"] [data-slot="session-popup-edit"]`);
      await expect(editIcon).toHaveCSS("opacity", "0");
      await firstRow.hover();
      await expect(editIcon).toHaveCSS("opacity", "1");

      // --- edit renames inline; the label updates ---
      await editIcon.click();
      const renameInput = page.locator('[data-slot="session-popup-rename-input"]');
      await expect(renameInput).toBeVisible({ timeout: 5_000 });
      await renameInput.fill("ZZZ-Renamed");
      await renameInput.press("Enter");
      const renamedLabel = page.locator(`[data-slot="session-popup-row"][data-session-id="${firstId}"] [data-slot="session-popup-item"]`);
      await expect(renamedLabel).toHaveText("ZZZ-Renamed", { timeout: 15_000 });

      // --- search filters to the renamed session ---
      const search = page.locator('[data-slot="session-popup-search"]');
      await search.fill("ZZZ");
      await expect(rows).toHaveCount(1);
      await expect(rows.first()).toHaveAttribute("data-session-id", firstId);
      await search.fill("");
      await expect(rows).toHaveCount(4);

      // --- delete asks to confirm, then removes the session ---
      const secondId = await rows.nth(1).getAttribute("data-session-id");
      const rowSel = `[data-slot="session-popup-row"][data-session-id="${secondId}"]`;
      await page.locator(rowSel).hover();
      await page.locator(`${rowSel} [data-slot="session-popup-delete"]`).click();
      await expect(page.locator(`${rowSel} [data-slot="session-popup-delete-yes"]`)).toBeVisible({ timeout: 5_000 });
      await page.locator(`${rowSel} [data-slot="session-popup-delete-yes"]`).click();
      await expect(page.locator(rowSel)).toHaveCount(0, { timeout: 15_000 });
      await expect(rows).toHaveCount(3);
    } finally {
      await browser.close().catch(() => {});
      await killAndWait(child);
      await rmWithRetry(root);
    }
  });

  test("'load more' reveals sessions beyond the synced/trimmed set", async () => {
    test.setTimeout(360_000);
    const { browser, child, root } = await launchDesktopWithConfig({ provider: { ollama: provider } });
    try {
      const page = await openProjectWithChatPane(browser, root);
      // The synced working set is trimmed to (5 base + 50 recent) = 55, so create
      // a few more than that to leave some only reachable via "load more".
      const N = 58;
      await makeSessions(page, N);

      const popup = page.locator('[data-slot="session-popup"]');
      const rows = page.locator('[data-slot="session-popup-row"]');
      const loadMore = page.locator('[data-slot="session-popup-loadmore"]');
      await page.locator('[data-slot="session-switch"]').first().click();
      await expect(popup).toBeVisible({ timeout: 10_000 });

      // Synced view shows fewer than all N, and the "load more" button is offered.
      const before = await rows.count();
      expect(before).toBeLessThan(N);
      expect(before).toBeGreaterThan(0);
      await expect(loadMore).toBeVisible();

      // Loading more fetches the full list: every session appears, button hides.
      await loadMore.click();
      await expect(rows).toHaveCount(N, { timeout: 30_000 });
      await expect(loadMore).toBeHidden();
    } finally {
      await browser.close().catch(() => {});
      await killAndWait(child);
      await rmWithRetry(root);
    }
  });
});
