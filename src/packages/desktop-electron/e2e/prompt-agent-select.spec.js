// Regression for the blank agent selector: the composer's agent <select> (left
// of the model selector) showed EMPTY even though a primary agent ("build") is
// active. Cause: the vanilla Select snapshots its options/current ONCE at build
// time, but the built-in agents load asynchronously — a Select built before they
// arrive never updates. This asserts the agent selector ends up populated with a
// selected agent (not blank).
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

test.describe("prompt agent selector", () => {
  test("is populated with a selected agent (not blank) after agents load", async () => {
    test.setTimeout(180_000);
    const { browser, child, root } = await launchDesktopWithConfig({ provider: { ollama: provider } });
    try {
      const project = path.join(root, "p");
      await mkdir(project, { recursive: true });

      const page = await rendererPage(browser);
      // Force the bottom chat pane open so its composer (with the agent/model
      // selectors) is mounted, then open the project.
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

      // Create a session so the composer tray is fully live (agents load).
      await page.locator('[data-slot="session-new"]').click();
      await expect(page.locator('[data-slot="session-tab"][data-session-id]')).toHaveCount(1, { timeout: 30_000 });
      await expect(page.locator('[data-component="prompt-agent-control"] select')).toBeVisible({ timeout: 30_000 });

      // RELOAD: the composer rebuilds and re-queries the built-in agents — this is
      // the window where a Select built before agents arrive stays blank.
      await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
      await page.waitForLoadState("domcontentloaded");
      await page.waitForFunction(() => document.body && document.body.innerText.trim().length > 0, { timeout: 60_000 });

      const agentSelect = page.locator('[data-action="prompt-agent"]').first();
      await expect(agentSelect).toBeVisible({ timeout: 30_000 });

      // The agent selector must end up populated with a selected agent — NOT blank.
      await expect
        .poll(async () => agentSelect.locator("option").count(), { timeout: 30_000 })
        .toBeGreaterThan(0);
      await expect
        .poll(async () => await agentSelect.inputValue(), { timeout: 30_000, message: "agent select value should not be blank" })
        .not.toBe("");

      // Reactive: selecting a different agent is reflected by the selector value
      // (the re-created Select tracks local.agent.current()).
      const options = (await agentSelect.locator("option").allTextContents()).map(s => s.trim()).filter(Boolean);
      const current = await agentSelect.inputValue();
      const other = options.find(o => o && o !== current);
      if (other) {
        await agentSelect.selectOption(other);
        await expect.poll(async () => await agentSelect.inputValue(), { timeout: 10_000 }).toBe(other);
      }
    } finally {
      await browser.close().catch(() => {});
      await killAndWait(child);
      await rmWithRetry(root);
    }
  });
});
