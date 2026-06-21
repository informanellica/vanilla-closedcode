// e2e regression for BUG 2: the chat pane's vertical resize handle must render
// even when NO session is selected. The handle's Show gate used to be
// `params.id && view().chatPanel.opened()`, so with a blank session selector
// (value "") the handle vanished and the chat pane could not be resized. The
// fix dropped the `params.id` condition; this test opens a project with no
// session selected, forces the chat pane open, and asserts the handle is
// present/visible.
import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { gotoProject, killAndWait, launchDesktopWithConfig, rendererPage, rmWithRetry } from "./helpers.js";

// A zero-cost provider (unreachable baseURL) is enough — this test never sends a
// prompt, it only inspects the static chat-pane chrome.
const provider = {
  npm: "@ai-sdk/openai-compatible",
  name: "Ollama",
  options: { baseURL: "http://127.0.0.1:9/v1", apiKey: "local" },
  models: { "test-model": { name: "Test Model" } },
};

test.describe("chat pane resize handle without a selected session", () => {
  test("renders the vertical resize handle when no session is selected", async () => {
    test.setTimeout(180_000);
    const { browser, child, root } = await launchDesktopWithConfig({ provider: { ollama: provider } });
    try {
      const project = path.join(root, "p");
      await mkdir(project, { recursive: true });

      const page = await rendererPage(browser);

      // Force the chat pane OPEN by seeding the persisted layout state (same
      // mechanism provider-visibility.spec.js uses), then reload so the layout
      // context re-reads it. The migration normalizes opened -> true; we set it
      // explicitly anyway so the pane is guaranteed open regardless of defaults.
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

      // Open the project. navigateToProject() lands on /<base64>/session with NO
      // session id, so the session selector renders blank (value "").
      await gotoProject(page, project);

      // With no session selected the tab bar shows a single "新規セッション" tab —
      // proving we are in the "no session selected" state that used to hide the
      // resize handle (and used to show a blank select box).
      const newTab = page.locator('[data-slot="session-tab-label"]');
      await expect(newTab).toBeVisible({ timeout: 30_000 });
      await expect(newTab).toHaveText("新規セッション");

      // KEY ASSERTION: the vertical resize handle is present and VISIBLE even
      // though no session is selected. Before the fix this had visible count 0.
      // (The DOM holds two such handles — the live desktop chat-pane handle and
      // a display:none mobile-layout copy — so we scope to the visible one.)
      const resizeHandle = page.locator('[data-component="resize-handle"][data-direction="vertical"]:visible');
      await expect(resizeHandle).toBeVisible({ timeout: 15_000 });
      await expect(resizeHandle).toHaveCount(1);

      // --- new session-tab-bar design (no session selected) ---
      // The "new" tab has no session, so no rename pencil is shown.
      await expect(page.locator('[data-slot="session-rename"]')).toHaveCount(0);
      // The session-list popup is hidden until the clock button reveals it
      // (it pops up below the bar, not inline).
      const popup = page.locator('[data-slot="session-popup"]');
      await expect(popup).toBeHidden();
      await page.locator('[data-slot="session-switch"]').first().click();
      await expect(popup).toBeVisible({ timeout: 5_000 });
    } finally {
      await browser.close().catch(() => {});
      await killAndWait(child);
      await rmWithRetry(root);
    }
  });
});
