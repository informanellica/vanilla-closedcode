/** @file FileWatcher service: subscribes to filesystem changes via @parcel/watcher (native binding, even under a Node SEA) and republishes them as bus events. */
import { Cause, Effect, Layer, Context, Schema } from "effect";
import { createWrapper } from "@parcel/watcher/wrapper.js";
import { readdir } from "fs/promises";
import path from "path";
import { Bus } from "#bus/index.js";
import { BusEvent } from "#bus/bus-event.js";
import { InstanceState } from "#effect/instance-state.js";
import { Flag } from "core/flag/flag";
import { Git } from "#git/index.js";
import { lazy } from "#util/lazy.js";
import { Config } from "#config/config.js";
import { FileIgnore } from "./ignore.js";
import { Protected } from "./protected.js";
import * as Log from "core/util/log";
const log = Log.create({
  service: "file.watcher"
});
const SUBSCRIBE_TIMEOUT_MS = 10_000;
export const Event = {
  Updated: BusEvent.define("file.watcher.updated", Schema.Struct({
    file: Schema.String,
    event: Schema.Literals(["add", "change", "unlink"])
  }))
};
/**
 * Lazily load and wrap the platform-specific @parcel/watcher native binding.
 * @returns {*} The watcher wrapper, or undefined if the binding fails to load.
 */
const watcher = lazy(() => {
  try {
    // In a Node SEA the embedded require resolves built-ins only, so route the
    // platform watcher binding through the exe-adjacent createRequire (__ccRequire,
    // set by the SEA banner) which finds <execDir>/node_modules; plain require otherwise.
    const binding = (globalThis.__ccRequire ?? require)(`@parcel/watcher-${process.platform}-${process.arch}${process.platform === "linux" ? `-${CLOSEDCODE_LIBC || "glibc"}` : ""}`);
    return createWrapper(binding);
  } catch (error) {
    log.error("failed to load watcher binding", {
      error
    });
    return;
  }
});
/**
 * Pick the @parcel/watcher backend name for the current platform.
 * @returns {string} The backend name, or undefined if unsupported.
 */
function getBackend() {
  if (process.platform === "win32") return "windows";
  if (process.platform === "darwin") return "fs-events";
  if (process.platform === "linux") return "inotify";
}
/**
 * List protected paths that live inside the given directory (relative, non-escaping).
 * @param {string} dir - The directory being watched.
 * @returns {Array} Protected absolute paths nested under `dir`.
 */
function protecteds(dir) {
  return Protected.paths().filter(item => {
    const rel = path.relative(dir, item);
    return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
  });
}
/**
 * Whether the native @parcel/watcher binding loaded successfully.
 * @returns {boolean} True if file watching is available.
 */
export const hasNativeBinding = () => !!watcher();
/** Effect service tag for the file watcher. */
export class Service extends Context.Service()("@closedcode/FileWatcher") {}
/**
 * Layer providing the FileWatcher service. On init it subscribes the project
 * directory (when the experimental flag is set) and the git dir, publishing
 * `file.watcher.updated` bus events for create/update/delete.
 * @type {Layer}
 */
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const config = yield* Config.Service;
  const git = yield* Git.Service;
  const state = yield* InstanceState.make(Effect.fn("FileWatcher.state")(function* () {
    if (yield* Flag.CLOSEDCODE_EXPERIMENTAL_DISABLE_FILEWATCHER) return;
    const ctx = yield* InstanceState.context;
    log.info("init", {
      directory: ctx.directory
    });
    const backend = getBackend();
    if (!backend) {
      log.error("watcher backend not supported", {
        directory: ctx.directory,
        platform: process.platform
      });
      return;
    }
    const w = watcher();
    if (!w) return;
    log.info("watcher backend", {
      directory: ctx.directory,
      platform: process.platform,
      backend
    });
    const subs = [];
    yield* Effect.addFinalizer(() => Effect.promise(() => Promise.allSettled(subs.map(sub => sub.unsubscribe()))));
    const cb = InstanceState.bind((err, evts) => {
      if (err) return;
      for (const evt of evts) {
        if (evt.type === "create") void Bus.publish(Event.Updated, {
          file: evt.path,
          event: "add"
        });
        if (evt.type === "update") void Bus.publish(Event.Updated, {
          file: evt.path,
          event: "change"
        });
        if (evt.type === "delete") void Bus.publish(Event.Updated, {
          file: evt.path,
          event: "unlink"
        });
      }
    });
    /**
     * Subscribe to changes under a directory, tracking the subscription for cleanup
     * and tolerating subscribe timeouts/failures by logging and unsubscribing.
     * @param {string} dir - Directory to watch.
     * @param {Array} ignore - Ignore patterns/paths passed to the watcher.
     * @returns {Effect} Effect that registers the subscription.
     */
    const subscribe = (dir, ignore) => {
      const pending = w.subscribe(dir, cb, {
        ignore,
        backend
      });
      return Effect.gen(function* () {
        const sub = yield* Effect.promise(() => pending);
        subs.push(sub);
      }).pipe(Effect.timeout(SUBSCRIBE_TIMEOUT_MS), Effect.catchCause(cause => {
        log.error("failed to subscribe", {
          dir,
          cause: Cause.pretty(cause)
        });
        pending.then(s => s.unsubscribe()).catch(() => {});
        return Effect.void;
      }));
    };
    const cfg = yield* config.get();
    const cfgIgnores = cfg.watcher?.ignore ?? [];
    if (yield* Flag.CLOSEDCODE_EXPERIMENTAL_FILEWATCHER) {
      yield* Effect.forkScoped(subscribe(ctx.directory, [...FileIgnore.PATTERNS, ...cfgIgnores, ...protecteds(ctx.directory)]));
    }
    if (ctx.project.vcs === "git") {
      const result = yield* git.run(["rev-parse", "--git-dir"], {
        cwd: ctx.worktree
      });
      const vcsDir = result.exitCode === 0 ? path.resolve(ctx.worktree, result.text().trim()) : undefined;
      if (vcsDir && !cfgIgnores.includes(".git") && !cfgIgnores.includes(vcsDir)) {
        const ignore = (yield* Effect.promise(() => readdir(vcsDir).catch(() => []))).filter(entry => entry !== "HEAD");
        yield* Effect.forkScoped(subscribe(vcsDir, ignore));
      }
    }
  }, Effect.catchCause(cause => {
    log.error("failed to init watcher service", {
      cause: Cause.pretty(cause)
    });
    return Effect.void;
  })));
  return Service.of({
    init: Effect.fn("FileWatcher.init")(function* () {
      yield* InstanceState.get(state);
    })
  });
}));
export const defaultLayer = layer.pipe(Layer.provide(Config.defaultLayer), Layer.provide(Git.defaultLayer));
export * as FileWatcher from "./watcher.js";