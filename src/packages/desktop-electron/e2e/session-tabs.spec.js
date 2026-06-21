// Click-based e2e for the session TAB operations in the chat pane header:
//   1. "+" grows the tab strip (each click creates a real session tab)
//   2. clicking a tab switches the active session
//   3. "×" on a tab closes it (active-tab close falls back to a remaining tab)
//   4. the pencil renames the active tab inline
// session.create / session.update are server-side operations (no model
// inference), so a dead-port provider drives all of this without a live LLM.
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

// Boot the desktop, force the chat pane open, and open a fresh project so the
// session tab bar is mounted with no session selected.
async function openProjectWithChatPane(browser, root) {
  const project = path.join(root, "p");
  await mkdir(project, { recursive: true });
  const page = await rendererPage(browser);
  await page.evaluate(async () => {
    await window.api.storeSet(
      "closedcode.global.dat",
      "layout",
      JSON.stringify({ chatPanel: { height: 300, opened: true } }),
    );
  });
  await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
  if (!page.url().startsWith("vcc://renderer/index.html")) {
    await page.waitForURL("vcc://renderer/index.html**", { timeout: 60_000 });
  }
  await page.waitForLoadState("domcontentloaded");
  await page.waitForFunction(() => document.body && document.body.innerText.trim().length > 0, {
    timeout: 60_000,
  });
  await gotoProject(page, project);
  return page;
}

test.describe("session tabs (click-based)", () => {
  test("'+' grows tabs, clicking a tab switches, '×' closes", async () => {
    test.setTimeout(240_000);
    const { browser, child, root } = await launchDesktopWithConfig({ provider: { ollama: provider } });
    try {
      const page = await openProjectWithChatPane(browser, root);

      const realTabs = page.locator('[data-slot="session-tab"][data-session-id]');
      const activeTab = page.locator('[data-slot="session-tab"][data-active="true"]');
      const newButton = page.locator('[data-slot="session-new"]');

      // Initial state: one transient "新規セッション" tab, no real session yet.
      await expect(page.locator('[data-slot="session-tab-label"]').first()).toHaveText("新規セッション", {
        timeout: 30_000,
      });
      await expect(realTabs).toHaveCount(0);

      // --- "+" GROWS the tab strip: each click adds a real session tab. ---
      await newButton.click();
      await expect(realTabs).toHaveCount(1, { timeout: 30_000 });
      await newButton.click();
      await expect(realTabs).toHaveCount(2, { timeout: 30_000 });
      await newButton.click();
      await expect(realTabs).toHaveCount(3, { timeout: 30_000 });

      // Capture the three session ids in tab order.
      const ids = await realTabs.evaluateAll(els => els.map(e => e.getAttribute("data-session-id")));
      expect(ids).toHaveLength(3);

      // The most recently created tab is the active one.
      await expect(activeTab).toHaveAttribute("data-session-id", ids[2]);

      // --- TAB SWITCH: clicking the first tab's label activates it. ---
      await page.locator(`[data-slot="session-tab"][data-session-id="${ids[0]}"] [data-slot="session-tab-label"]`).click();
      await expect(activeTab).toHaveAttribute("data-session-id", ids[0], { timeout: 15_000 });

      // --- "×" CLOSE (non-active tab): removes just that tab. ---
      await page.locator(`[data-slot="session-tab"][data-session-id="${ids[1]}"] [data-slot="session-tab-close"]`).click();
      await expect(realTabs).toHaveCount(2, { timeout: 15_000 });
      await expect(page.locator(`[data-slot="session-tab"][data-session-id="${ids[1]}"]`)).toHaveCount(0);

      // --- "×" CLOSE (active tab): falls back to a remaining tab, never blank. ---
      await page.locator(`[data-slot="session-tab"][data-session-id="${ids[0]}"] [data-slot="session-tab-close"]`).click();
      await expect(realTabs).toHaveCount(1, { timeout: 15_000 });
      await expect(activeTab).toHaveAttribute("data-session-id", ids[2]);
    } finally {
      await browser.close().catch(() => {});
      await killAndWait(child);
      await rmWithRetry(root);
    }
  });

  test("the pencil renames the active session tab inline", async () => {
    test.setTimeout(240_000);
    const { browser, child, root } = await launchDesktopWithConfig({ provider: { ollama: provider } });
    try {
      const page = await openProjectWithChatPane(browser, root);

      const realTabs = page.locator('[data-slot="session-tab"][data-session-id]');
      await page.locator('[data-slot="session-new"]').click();
      await expect(realTabs).toHaveCount(1, { timeout: 30_000 });
      const id = await realTabs.first().getAttribute("data-session-id");

      // The rename pencil is shown only on the active tab; click it.
      const pencil = page.locator(`[data-slot="session-tab"][data-session-id="${id}"] [data-slot="session-rename"]`);
      await expect(pencil).toBeVisible({ timeout: 15_000 });
      await pencil.click();

      // An inline input appears; type a new name and commit with Enter.
      const input = page.locator('[data-slot="session-name-input"]');
      await expect(input).toBeVisible({ timeout: 5_000 });
      await input.fill("リネーム済みセッション");
      await input.press("Enter");

      // The tab label reflects the new name (optimistic + server-confirmed).
      await expect(
        page.locator(`[data-slot="session-tab"][data-session-id="${id}"] [data-slot="session-tab-label"]`),
      ).toHaveText("リネーム済みセッション", { timeout: 30_000 });
    } finally {
      await browser.close().catch(() => {});
      await killAndWait(child);
      await rmWithRetry(root);
    }
  });
});
