// Click-based e2e for: (1) middle-clicking a session tab closes it, and (2) the
// chat pane shows the outer "チャット" CATEGORY tab above the session tabs
// (tabs-within-tabs scaffold for future categories like a terminal).
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

test.describe("session tab extras", () => {
  test("shows the チャット category tab and closes a tab on middle-click", async () => {
    test.setTimeout(240_000);
    const { browser, child, root } = await launchDesktopWithConfig({ provider: { ollama: provider } });
    try {
      const page = await openProjectWithChatPane(browser, root);

      // (2) The outer category tab is shown above the session tabs.
      const catTab = page.locator('[data-slot="category-tab"][data-category-id="chat"]');
      await expect(catTab).toBeVisible({ timeout: 30_000 });
      await expect(catTab).toContainText("チャット");
      await expect(catTab).toHaveAttribute("data-active", "true");

      // Create three session tabs.
      const realTabs = page.locator('[data-slot="session-tab"][data-session-id]');
      for (let i = 1; i <= 3; i++) {
        await page.locator('[data-slot="session-new"]').click();
        await expect(realTabs).toHaveCount(i, { timeout: 30_000 });
      }
      const ids = await realTabs.evaluateAll(els => els.map(e => e.getAttribute("data-session-id")));

      // (1) Middle-clicking a tab closes it.
      await page.locator(`[data-slot="session-tab"][data-session-id="${ids[0]}"]`).click({ button: "middle" });
      await expect(realTabs).toHaveCount(2, { timeout: 15_000 });
      await expect(page.locator(`[data-slot="session-tab"][data-session-id="${ids[0]}"]`)).toHaveCount(0);
    } finally {
      await browser.close().catch(() => {});
      await killAndWait(child);
      await rmWithRetry(root);
    }
  });

  test("the left sidebar shows the エクスプローラー category tab on top", async () => {
    test.setTimeout(180_000);
    const { browser, child, root } = await launchDesktopWithConfig({ provider: { ollama: provider } });
    try {
      const page = await openProjectWithChatPane(browser, root);
      const cat = page.locator('#file-tree-panel [data-slot="category-tab"][data-category-id="explorer"]');
      await expect(cat).toBeVisible({ timeout: 30_000 });
      await expect(cat).toContainText("エクスプローラー");
      await expect(cat).toHaveAttribute("data-active", "true");
    } finally {
      await browser.close().catch(() => {});
      await killAndWait(child);
      await rmWithRetry(root);
    }
  });
});
