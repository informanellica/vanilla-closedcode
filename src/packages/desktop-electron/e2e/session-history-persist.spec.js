// Regression for "the open tabs disappear on restart": create several session
// tabs, fully restart the desktop process against the SAME data dirs, and assert
// the OPEN TABS are restored (not collapsed to one auto-selected session) and the
// sessions are still in the history popup. The session DB always survived a
// restart; the open-tab SET is now persisted per workspace and restored on boot.
// The restarted app auto-restores the last project, so the second launch just
// settles and inspects (no gotoProject, which hangs once a project is restored).
import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { gotoProject, killAndWait, launchDesktopWithConfig, relaunchDesktop, rendererPage, rmWithRetry } from "./helpers.js";

const provider = {
  npm: "@ai-sdk/openai-compatible",
  name: "Ollama",
  options: { baseURL: "http://127.0.0.1:9/v1", apiKey: "local" },
  models: { "test-model": { name: "Test Model" } },
};

// Fully kill the Electron process TREE (incl. the sidecar grandchild) so it
// releases the SQLite DB lock before relaunching against the same data dir;
// killAndWait only terminates the Electron parent, orphaning the sidecar on win32.
async function killTreeAndSettle(child) {
  // Graceful terminate FIRST (SIGTERM) so the renderer flushes its persisted
  // stores on quit; only THEN force-kill the (possibly orphaned) process tree so
  // the sidecar releases the SQLite DB lock before we relaunch.
  await killAndWait(child);
  try { spawnSync("taskkill", ["/F", "/T", "/PID", String(child.pid)], { stdio: "ignore" }); } catch { /* not win / already gone */ }
  await new Promise(resolve => setTimeout(resolve, 5_000));
}

async function bootAndOpen(browser, project) {
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

test.describe("session history persistence across restart", () => {
  test("restores the open session tabs (and history) after a full restart", async () => {
    test.setTimeout(200_000);
    const first = await launchDesktopWithConfig({ provider: { ollama: provider } });
    const project = path.join(first.root, "p");
    let ids;
    try {
      await mkdir(project, { recursive: true });
      const page = await bootAndOpen(first.browser, project);
      const realTabs = page.locator('[data-slot="session-tab"][data-session-id]');
      for (let i = 1; i <= 3; i++) {
        await page.locator('[data-slot="session-new"]').click();
        await expect(realTabs).toHaveCount(i, { timeout: 30_000 });
      }
      ids = await realTabs.evaluateAll(els => els.map(e => e.getAttribute("data-session-id")));
      expect(ids).toHaveLength(3);
      // Let the per-workspace "open tabs" persisted store flush to disk before
      // we tear the app down, so the restart can restore them.
      await page.waitForTimeout(2_500);
    } finally {
      await first.browser.close().catch(() => {});
      await killTreeAndSettle(first.child);
    }

    // --- FULL RESTART against the same data dirs ---
    const second = await relaunchDesktop(first.root, { provider: { ollama: provider } });
    try {
      // The restarted app auto-restores the last project; just settle, then read
      // the history popup. (gotoProject hangs once a project is already restored.)
      const page = await rendererPage(second.browser);
      await page.waitForFunction(() => document.body && document.body.innerText.trim().length > 0, { timeout: 60_000 });
      await page.waitForTimeout(6_000);

      // KEY (the reported bug): the OPEN TABS are restored after a restart, not
      // collapsed to a single auto-selected session. All three should reappear.
      const realTabs = page.locator('[data-slot="session-tab"][data-session-id]');
      await expect(realTabs, "the open session tabs should be restored after a restart").toHaveCount(3, { timeout: 30_000 });
      const restoredIds = await realTabs.evaluateAll(els => els.map(e => e.getAttribute("data-session-id")));
      for (const id of ids) expect(restoredIds, `tab ${id.slice(0, 10)} should be restored`).toContain(id);

      // And the history popup still lists them (the underlying data persists too).
      const clock = page.locator('[data-slot="session-switch"]').first();
      await expect(clock).toBeVisible({ timeout: 15_000 });
      await clock.click();
      await expect(page.locator('[data-slot="session-popup"]')).toBeVisible({ timeout: 10_000 });
      for (const id of ids) {
        await expect(
          page.locator(`[data-slot="session-popup-row"][data-session-id="${id}"]`),
          `session ${id.slice(0, 10)} should still be in the history`,
        ).toHaveCount(1, { timeout: 10_000 });
      }
    } finally {
      await second.browser.close().catch(() => {});
      await killTreeAndSettle(second.child);
      await rmWithRetry(first.root);
    }
  });
});
