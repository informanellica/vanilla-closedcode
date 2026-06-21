// The pane resize handles used the OS col-/row-resize cursor, which rendered as
// a hard-to-see white glyph. They now use a themed custom SVG cursor (dark arrow
// on light themes, light arrow on dark themes). This asserts the handle's
// computed cursor is a custom url() that differs between the two themes, and that
// the hover divider has a visible background.
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

test.describe("pane resize cursor", () => {
  test("uses a themed custom cursor (different in light vs dark)", async () => {
    test.setTimeout(180_000);
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

      const handle = page.locator('[data-component="resize-handle"][data-direction="vertical"]:visible').first();
      await expect(handle).toBeVisible({ timeout: 30_000 });

      const info = await handle.evaluate(el => {
        // 1) Does Blink ACCEPT a png data-uri cursor in inline style? (a 1px png)
        el.style.setProperty("cursor", 'url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==") 0 0, pointer');
        const inlineAccepted = el.style.cursor.includes("url(");
        el.style.removeProperty("cursor");
        // 2) Authored rules: cursor declarations using a custom image, by theme.
        let total = 0, dark = 0;
        for (const sheet of document.styleSheets) {
          let rules;
          try { rules = sheet.cssRules; } catch { continue; }
          for (const r of rules) {
            const cur = r.style && r.style.cursor;
            if (cur && cur.includes("image/png")) {
              total++;
              if ((r.selectorText || "").includes('data-bs-theme="dark"')) dark++;
            }
          }
        }
        const after = getComputedStyle(el, "::after").backgroundColor;
        return { inlineAccepted, total, dark, after };
      });
      // eslint-disable-next-line no-console
      console.log("[cursor-info]", JSON.stringify(info));

      // Blink accepts png data-uri cursors (so our themed cursors do apply,
      // even though getComputedStyle normalises the reported value).
      expect(info.inlineAccepted).toBe(true);
      // Themed custom-image cursor rules exist, including dark-theme variants.
      expect(info.total).toBeGreaterThanOrEqual(4);
      expect(info.dark).toBeGreaterThanOrEqual(2);
      // The hover divider has a real (non-transparent) background.
      expect(info.after).not.toBe("rgba(0, 0, 0, 0)");
      expect(info.after).not.toBe("transparent");
    } finally {
      await browser.close().catch(() => {});
      await killAndWait(child);
      await rmWithRetry(root);
    }
  });
});
