import { Installation } from "#installation/index.js";
import { Server } from "#server/server.js";
import * as Log from "core/util/log";
import { InstanceRuntime } from "#project/instance-runtime.js";
import { WithInstance } from "#project/with-instance.js";
import { Rpc } from "#util/rpc.js";
import { upgrade } from "#cli/upgrade.js";
import { Config } from "#config/config.js";
import { GlobalBus } from "#bus/global.js";
import { Flag } from "core/flag/flag";
import { writeHeapSnapshot } from "node:v8";
import { Heap } from "#cli/heap.js";
import { AppRuntime } from "#effect/app-runtime.js";
import { ensureProcessMetadata } from "core/util/closedcode-process";
import { Effect } from "effect";
import { disposeAllInstancesAndEmitGlobalDisposed } from "#server/global-lifecycle.js";

let server;
export const rpc = {
  async fetch(input) {
    const headers = {
      ...input.headers
    };
    const auth = getAuthorizationHeader();
    if (auth && !headers["authorization"] && !headers["Authorization"]) {
      headers["Authorization"] = auth;
    }
    const request = new Request(input.url, {
      method: input.method,
      headers,
      body: input.body
    });
    const response = await Server.Default().app.fetch(request);
    const body = await response.text();
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body
    };
  },
  snapshot() {
    const result = writeHeapSnapshot("server.heapsnapshot");
    return result;
  },
  async server(input) {
    if (server) await server.stop(true);
    server = await Server.listen(input);
    return {
      url: server.url.toString()
    };
  },
  async checkUpgrade(input) {
    await WithInstance.provide({
      directory: input.directory,
      fn: async () => {
        await upgrade().catch(() => {});
      }
    });
  },
  async reload() {
    await AppRuntime.runPromise(Effect.gen(function* () {
      const cfg = yield* Config.Service;
      yield* cfg.invalidate();
      yield* disposeAllInstancesAndEmitGlobalDisposed({
        swallowErrors: true
      });
    }));
  },
  async shutdown() {
    Log.Default.info("worker shutting down");
    await InstanceRuntime.disposeAllInstances();
    if (server) await server.stop(true);
  }
};
function getAuthorizationHeader() {
  const password = Flag.CLOSEDCODE_SERVER_PASSWORD;
  if (!password) return undefined;
  const username = Flag.CLOSEDCODE_SERVER_USERNAME ?? "closedcode";
  return `Basic ${btoa(`${username}:${password}`)}`;
}

// Imperative startup wrapped in an async IIFE (not top-level await) so the worker
// bundle can be emitted as CommonJS for the Node SEA build — SEA runs the embedded
// main as CJS, which forbids top-level await. Ordering is preserved; valid for ESM.
void (async () => {
  ensureProcessMetadata("worker");
  await Log.init({
    print: process.argv.includes("--print-logs"),
    dev: Installation.isLocal(),
    level: (() => {
      if (Installation.isLocal()) return "DEBUG";
      return "INFO";
    })()
  });
  Heap.start();
  process.on("unhandledRejection", e => {
    Log.Default.error("rejection", {
      e: e instanceof Error ? e.message : e
    });
  });
  process.on("uncaughtException", e => {
    Log.Default.error("exception", {
      e: e instanceof Error ? e.message : e
    });
  });
  // Subscribe to global events and forward them via RPC
  GlobalBus.on("event", event => {
    Rpc.emit("global.event", event);
  });
  Rpc.listen(rpc);
})();
