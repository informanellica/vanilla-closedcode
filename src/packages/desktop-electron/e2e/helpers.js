/** @file Shared e2e helpers for desktop Playwright specs: launch the Electron app against an isolated temp profile, connect over CDP, resolve the renderer window, and clean up. */
// Shared e2e helpers for desktop Playwright specs. Extracted from
// provider-visibility.spec.js so new specs can reuse the launch/connect
// plumbing; that spec still carries its own copy and can migrate later.
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import electronPath from "electron";

export const repoRoot = path.resolve(import.meta.dirname, "../../..");
export const desktopRoot = path.join(repoRoot, "packages/desktop-electron");

// Kill the spawned Electron app (and its in-process sidecar) and wait for the
// OS process to fully exit so it releases its handles on the temp app-data dir.
/**
 * Terminate the spawned Electron child process and wait for it to fully exit,
 * escalating to SIGKILL after 3s and capping the total wait at 10s. No-op if
 * the process has already exited.
 * @param {Object} child - The child process returned by spawn().
 * @returns {Promise<void>} Resolves when the process has exited or the wait times out.
 */
export async function killAndWait(child) {
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

// rm() can race with the OS releasing file handles on Windows, so retry on
// EBUSY/EPERM/ENOTEMPTY with backoff and never let cleanup fail the test.
/**
 * Recursively remove a path, retrying up to 10 times with increasing backoff on
 * transient Windows file-lock errors (EBUSY/EPERM/ENOTEMPTY). Cleanup never
 * throws.
 * @param {string} target - Absolute path of the file or directory to delete.
 * @returns {Promise<void>} Resolves once removal succeeds or retries are exhausted.
 */
export async function rmWithRetry(target) {
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
/**
 * Capture a full-page screenshot into the repo's artifacts/ directory.
 * @param {Object} page - The Playwright page to screenshot.
 * @param {string} name - Base filename (without extension); saved as <name>.png.
 * @returns {Promise<void>} Resolves once the screenshot is written.
 */
export async function shot(page, name) {
  const dir = path.join(repoRoot, "artifacts");
  await mkdir(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true });
}

/**
 * Allocate a free ephemeral TCP port on the loopback interface by opening and
 * immediately closing a listening server.
 * @returns {Promise<number>} The allocated port number.
 */
export async function freePort() {
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

/**
 * Probe whether a TCP port on loopback is accepting connections.
 * @param {number} port - The port to probe.
 * @returns {Promise<boolean>} True if a connection succeeded, false otherwise.
 */
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

/**
 * Poll a loopback TCP port until it accepts connections, giving up after 30s.
 * @param {number} port - The CDP port to wait for.
 * @returns {Promise<void>} Resolves when the port is open.
 * @throws {Error} If the port does not open within the timeout.
 */
export async function waitForPort(port) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await portOpen(port)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for CDP port ${port}`);
}

// Launch the desktop app against an isolated temp HOME/config/data tree with
// the given closedcode.json config, and connect Playwright over CDP.
/**
 * Spawn the Electron desktop app pointed at a fresh temp HOME/config/data tree
 * seeded with the given closedcode.json (merged over `formatter:false`,
 * `lsp:false`), allocate a CDP debug port, wait for it to open, and connect
 * Playwright over CDP.
 * @param {Object} config - Extra closedcode.json config fields to merge into the seeded config.
 * @returns {Promise<Object>} Handle with `browser` (CDP Browser), `child` (Electron process), `root` (temp dir), and `configDir`.
 */
export async function launchDesktopWithConfig(config) {
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

/**
 * Relaunch the desktop app against an EXISTING temp tree (same HOME / config /
 * data / state dirs) from a prior launchDesktopWithConfig — for testing that data
 * such as the session history survives a full process restart. The sidecar server
 * and its SQLite DB live under those dirs, so reusing them re-reads the persisted
 * state exactly as a real restart would.
 * @param {string} root - The root temp dir returned by launchDesktopWithConfig.
 * @param {Object} [config] - closedcode.json config to rewrite (defaults to the same minimal config).
 * @returns {Promise<Object>} Handle with `browser` (CDP Browser), `child` (Electron process), and `root`.
 */
export async function relaunchDesktop(root, config = {}) {
  const home = path.join(root, "home");
  const configHome = path.join(root, "config");
  const configDir = path.join(configHome, "closedcode");
  const dataDir = path.join(root, "data");
  const stateDir = path.join(root, "state");
  const appDataDir = path.join(root, "app-data");
  const debugPort = await freePort();

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
  return { browser, child, root };
}

// Resolve the renderer window: wait for the vcc://renderer page to finish the
// loading.html -> index.html navigation on the same page object.
/**
 * Find and return the renderer window, waiting (up to 150s for slow cold starts)
 * for the vcc://renderer page to finish navigating from loading.html to
 * index.html and reach domcontentloaded.
 * @param {Object} browser - The connected CDP Browser instance.
 * @returns {Promise<Object>} The Playwright page for the loaded renderer.
 * @throws {Error} If no loaded renderer window appears within the timeout.
 */
export async function rendererPage(browser) {
  // 150s: cold starts (fresh temp profile = full DB migration + first-run
  // binary scan) intermittently exceed 90s when the machine is busy.
  const deadline = Date.now() + 150_000;
  while (Date.now() < deadline) {
    const pages = browser.contexts().flatMap((context) => context.pages());
    const renderer = pages.find((page) => page.url().startsWith("vcc://renderer/"));
    if (renderer) {
      try {
        if (!renderer.url().startsWith("vcc://renderer/index.html")) {
          await renderer.waitForURL("vcc://renderer/index.html**", {
            timeout: Math.max(1_000, deadline - Date.now()),
          });
        }
        await renderer.waitForLoadState("domcontentloaded");
        return renderer;
      } catch {
        // mid-transition; retry
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const urls = browser.contexts().flatMap((context) => context.pages()).map((page) => page.url());
  throw new Error(`Timed out waiting for renderer window. Open pages: ${urls.join(", ")}`);
}

// URL-safe base64 matching core/util/encode base64Encode (route :dir param).
/**
 * Encode a string as URL-safe base64 (no padding) the same way core/util/encode
 * does, for use as the route `:dir` parameter.
 * @param {string} value - The string to encode.
 * @returns {string} The URL-safe base64 encoding (`+`->`-`, `/`->`_`, `=` stripped).
 */
export function base64Dir(value) {
  return Buffer.from(value, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

// Navigate the SPA to the session route of a directory. The app router uses
// MEMORY integration on vcc:// (pushState/popstate are ignored), so this calls
// the e2e hook home.js exposes (the real openProject flow: projects.open +
// touch + navigate) instead of touching browser history.
/**
 * Open a project directory in the running SPA by invoking the renderer's
 * `__closedcode_openProject` e2e hook (the real projects.open + touch + navigate
 * flow), then wait for the route to change. Avoids browser history, which the
 * MEMORY-backed router on vcc:// ignores.
 * @param {Object} page - The renderer Playwright page.
 * @param {string} directory - Absolute path of the project directory to open.
 * @returns {Promise<void>} Resolves once navigation to the project route completes.
 */
export async function gotoProject(page, directory) {
  await page.waitForFunction(() => typeof window.__closedcode_openProject === "function", { timeout: 30_000 });
  await page.evaluate((dir) => window.__closedcode_openProject(dir), directory);
  await page.waitForFunction(() => location.pathname.length > 1, { timeout: 15_000 });
}
