/**
 * @file CLI entry for the closedcode TUI command. Spawns the server Worker thread,
 * wires up the RPC client (with an optional in-process fetch/event transport),
 * validates any continued session, and launches the native-free vanilla TUI shell.
 */
import { cmd } from "#cli/cmd/cmd.js";
import { Worker } from "node:worker_threads";
import { Rpc } from "#util/rpc.js";
import path from "path";
import { fileURLToPath } from "url";
import { UI } from "#cli/ui.js";
import * as Log from "core/util/log";
import { errorMessage } from "#util/error.js";
import { withTimeout } from "#util/timeout.js";
import { withNetworkOptions, resolveNetworkOptionsNoConfig } from "#cli/network.js";
import { Filesystem } from "#util/filesystem.js";
import { win32DisableProcessedInput, win32InstallCtrlCGuard } from "./win32.js";
import { writeHeapSnapshot } from "v8";
import { TuiConfig } from "./config/tui.js";
import { CLOSEDCODE_PROCESS_ROLE, CLOSEDCODE_RUN_ID, ensureRunID, sanitizedProcessEnv } from "core/util/closedcode-process";
import { validateSession } from "./validate-session.js";
/**
 * Build a fetch-compatible function that forwards requests over the worker RPC
 * client (used when the server runs in-process rather than on a real HTTP port).
 * @param {Object} client - The RPC client with a `call(method, params)` method.
 * @returns {Function} An async `(input, init)` fetch shim returning a Response.
 */
function createWorkerFetch(client) {
  const fn = async (input, init) => {
    const request = new Request(input, init);
    const body = request.body ? await request.text() : undefined;
    const result = await client.call("fetch", {
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      body
    });
    return new Response(result.body, {
      status: result.status,
      headers: result.headers
    });
  };
  return fn;
}
/**
 * Build an in-process event source that relays the worker's "global.event"
 * stream to a subscriber (used in place of an SSE connection).
 * @param {Object} client - The RPC client with an `on(event, handler)` method.
 * @returns {Object} An object with `subscribe(handler)` returning an unsubscribe handle.
 */
function createEventSource(client) {
  return {
    subscribe: async handler => {
      return client.on("global.event", e => {
        handler(e);
      });
    }
  };
}
/**
 * Resolve the worker script URL/path, preferring an injected build constant, then
 * the dist layout, then the colocated worker.js.
 * @returns {Promise<*>} The worker module URL or path string.
 */
async function target() {
  if (typeof CLOSEDCODE_WORKER_PATH !== "undefined") return CLOSEDCODE_WORKER_PATH;
  const dist = new URL("./cli/cmd/tui/worker.js", import.meta.url);
  if (await Filesystem.exists(fileURLToPath(dist))) return dist;
  return new URL("./worker.js", import.meta.url);
}
/**
 * Read all of stdin to a UTF-8 string.
 * @returns {Promise<string>} The full piped stdin contents.
 */
async function readStdin() {
  let text = "";
  for await (const chunk of process.stdin) text += chunk.toString("utf8");
  return text;
}
/**
 * Combine the explicit --prompt value with any piped stdin into the initial prompt.
 * @param {string} value - The explicit prompt value (may be undefined).
 * @returns {Promise<string>} The piped text, the value, or both joined by a newline.
 */
async function input(value) {
  const piped = process.stdin.isTTY ? undefined : await readStdin();
  if (!value) return piped;
  if (!piped) return value;
  return piped + "\n" + value;
}
/**
 * Resolve the working directory the TUI should start in. A relative `project` is
 * resolved against PWD; otherwise the current cwd is used.
 * @param {string} project - Optional project path (absolute or relative to PWD).
 * @param {string} envPWD - The PWD environment value (default process.env.PWD).
 * @param {string} cwd - The current working directory (default process.cwd()).
 * @returns {string} The resolved absolute directory path.
 */
export function resolveThreadDirectory(project, envPWD = process.env.PWD, cwd = process.cwd()) {
  const root = Filesystem.resolve(envPWD ?? cwd);
  if (project) return Filesystem.resolve(path.isAbsolute(project) ? project : path.join(root, project));
  return Filesystem.resolve(cwd);
}
/**
 * The default CLI command that starts the closedcode TUI. Spawns the server
 * Worker, sets up the RPC transport (in-process or external HTTP), validates a
 * continued session, and runs the vanilla TUI shell. Supports --model, --continue,
 * --session, --fork, --prompt, and --agent options plus a positional project path.
 * @type {Object}
 */
