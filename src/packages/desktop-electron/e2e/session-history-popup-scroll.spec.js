// Empirical check of the clock-history popup with MANY sessions: is it actually
// scrollable, are all the (synced) sessions listed, and does the popup stay
// on-screen (it drops DOWN from a bar that sits near the bottom of the window)?
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

test.describe("clock-history popup with many sessions", () => {
  test("lists and scrolls a long session history and stays on-screen", async () => {
    test.setTimeout(300_000);
    const { browser, child, root } = await launchDesktopWithConfig({ provider: { ollama: provider } });
    try {
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

      // Create N sessions via "+" so the history is long enough to overflow the
      // 320px-max-height popup (~11 items fill it).
      const N = 16;
      const realTabs = page.locator('[data-slot="session-tab"][data-session-id]');
      for (let i = 1; i <= N; i++) {
        await page.locator('[data-slot="session-new"]').click();
        await expect(realTabs).toHaveCount(i, { timeout: 30_000 });
      }

      // Open the clock-history popup.
      const popup = page.locator('[data-slot="session-popup"]');
      const items = page.locator('[data-slot="session-popup-item"]');
      await page.locator('[data-slot="session-switch"]').first().click();
      await expect(popup).toBeVisible({ timeout: 10_000 });

      // All created sessions are recent, so the trim (limit 5 + recent 50) keeps
      // them: the popup should list all N.
      await expect(items).toHaveCount(N, { timeout: 15_000 });

      // Measure scrollability + on-screen fit.
      const m = await popup.evaluate(el => {
        const r = el.getBoundingClientRect();
        return { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, top: r.top, bottom: r.bottom, winH: window.innerHeight };
      });
      // eslint-disable-next-line no-console
      console.log("[popup-metrics]", JSON.stringify(m));

      // 1) It must be scrollable (content taller than the visible box).
      expect(m.scrollHeight).toBeGreaterThan(m.clientHeight);
      // 2) The visible box must fit within the viewport (not clipped off-screen,
      //    which would make the lower items unreachable).
      expect(m.bottom).toBeLessThanOrEqual(m.winH + 1);
      expect(m.top).toBeGreaterThanOrEqual(0);

      // 3) Scroll to the bottom and confirm the last item is reachable + visible.
      await popup.evaluate(el => el.scrollTo(0, el.scrollHeight));
      await expect(items.last()).toBeInViewport({ timeout: 5_000 });
    } finally {
      await browser.close().catch(() => {});
      await killAndWait(child);
      await rmWithRetry(root);
    }
  });
});
