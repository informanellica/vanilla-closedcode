import { chromium, expect, test } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import electronPath from "electron";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const desktopRoot = path.join(repoRoot, "packages/desktop-electron");

const ollamaProvider = {
  npm: "@ai-sdk/openai-compatible",
  name: "Ollama",
  options: { baseURL: "http://localhost:11434/v1" },
  models: {},
};

// Kill the spawned Electron app (and its in-process sidecar) and wait for the
// OS process to fully exit so it releases its handles on the temp app-data dir.
// On Windows those handles (e.g. the bootstrap-migration SQLite DB and its
// -wal/DIPS files) stay locked until the process is gone, which makes a
// subsequent rm() throw EBUSY.
async function killAndWait(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => {
    child.once("exit", resolve);
    child.once("error", resolve);
  });
  try {
    child.kill();
  } catch {
    // already gone
  }
  // Fall back to a hard kill if the graceful one does not land quickly.
  const timer = setTimeout(() => {
    try {
      child.kill("SIGKILL");
    } catch {
      // already gone
    }
  }, 3_000);
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 10_000))]);
  clearTimeout(timer);
}

// rm() can race with the OS releasing file handles on Windows even after the
// child process has exited, so retry on EBUSY/EPERM/ENOTEMPTY with backoff and
// never let cleanup failures fail the test.
async function rmWithRetry(target) {
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      await rm(target, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!["EBUSY", "EPERM", "ENOTEMPTY", "ENOENT"].includes(error?.code)) return;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
}

// Drop a full-page screenshot directly into repo artifacts/ for visual review.
async function shot(page, name) {
  const dir = path.join(repoRoot, "artifacts");
  await mkdir(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true });
}

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Failed to allocate a TCP port"));
        return;
      }
      server.close(() => resolve(address.port));
    });
  });
}

async function portOpen(port) {
  return await new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    socket.on("connect", () => {
      socket.end();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
  });
}

