// e2e: the titlebar center shows which folder is open on session routes
// (fix/titlebar-current-folder). Home shows nothing there.
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

test.describe("titlebar current folder", () => {
  let cleanup = [];

  test.afterEach(async () => {
    for (const item of cleanup.splice(0).reverse()) {
      await item();
    }
  });

  test("shows the opened project directory in the titlebar center", async () => {
    const { browser, child, root } = await launchDesktopWithConfig({});
    cleanup.push(async () => rmWithRetry(root));
    cleanup.push(async () => killAndWait(child));
    cleanup.push(async () => browser.close().catch(() => undefined));

    const project = path.join(root, "demo-project");
    await mkdir(project, { recursive: true });

    const page = await rendererPage(browser);
    const center = page.locator("#closedcode-titlebar-center");

    // Home route: no folder shown.
    await expect(center).not.toContainText("demo-project");

    await gotoProject(page, project);

    // Session route: the decoded directory is rendered (truncated display,
    // full path in the title attribute).
    await expect(center).toContainText("demo-project", { timeout: 30_000 });
    await expect(center.locator("div[title]").first()).toHaveAttribute("title", project);
    await shot(page, "e2e-titlebar-current-folder");
  });
});