export const TuiThreadCommand = cmd({
  command: "$0 [project]",
  describe: "start closedcode tui",
  builder: yargs => withNetworkOptions(yargs).positional("project", {
    type: "string",
    describe: "path to start closedcode in"
  }).option("model", {
    type: "string",
    alias: ["m"],
    describe: "model to use in the format of provider/model"
  }).option("continue", {
    alias: ["c"],
    describe: "continue the last session",
    type: "boolean"
  }).option("session", {
    alias: ["s"],
    type: "string",
    describe: "session id to continue"
  }).option("fork", {
    type: "boolean",
    describe: "fork the session when continuing (use with --continue or --session)"
  }).option("prompt", {
    type: "string",
    describe: "prompt to use"
  }).option("agent", {
    type: "string",
    describe: "agent to use"
  }),
  handler: async args => {
    // Keep ENABLE_PROCESSED_INPUT cleared even if other code flips it.
    const unguard = win32InstallCtrlCGuard();
    let restoreInput;
    try {
      // Must be the very first thing — disables CTRL_C_EVENT before any Worker
      // spawn or async work so the OS cannot kill the process group. Returns a
      // restore() (called in finally) so the parent shell's Ctrl-C is not left broken.
      restoreInput = win32DisableProcessedInput();
      if (args.fork && !args.continue && !args.session) {
        UI.error("--fork requires --continue or --session");
        process.exitCode = 1;
        return;
      }

      // Resolve relative --project paths from PWD, then use the real cwd after
      // chdir so the thread and worker share the same directory key.
      const next = resolveThreadDirectory(args.project);
      const file = await target();
      try {
        process.chdir(next);
      } catch {
        UI.error("Failed to change directory to " + next);
        return;
      }
      const cwd = Filesystem.resolve(process.cwd());
      const env = sanitizedProcessEnv({
        [CLOSEDCODE_PROCESS_ROLE]: "worker",
        [CLOSEDCODE_RUN_ID]: ensureRunID()
      });
      const worker = new Worker(file, {
        env
      });
      worker.on("error", e => {
        Log.Default.error("thread error", {
          message: e.message,
          stack: e.stack
        });
      });
      const client = Rpc.client(worker);
      const error = e => {
        Log.Default.error("process error", {
          error: errorMessage(e)
        });
      };
      const reload = () => {
        client.call("reload", undefined).catch(err => {
          Log.Default.warn("worker reload failed", {
            error: errorMessage(err)
          });
        });
      };
      process.on("uncaughtException", error);
      process.on("unhandledRejection", error);
      process.on("SIGUSR2", reload);
      let stopped = false;
      const stop = async () => {
        if (stopped) return;
        stopped = true;
        process.off("uncaughtException", error);
        process.off("unhandledRejection", error);
        process.off("SIGUSR2", reload);
        await withTimeout(client.call("shutdown", undefined), 5000).catch(error => {
          Log.Default.warn("worker shutdown failed", {
            error: errorMessage(error)
          });
        });
        worker.terminate();
      };
      const prompt = await input(args.prompt);
      const config = await TuiConfig.get();
      const network = resolveNetworkOptionsNoConfig(args);
      const external = process.argv.includes("--port") || process.argv.includes("--hostname") || process.argv.includes("--mdns") || network.mdns || network.port !== 0 || network.hostname !== "127.0.0.1";
      const transport = external ? {
        url: (await client.call("server", network)).url,
        fetch: undefined,
        events: undefined
      } : {
        url: "http://closedcode.internal",
        fetch: createWorkerFetch(client),
        events: createEventSource(client)
      };
      try {
        await validateSession({
          url: transport.url,
          sessionID: args.session,
          directory: cwd,
          fetch: transport.fetch
        });
      } catch (error) {
        UI.error(errorMessage(error));
        process.exitCode = 1;
        return;
      }
      setTimeout(() => {
        client.call("checkUpgrade", {
          directory: cwd
        }).catch(() => {});
      }, 1000).unref?.();
      try {
        // The TUI is the native-free terminal-kit vanilla shell (no @opentui /
      // solid-js / yoga). Loaded lazily so its graph is only built when the TUI runs.
      const { tui } = await import("./vanilla/main.js");
      await tui({
          url: transport.url,
          async onSnapshot() {
            const tui = writeHeapSnapshot("tui.heapsnapshot");
            const server = await client.call("snapshot", undefined);
            return [tui, server];
          },
          config,
          directory: cwd,
          fetch: transport.fetch,
          events: transport.events,
          args: {
            continue: args.continue,
            sessionID: args.session,
            agent: args.agent,
            model: args.model,
            prompt,
            fork: args.fork
          }
        });
      } finally {
        await stop();
      }
    } finally {
      restoreInput?.(); // restore ENABLE_PROCESSED_INPUT for the parent shell
      unguard?.();
    }
    process.exit(0);
  }
});
// scratch