// e2e: the file-tree panel header shows WHICH folder is open (basename, full
// path on hover). The custom titlebar isn't rendered in this app configuration,
// so the panel header is where the opened-folder name lives.
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

test.describe("opened folder name", () => {
  let cleanup = [];

  test.afterEach(async () => {
    for (const item of cleanup.splice(0).reverse()) {
      await item();
    }
  });

  test("file-tree panel header shows the opened project folder", async () => {
    const { browser, child, root } = await launchDesktopWithConfig({});
    cleanup.push(async () => rmWithRetry(root));
    cleanup.push(async () => killAndWait(child));
    cleanup.push(async () => browser.close().catch(() => undefined));

    const project = path.join(root, "demo-project");
    await mkdir(project, { recursive: true });

    const page = await rendererPage(browser);
    await gotoProject(page, project);

    const panel = page.locator("#file-tree-panel");
    await expect(panel).toContainText("demo-project", { timeout: 30_000 });
    // Full path is exposed via the title attribute for truncated display.
    await expect(panel.locator("span[title]").first()).toHaveAttribute("title", project);
    await shot(page, "e2e-opened-folder-name");
  });
});
