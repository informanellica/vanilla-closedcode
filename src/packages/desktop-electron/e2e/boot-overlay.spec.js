// Guards the loading-OVERLAY path: when the boot takes >1s (fresh profile,
// slow machine) main shows loading.html and then WAITS for the overlay's
// loadingWindowComplete IPC. If the overlay's module graph dies silently
// (the Stage-3 regression: verbatim-served loading.js with unresolved bare
// imports), the app hangs on the splash forever — and no other spec sees it,
// because fast boots skip the overlay entirely. A provider config with an
// empty models map reliably pushes the loading task past the 1s threshold.
import { test, expect } from "@playwright/test";
import { killAndWait, launchDesktopWithConfig, rendererPage, rmWithRetry } from "./helpers.js";

test.describe("boot overlay path", () => {
  test("boots to home through the loading overlay", async () => {
    test.setTimeout(240_000);
    const { browser, child, root } = await launchDesktopWithConfig({
      provider: { ollama: { npm: "@ai-sdk/openai-compatible", name: "Ollama", options: { baseURL: "http://127.0.0.1:9/v1", apiKey: "local" }, models: {} } }
    });
    try {
      const page = await rendererPage(browser);
      await expect(page.getByText("ようこそ").first()).toBeVisible({ timeout: 60_000 });
    } finally {
      await browser.close().catch(() => {});
      await killAndWait(child);
      await rmWithRetry(root);
    }
  });
});