async function waitForPort(port) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await portOpen(port)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for CDP port ${port}`);
}

async function launchDesktopWithConfig(config) {
  const root = await mkdtemp(path.join(tmpdir(), "closedcode-playwright-"));
  const home = path.join(root, "home");
  const configHome = path.join(root, "config");
  const configDir = path.join(configHome, "closedcode");
  const dataDir = path.join(root, "data");
  const stateDir = path.join(root, "state");
  const appDataDir = path.join(root, "app-data");
  const debugPort = await freePort();

  await mkdir(configDir, { recursive: true });
  await mkdir(dataDir, { recursive: true });
  await mkdir(stateDir, { recursive: true });
  await mkdir(appDataDir, { recursive: true });
  await mkdir(home, { recursive: true });
  await writeFile(
    path.join(configDir, "closedcode.json"),
    JSON.stringify({ formatter: false, lsp: false, ...config }, null, 2),
  );

  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  Object.assign(env, {
    HOME: home,
    XDG_CONFIG_HOME: configHome,
    XDG_DATA_HOME: dataDir,
    XDG_STATE_HOME: stateDir,
    CLOSEDCODE_APP_DATA_DIR: appDataDir,
    CLOSEDCODE_CONFIG_DIR: configDir,
    CLOSEDCODE_REMOTE_DEBUG: String(debugPort),
    CLOSEDCODE_CHANNEL: "dev",
    ELECTRON_ENABLE_LOGGING: "1",
    NO_PROXY: "127.0.0.1,localhost,::1",
    no_proxy: "127.0.0.1,localhost,::1",
  });

  const child = spawn(electronPath, [desktopRoot], {
    cwd: desktopRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  child.stderr?.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  child.stdout?.on("data", () => undefined);

  await waitForPort(debugPort).catch((error) => {
    child.kill();
    error.message += stderr ? `\nElectron stderr:\n${stderr}` : "";
    throw error;
  });

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);
  return { browser, child, root, configDir };
}

// Resolve the renderer window. The window first opens on oc://renderer/loading.html
// and only later navigates to index.html, so we cannot just grab a page whose URL
// already matches — we must wait for that navigation. We poll for any renderer
// page (loading.html or index.html) and then wait, on that page object, for the
// URL to become index.html. The page object survives the in-place navigation, so
// waiting on it (rather than re-scanning for a freshly matching URL) avoids the
// race where the loading->index transition happens between poll iterations.
async function rendererPage(browser) {
  const deadline = Date.now() + 150_000;
  while (Date.now() < deadline) {
    const pages = browser.contexts().flatMap((context) => context.pages());
    const renderer = pages.find((page) => page.url().startsWith("oc://renderer/"));
    if (renderer) {
      try {
        if (!renderer.url().startsWith("oc://renderer/index.html")) {
          await renderer.waitForURL("oc://renderer/index.html**", {
            timeout: Math.max(1_000, deadline - Date.now()),
          });
        }
        await renderer.waitForLoadState("domcontentloaded");
        return renderer;
      } catch {
        // The window may still be mid-transition (or the page object was a
        // transient loading window that got replaced); fall through and retry.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const urls = browser.contexts().flatMap((context) => context.pages()).map((page) => page.url());
  throw new Error(`Timed out waiting for renderer window. Open pages: ${urls.join(", ")}`);
}

// Reload the renderer and wait for it to settle back on index.html. A bare
// page.reload() can hang on the custom oc:// protocol when the window bounces
// through loading.html, so we drive the reload ourselves and then re-confirm the
// renderer landed on index.html with the SPA mounted (a non-empty <body>). This
// keeps reload-based tests deterministic, the same way rendererPage() does for
// the initial launch.
async function reloadRenderer(page) {
  await page.reload({ waitUntil: "domcontentloaded" }).catch(() => undefined);
  const deadline = Date.now() + 60_000;
  if (!page.url().startsWith("oc://renderer/index.html")) {
    await page.waitForURL("oc://renderer/index.html**", {
      timeout: Math.max(1_000, deadline - Date.now()),
    });
  }
  await page.waitForLoadState("domcontentloaded");
  // Wait for the SolidJS app to actually mount after the reload.
  await page.waitForFunction(() => document.body && document.body.innerText.trim().length > 0, {
    timeout: Math.max(1_000, deadline - Date.now()),
  });
}

async function openProviderSettings(page) {
  await page.locator('button[aria-label="設定"]:visible').click();
  await expect(page.getByRole("tab", { name: "サーバー・プロバイダ" })).toBeVisible();
  await page.getByRole("tab", { name: "サーバー・プロバイダ" }).click();
  await expect(page.getByRole("heading", { name: /^(Providers|プロバイダー)$/ })).toBeVisible();
}

test.describe("desktop provider settings", () => {
  let cleanup = [];

  test.afterEach(async () => {
    for (const item of cleanup.splice(0).reverse()) {
      await item();
    }
  });

  test("shows and removes a zero-model Ollama config provider in the real UI", async () => {
    const { browser, child, root, configDir } = await launchDesktopWithConfig({
      provider: { ollama: ollamaProvider },
    });
    // cleanup runs in reverse push order: close CDP, kill the app and wait for
    // it to release file handles, then remove the temp dir (with retries).
    cleanup.push(async () => rmWithRetry(root));
    cleanup.push(async () => killAndWait(child));
    cleanup.push(async () => browser.close().catch(() => undefined));

    const page = await rendererPage(browser);
    const providerResponse = page.waitForResponse(
      (response) => response.url().includes("/provider") && response.status() === 200,
      { timeout: 30_000 },
    );

    await shot(page, "01-home-no-project");
    await openProviderSettings(page);

    const response = await providerResponse;
    const body = await response.json();
    expect(body.all.map((provider) => provider.id)).toContain("ollama");
    expect(body.connected).toContain("ollama");

    const connectedSection = page.locator("[data-component='connected-providers-section']");
    await expect(connectedSection.locator(".fw-medium", { hasText: "Ollama" })).toBeVisible();

    await shot(page, "02-provider-ollama-connected");

    await connectedSection.locator('button[data-icon="trash"]').click();
    const toast = page.locator('[data-component="toast"]');
    await expect(toast.getByText("プロバイダを切断しますか？")).toBeVisible();
    await shot(page, "03-provider-disconnect-confirm");
    await toast.locator('[data-slot="toast-action"]', { hasText: "切断する" }).click();

    const readWrittenConfig = async () => {
      try {
        return JSON.parse(await readFile(path.join(configDir, "closedcode.json"), "utf8"));
      } catch {
        return {};
      }
    };
    await expect.poll(readWrittenConfig).toMatchObject({ disabled_providers: expect.arrayContaining(["ollama"]) });
    const written = await readWrittenConfig();
    expect(written.disabled_providers).toContain("ollama");
    await expect(connectedSection.getByText("Ollama", { exact: true })).toHaveCount(0);
    await shot(page, "04-provider-removed");
  });

  test("repairs a persisted hidden chat pane state after reload", async () => {
    const { browser, child, root } = await launchDesktopWithConfig({});
    // cleanup runs in reverse push order: close CDP, kill the app and wait for
    // it to release file handles, then remove the temp dir (with retries).
    cleanup.push(async () => rmWithRetry(root));
    cleanup.push(async () => killAndWait(child));
    cleanup.push(async () => browser.close().catch(() => undefined));

    const page = await rendererPage(browser);
    await expect(page.getByRole("button", { name: "チャット" })).toBeVisible();
    await shot(page, "05-home-chatpane-initial");

    await page.evaluate(async () => {
      await window.api.storeSet(
        "closedcode.global.dat",
        "layout",
        JSON.stringify({ chatPanel: { height: 300, opened: false } }),
      );
    });
    await reloadRenderer(page);

    await expect(page.getByRole("button", { name: "チャット" })).toBeVisible();
    await expect
      .poll(async () => {
        const raw = await page.evaluate(() => window.api.storeGet("closedcode.global.dat", "layout"));
        return raw ? JSON.parse(raw).chatPanel : undefined;
      })
      .toMatchObject({ height: 300, opened: true });
    await shot(page, "06-home-chatpane-after-reload");
  });

  test("returns to the no-project home via the toolbar Home button", async () => {
    const { browser, child, root } = await launchDesktopWithConfig({});
    // cleanup runs in reverse push order: close CDP, kill the app and wait for
    // it to release file handles, then remove the temp dir (with retries).
    cleanup.push(async () => rmWithRetry(root));
    cleanup.push(async () => killAndWait(child));
    cleanup.push(async () => browser.close().catch(() => undefined));

    const page = await rendererPage(browser);

    // The Home button is always present in the toolbar (the toolbar shell wraps
    // every route, home included).
    const homeButton = page.locator('button[data-icon="home"][aria-label="ホーム"]');
    await expect(homeButton).toBeVisible();

    // The no-project home route renders the "recent projects" section header.
    // This is our reliable "we are on the home route" signal (the project view
    // does not render it).
    const homeMarker = page.getByText("最近のプロジェクト", { exact: true });
    await expect(homeMarker).toBeVisible();

    // Open a project. The directory just has to exist; navigateToProject() always
    // ends by navigating to /<base64>/session even with no sessions yet, so we
    // land in a project view. We drive it through the app's own open-project deep
    // link (server.isLocal() is true for the local sidecar, so it is honored).
    const projectDir = path.join(root, "demo-project");
    await mkdir(projectDir, { recursive: true });
    await page.evaluate((directory) => {
      window.dispatchEvent(
        new CustomEvent("closedcode:deep-link", {
          detail: { urls: [`closedcode://open-project?directory=${encodeURIComponent(directory)}`] },
        }),
      );
    }, projectDir);

    // We are now in a project view: the home "recent projects" header is gone.
    await expect(homeMarker).toHaveCount(0);
    await shot(page, "07-project-open");

    // Click the toolbar Home button: it navigates to "/" unconditionally without
    // closing the open project.
    await homeButton.click();

    // Back on the no-project home route.
    await expect(homeMarker).toBeVisible();
    await shot(page, "08-back-home-via-button");
  });

  test("stays functional when all user servers are removed", async () => {
    const { browser, child, root } = await launchDesktopWithConfig({});
    // cleanup runs in reverse push order: close CDP, kill the app and wait for
    // it to release file handles, then remove the temp dir (with retries).
    cleanup.push(async () => rmWithRetry(root));
    cleanup.push(async () => killAndWait(child));
    cleanup.push(async () => browser.close().catch(() => undefined));

    const page = await rendererPage(browser);
    await expect(page.getByText("最近のプロジェクト", { exact: true })).toBeVisible();

    // Drive the app into a "no user servers" state by clearing the persisted
    // server list and active key, then reload so the Server context re-inits.
    //
    // ACTUAL BEHAVIOR (verified): the desktop renderer always injects a local
    // "sidecar" http server (entry.js: servers:[server], disableHealthCheck:true)
    // and the Server model's current() falls back to allServers()[0]. So even
    // with the persisted user list emptied, the local server is the floor: the
    // app cannot reach a true "zero servers" state, the ConnectionGate never
    // shows the unreachable screen (health is force-true), and the UI stays on a
    // working home route with the local server still shown in the status bar.
    await page.evaluate(() => {
      window.api.storeSet("closedcode.global.dat", "server", JSON.stringify({ list: [], projects: {}, lastProject: {} }));
    });
    await reloadRenderer(page);

    // The home route is still rendered and functional (no blank/stuck screen, no
    // ConnectionError "retrying" screen).
    await expect(page.getByText("最近のプロジェクト", { exact: true })).toBeVisible();
    await expect(page.locator('button[data-icon="home"][aria-label="ホーム"]')).toBeVisible();

    // The bottom status bar still reports the local server (the floor), proving
    // the app did NOT fall into a no-server / "—" placeholder state. The local
    // sidecar survives clearing the user list, so the indicator stays "Local
    // Server" with a healthy (green) dot.
    const statusName = page.locator("footer.app-statusbar > span:first-child > span:last-child");
    await expect(statusName).toHaveText("Local Server");

    await shot(page, "09-all-servers-gone");
  });

  test("home Server status renders and the manage link opens Settings on the LLM tab without crashing", async () => {
    const { browser, child, root } = await launchDesktopWithConfig({});
    // cleanup runs in reverse push order: close CDP, kill the app and wait for
    // it to release file handles, then remove the temp dir (with retries).
    cleanup.push(async () => rmWithRetry(root));
    cleanup.push(async () => killAndWait(child));
    cleanup.push(async () => browser.close().catch(() => undefined));

    const page = await rendererPage(browser);

    // We are on the no-project home route (the redesigned start screen).
    await expect(page.getByText("最近のプロジェクト", { exact: true })).toBeVisible();

    // Capture the redesigned home: left-aligned brand header + 2-column section
    // grid (Start | Configuration, Recent | Server).
    await shot(page, "11-home-redesign");

    // The Server section now shows the connection STATUS (the host name plus an
    // Online/Offline state) — clicking the status no longer pops the picker.
    // The local sidecar is force-healthy, so the host shows as "Local Server".
    // Scope to the home content (main) since the bottom status bar (contentinfo)
    // also reports "Local Server".
    await expect(page.getByRole("main").getByText("Local Server", { exact: true })).toBeVisible();
    await expect(page.getByRole("main").getByText("オンライン", { exact: true })).toBeVisible();

    // The unobtrusive "管理" link in the Server section header just opens
    // Settings on the connection (LLM/provider) tab — there is no separate
    // server-picker modal; local-LLM setup is what users actually want here.
    const manageButton = page.getByRole("button", { name: "管理", exact: true });
    await expect(manageButton).toBeVisible();
    await manageButton.click();

    // The Settings dialog opens (no crash): the tab list shows the "LLM"
    // section with the connection tab ("サーバー・プロバイダ") selected.
    const dialog = page.locator('[data-component="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("LLM", { exact: true })).toBeVisible();
    await expect(dialog.getByText("サーバー・プロバイダ", { exact: true })).toBeVisible();

    // The app did NOT fall into the global error page / SDK-context crash.
    // (The error page renders the "問題が発生しました" heading and would surface
    // the "SDK context must be used within a context provider" message.)
    await expect(page.getByText("問題が発生しました", { exact: true })).toHaveCount(0);
    await expect(page.getByText(/SDK context must be used/i)).toHaveCount(0);

    await shot(page, "10-settings-llm-tab");
  });
});
