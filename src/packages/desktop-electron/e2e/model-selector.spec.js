// e2e: the prompt input's model picker is a native <select> listing the
// configured models (feat/model-selector-dropdown), selectable without the
// search popover.
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

// Endpoint is a dead local port on purpose: the model list comes from config,
// no live Ollama is needed for the picker itself.
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

  test("lists configured models in a native select under the chat box", async () => {
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

    // The model picker is the <select> whose options carry provider/model
    // values (the agent picker next to it has different values).
    const select = page
      .locator("select")
      .filter({ has: page.locator('option[value^="ollama/"]') })
      .first();
    await expect(select).toBeVisible({ timeout: 30_000 });

    const labels = await select.locator("option").allTextContents();
    expect(labels.join("|")).toContain("Model Alpha");
    expect(labels.join("|")).toContain("Model Beta");

    // Selecting via the native control updates the current model.
    await select.selectOption("ollama/model-beta");
    await expect(select).toHaveValue("ollama/model-beta");
    await shot(page, "e2e-model-selector");
  });
});
