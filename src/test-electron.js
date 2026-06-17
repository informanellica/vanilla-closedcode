/** @file Smoke-test harness for the packaged macOS Electron app; launches the app with remote debugging, connects over CDP, and reports failed asset loads, 5xx responses, and console errors before taking a screenshot. */
const { chromium } = require("@playwright/test")
const { execFile } = require("node:child_process")
const { promisify } = require("node:util")
const net = require("node:net")
const path = require("node:path")

const execFileAsync = promisify(execFile)
// This script lives at <root>/src; the built mac app sits under it.
const APP = path.join(__dirname, "packages/desktop-electron/dist/mac-arm64/vanilla-closedcode.app")
const PORT = 9222

/**
 * Logs the given arguments to the console, JSON-stringifying any non-string values first.
 * @param {...*} a - Values to log; strings are printed as-is, everything else is JSON-stringified.
 * @returns {void}
 */
const log = (...a) => console.log(...a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))))

/**
 * Checks whether a TCP port is accepting connections on 127.0.0.1.
 * @param {number} port - The TCP port to probe.
 * @returns {Promise<boolean>} Resolves true if a connection succeeds, false on error.
 */
const portOpen = (port) =>
  new Promise((r) => {
    const s = net.createConnection({ port, host: "127.0.0.1" })
    s.on("connect", () => {
      s.end()
      r(true)
    })
    s.on("error", () => r(false))
  })

/**
 * Runs the end-to-end smoke test: kills any running instance, sets the remote-debug env var, opens the packaged app, waits for the CDP port, connects to the renderer page, monitors network responses and console errors for a fixed window, prints a summary, screenshots the window, and tears everything down.
 * @returns {Promise<void>} Resolves when the test run and cleanup complete.
 */
async function main() {
  log("[setup]")
  await execFileAsync("pkill", ["-9", "-f", "vanilla-closedcode"]).catch(() => {})
  await new Promise((r) => setTimeout(r, 1500))
  await execFileAsync("launchctl", ["setenv", "CLOSEDCODE_REMOTE_DEBUG", String(PORT)])
  await execFileAsync("osascript", ["-e", `tell application "Finder" to open POSIX file "${APP}"`])

  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    if (await portOpen(PORT)) break
    await new Promise((r) => setTimeout(r, 250))
  }
  if (!(await portOpen(PORT))) {
    log("port never opened")
    process.exit(1)
  }
  log("[connected]")

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`)
  const ctxs = browser.contexts()
  log(
    "contexts:",
    ctxs.length,
    "pages:",
    ctxs.flatMap((c) => c.pages()).map((p) => p.url()),
  )

  let page
  for (let i = 0; i < 30; i++) {
    page = browser
      .contexts()
      .flatMap((c) => c.pages())
      .find((p) => p.url().includes("index.html"))
    if (page) break
    await new Promise((r) => setTimeout(r, 500))
  }
  if (!page) {
    log("no renderer page")
    process.exit(1)
  }
  log("page:", page.url())

  const cdp = await page.context().newCDPSession(page)
  await cdp.send("Network.enable")

  let count500 = 0
  let countOK = 0
  const captured = new Map()
  const failedAssets = []
  cdp.on("Network.responseReceived", (evt) => {
    const { requestId, response } = evt
    if (response.url.startsWith("oc://") && response.status >= 400) {
      failedAssets.push({ url: response.url, status: response.status })
    }
    if (!response.url.includes("127.0.0.1")) return
    if (response.status >= 500) {
      count500++
      captured.set(requestId, { url: response.url, status: response.status })
    } else if (response.status < 400) {
      countOK++
    }
  })
  cdp.on("Network.loadingFailed", (evt) => {
    failedAssets.push({ requestId: evt.requestId, errorText: evt.errorText, type: evt.type })
  })
  cdp.on("Network.loadingFinished", async (evt) => {
    if (!captured.has(evt.requestId)) return
    try {
      const { body, base64Encoded } = await cdp.send("Network.getResponseBody", { requestId: evt.requestId })
      const decoded = base64Encoded ? Buffer.from(body, "base64").toString("utf8") : body
      const info = captured.get(evt.requestId)
      log("[500]", info.url)
      log(decoded.slice(0, 800))
    } catch {}
    captured.delete(evt.requestId)
  })

  page.on("console", (msg) => {
    if (msg.type() === "error") log("[console error]", msg.text().slice(0, 300))
  })

  await new Promise((r) => setTimeout(r, 12000))
  log("---summary---")
  log("500s:", count500, "OK:", countOK)
  log("failed assets:", failedAssets.length)
  for (const f of failedAssets.slice(0, 20)) log("  ", f)

  await page.screenshot({ path: path.join(__dirname, "dist/electron-after-fix.png") }).catch(() => {})
  log("screenshot → dist/electron-after-fix.png")

  await browser.close().catch(() => {})
  await execFileAsync("pkill", ["-9", "-f", "vanilla-closedcode"]).catch(() => {})
  await execFileAsync("launchctl", ["unsetenv", "CLOSEDCODE_REMOTE_DEBUG"]).catch(() => {})
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
