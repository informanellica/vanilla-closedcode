// IMPORTANT: Set env vars BEFORE any imports from src/ directory
// xdg-basedir reads env vars at import time, so we must set these first
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { setTimeout as sleep } from "node:timers/promises";
import { afterAll, beforeAll } from "@jest/globals";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Set XDG env vars FIRST, before any src/ imports
const dir = path.join(os.tmpdir(), "closedcode-test-data-" + process.pid)
fs.mkdirSync(dir, { recursive: true })
process.env["XDG_DATA_HOME"] = path.join(dir, "share")
process.env["XDG_CACHE_HOME"] = path.join(dir, "cache")
process.env["XDG_CONFIG_HOME"] = path.join(dir, "config")
process.env["XDG_STATE_HOME"] = path.join(dir, "state")
process.env["CLOSEDCODE_MODELS_PATH"] = path.join(__dirname, "tool", "fixtures", "models-api.json")
process.env["CLOSEDCODE_EXPERIMENTAL_EVENT_SYSTEM"] = "true"

// Set test home directory to isolate tests from user's actual home directory
const testHome = path.join(dir, "home")
fs.mkdirSync(testHome, { recursive: true })
process.env["CLOSEDCODE_TEST_HOME"] = testHome

// Set test managed config directory to isolate tests from system managed settings
const testManagedConfigDir = path.join(dir, "managed")
process.env["CLOSEDCODE_TEST_MANAGED_CONFIG_DIR"] = testManagedConfigDir
process.env["CLOSEDCODE_DISABLE_DEFAULT_PLUGINS"] = "true"

// Write the cache version file to prevent global/index.ts from clearing the cache
const cacheDir = path.join(dir, "cache", "opencode")
fs.mkdirSync(cacheDir, { recursive: true })
fs.writeFileSync(path.join(cacheDir, "version"), "14")

// Clear provider and server auth env vars to ensure clean test state
for (const key of [
  "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GOOGLE_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY", "AZURE_OPENAI_API_KEY", "AWS_ACCESS_KEY_ID",
  "AWS_PROFILE", "AWS_REGION", "AWS_BEARER_TOKEN_BEDROCK", "OPENROUTER_API_KEY",
  "LLM_GATEWAY_API_KEY", "GROQ_API_KEY", "MISTRAL_API_KEY", "PERPLEXITY_API_KEY",
  "TOGETHER_API_KEY", "XAI_API_KEY", "DEEPSEEK_API_KEY", "FIREWORKS_API_KEY",
  "CEREBRAS_API_KEY", "SAMBANOVA_API_KEY", "CLOSEDCODE_SERVER_PASSWORD",
  "CLOSEDCODE_SERVER_USERNAME", "OTEL_EXPORTER_OTLP_HEADERS", "OTEL_EXPORTER_OTLP_ENDPOINT",
  "OTEL_RESOURCE_ATTRIBUTES",
]) delete process.env[key]

// Use in-memory sqlite
process.env["CLOSEDCODE_DB"] = ":memory:"

// Defer ESM imports of src/ to beforeAll so the sync setup above
// finishes before any module that reads env vars is loaded.
beforeAll(async () => {  try {
    const { Log } = await import("core/util/log")
    void Log.init({ print: false, dev: true, level: "DEBUG" });
  } catch {}
  try {
    const { initProjectors } = await import("../src/server/projectors.js")
    initProjectors()
  } catch {
    // Heavy server graph not needed for simple unit tests; tests that need
    // projectors should call initProjectors() themselves in their own beforeAll.
  }
})

afterAll(async () => {
  const { AppRuntime } = await import("../src/effect/app-runtime.js")
  await AppRuntime.dispose()
  try {
    const { BootstrapRuntime } = await import("../src/effect/bootstrap-runtime.js")
    await BootstrapRuntime.dispose()
  } catch {}
  const { Database } = await import("../src/storage/db.js")
  Database.close()
  // Node's global fetch (undici) keeps connections alive in a pooled dispatcher,
  // and node:http's globalAgent keeps free sockets open with keep-alive timers.
  // Close both so jest can exit after the suite.
  try {
    const undici = await import("undici")
    await undici.getGlobalDispatcher().close()
  } catch (e) {
    if (process.env.DEBUG_HANDLES === "1") console.error("undici close failed:", e?.message)
  }
  try {
    const http = await import("node:http")
    http.globalAgent.destroy()
    const https = await import("node:https")
    https.globalAgent.destroy()
  } catch (e) {
    if (process.env.DEBUG_HANDLES === "1") console.error("http agent destroy failed:", e?.message)
  }
  const retryable = (e) =>
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    ["EBUSY", "ENOTEMPTY", "EPERM"].includes(e.code)
  const rm = async (left) => {
    if (typeof global !== "undefined" && global.gc) global.gc()
    await sleep(100)
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch (error) {
      if (!retryable(error)) throw error
      if (left <= 1) throw error
      return rm(left - 1)
    }
  }
  // Windows can keep SQLite WAL handles alive until GC finalizers run.
  await rm(30)
  // When forceExit is disabled (the test:leaks path), jest still hangs after
  // printing the --detectOpenHandles report because effect's ManagedRuntime
  // and the vm-modules loader leave unkillable framework Timers alive.
  //
  // Spawn a detached child that SIGHUPs us 5s later — long enough for jest
  // to print the handle report, short enough not to wedge CI. The matching
  // SIGHUP→exit(0) handler lives in `jest.config.js` (registered when Node
  // loads the config); handlers registered inside jest's vm-modules sandbox
  // via setupFiles don't catch host signals. Sending a bare signal would
  // exit with code 129 / npm "-1" and CI would treat the run as failed,
  // hence the conversion to exit(0). The child is detached + stdio:ignore +
  // unref'd so it never keeps the parent alive on its own; a suite that
  // exits naturally before the 5s elapses is unaffected.
  if (process.env.JEST_NO_FORCE_EXIT === "1") {
    const { spawn } = await import("node:child_process")
    const child = spawn(process.execPath, [
      "-e",
      `setTimeout(() => { try { process.kill(${process.pid}, "SIGHUP") } catch {} }, 5000)`,
    ], { detached: true, stdio: "ignore" })
    child.unref()
  }
})
