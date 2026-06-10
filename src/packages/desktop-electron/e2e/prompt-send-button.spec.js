import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { gotoProject, killAndWait, launchDesktopWithConfig, rendererPage, rmWithRetry } from "./helpers.js";

const provider = {
  npm: "@ai-sdk/openai-compatible",
  name: "Ollama",
  options: { baseURL: "http://127.0.0.1:9/v1", apiKey: "local" },
  models: { "test-model": { name: "Test Model" } }
};

test.describe("prompt send button", () => {
  test("enables once the prompt has text", async () => {
    test.setTimeout(180_000);
    const { browser, child, root } = await launchDesktopWithConfig({ provider: { ollama: provider } });
    try {
      const project = path.join(root, "p");
      await mkdir(project, { recursive: true });
      const page = await rendererPage(browser);
      await gotoProject(page, project);

      const submit = page.locator('[data-action="prompt-submit"]').first();
      await expect(submit).toBeDisabled({ timeout: 30_000 });

      await page.locator('[data-component="prompt-input"]').first().click();
      await page.keyboard.type("hello");
      await expect(submit).toBeEnabled({ timeout: 10_000 });
    } finally {
      await browser.close().catch(() => {});
      await killAndWait(child);
      await rmWithRetry(root);
    }
  });
});
