// e2e: the prompt input's model picker opens the searchable popover listing
// every configured model grouped by provider, and selecting one updates the
// current model (fix/model-popover-restore).
import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import {
  gotoProject,
  killAndWait,
  launchDesktopWithConfig,
  rendererPage,
  rmWithRetry,
  shot,
} from "./helpers.js";

const ollamaProvider = {
  npm: "@ai-sdk/openai-compatible",
  name: "Ollama",
  options: { baseURL: "http://127.0.0.1:9", apiKey: "local" },
  models: {
    "model-alpha": { name: "Model Alpha" },
    "model-beta": { name: "Model Beta" },
  },
};

test.describe("prompt model selector", () => {
  let cleanup = [];

  test.afterEach(async () => {
    for (const item of cleanup.splice(0).reverse()) {
      await item();
    }
  });

  test("popover lists all configured models and selects one", async () => {
    test.setTimeout(180_000);
    const { browser, child, root } = await launchDesktopWithConfig({
      provider: { ollama: ollamaProvider },
    });
    cleanup.push(async () => rmWithRetry(root));
    cleanup.push(async () => killAndWait(child));
    cleanup.push(async () => browser.close().catch(() => undefined));

    const project = path.join(root, "demo-project");
    await mkdir(project, { recursive: true });

    const page = await rendererPage(browser);
    await gotoProject(page, project);

    await page.locator('[data-action="prompt-model"]').click({ timeout: 30_000 });
    // Both configured models are listed (visible() no longer hides them).
    await expect(page.getByText("Model Alpha").first()).toBeVisible({ timeout: 15_000 }); // trigger + list entry
    await expect(page.getByText("Model Beta").first()).toBeVisible();
    await shot(page, "e2e-model-popover");
    await page.getByText("Model Beta").first().click();
    // The trigger now shows the selected model.
    await expect(page.locator('[data-action="prompt-model"]')).toContainText("Model Beta", { timeout: 15_000 });
  });
});
