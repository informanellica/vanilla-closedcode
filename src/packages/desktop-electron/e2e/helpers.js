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
export async function shot(page, name) {
  const dir = path.join(repoRoot, "artifacts");
  await mkdir(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true });
}

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

// Resolve the renderer window: wait for the vcc://renderer page to finish the
// loading.html -> index.html navigation on the same page object.
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
export function base64Dir(value) {
  return Buffer.from(value, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

// Navigate the SPA to the session route of a directory. The app router uses
// MEMORY integration on vcc:// (pushState/popstate are ignored), so this calls
// the e2e hook home.js exposes (the real openProject flow: projects.open +
// touch + navigate) instead of touching browser history.
export async function gotoProject(page, directory) {
  await page.waitForFunction(() => typeof window.__closedcode_openProject === "function", { timeout: 30_000 });
  await page.evaluate((dir) => window.__closedcode_openProject(dir), directory);
  await page.waitForFunction(() => location.pathname.length > 1, { timeout: 15_000 });
}
