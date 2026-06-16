/**
 * @file Version-control service (`Vcs`). Tracks the current/default git branch,
 * publishes branch-change events, and produces file diffs — returning lightweight
 * metadata immediately while patch bodies are computed off-thread (via a
 * worker_thread pool) and streamed back to the renderer in batches.
 * @module closedcode/project/vcs
 */
import { Effect, Layer, Context, Schema, Stream, Scope, Fiber } from "effect";
import { formatPatch, structuredPatch } from "diff";
import path from "path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { Bus } from "#bus/index.js";
import { BusEvent } from "#bus/bus-event.js";
import { InstanceState } from "#effect/instance-state.js";
import { AppFileSystem } from "core/filesystem";
import { FileWatcher } from "#file/watcher.js";
import { Git } from "#git/index.js";
import * as Log from "core/util/log";
import { zod } from "#util/effect-zod.js";
import { NonNegativeInt, withStatics } from "#util/schema.js";

// Single-worker pool for `formatPatch + structuredPatch`. The structured
// patch with full-file context is O(file size) sync CPU; running it inline
// on the sidecar's main thread blocks the Electron main process and the
// renderer sees "application not responding" until every file is done.
// Off-loading to a worker keeps the event loop free; per-request requests
// are serialised through the worker but the main thread stays responsive.
const PATCH_WORKER_URL = new URL("./vcs-patch-worker.js", import.meta.url);
let __patchWorker;
let __patchSeq = 0;
const __patchPending = new Map();
/**
 * Lazily spawn (and memoize) the single patch worker_thread, wiring up its
 * message/error/exit handlers. On error or exit, every pending request is
 * resolved with an empty patch and the worker is reset so the next call respawns.
 * @returns {Worker} The shared worker instance.
 */
const ensurePatchWorker = () => {
  if (__patchWorker) return __patchWorker;
  __patchWorker = new Worker(fileURLToPath(PATCH_WORKER_URL));
  __patchWorker.unref(); // don't keep the process alive on its own
  __patchWorker.on("message", (msg) => {
    const pending = __patchPending.get(msg.id);
    if (!pending) return;
    __patchPending.delete(msg.id);
    pending.resolve(typeof msg.patch === "string" ? msg.patch : "");
  });
  __patchWorker.on("error", (err) => {
    log.error("patch worker error", { error: err?.message });
    for (const pending of __patchPending.values()) pending.resolve("");
    __patchPending.clear();
    __patchWorker = undefined;
  });
  __patchWorker.on("exit", () => {
    for (const pending of __patchPending.values()) pending.resolve("");
    __patchPending.clear();
    __patchWorker = undefined;
  });
  return __patchWorker;
};
/**
 * Format a unified patch for one file by dispatching the work to the patch
 * worker. Falls back to running formatPatch + structuredPatch inline (and to an
 * empty string if even that throws) when the worker cannot be spawned.
 * @param {string} file - The repo-relative file path (used for both sides of the diff header).
 * @param {string} before - The "before" file contents.
 * @param {string} after - The "after" file contents.
 * @returns {Promise<string>} Resolves with the unified patch text, or "" on failure.
 */
const formatViaWorker = (file, before, after) =>
  new Promise((resolve) => {
    let worker;
    try {
      worker = ensurePatchWorker();
    } catch (e) {
      log.error("failed to spawn patch worker, falling back to inline", { error: e?.message });
      try {
        resolve(formatPatch(structuredPatch(file, file, before, after, "", "", { context: 3 })));
      } catch {
        resolve("");
      }
      return;
    }
    const id = ++__patchSeq;
    __patchPending.set(id, { resolve });
    worker.postMessage({ id, file, before, after });
  });
const log = Log.create({
  service: "vcs"
});
/**
 * Count the number of lines in a block of text, ignoring a single trailing
 * newline (so "a\nb\n" counts as 2, not 3).
 * @param {string} text - The text to count lines in.
 * @returns {number} The line count (0 for empty/falsy input).
 */
const count = text => {
  if (!text) return 0;
  if (!text.endsWith("\n")) return text.split("\n").length;
  return text.slice(0, -1).split("\n").length;
};
/**
 * Read a working-tree file as UTF-8 text. Returns "" for missing files and for
 * binary files (detected by a NUL byte), so they never produce a text diff.
 * @param {Object} fs - The AppFileSystem service (provides `exists` and `readFile`).
 * @param {string} cwd - The repository root directory.
 * @param {string} file - The repo-relative file path.
 * @returns {Effect} An Effect yielding the file contents as a string, or "".
 */
const work = Effect.fnUntraced(function* (fs, cwd, file) {
  const full = path.join(cwd, file);
  if (!(yield* fs.exists(full).pipe(Effect.orDie))) return "";
  const buf = yield* fs.readFile(full).pipe(Effect.catch(() => Effect.succeed(new Uint8Array())));
  if (Buffer.from(buf).includes(0)) return "";
  return Buffer.from(buf).toString("utf8");
});
/**
 * Index a list of git stat entries by file path into a Map of add/delete counts.
 * @param {Array} list - Stat entries, each `{file, additions, deletions}`.
 * @returns {Map} Map from file path to `{additions, deletions}`.
 */
const nums = list => new Map(list.map(item => [item.file, {
  additions: item.additions,
  deletions: item.deletions
}]));
/**
 * Merge one or more lists of file entries into a single de-duplicated list,
 * keeping the first occurrence of each file path.
 * @param {...Array} lists - Lists of entries, each with a `file` property.
 * @returns {Array} The merged, de-duplicated entries.
 */
const merge = (...lists) => {
  const out = new Map();
  lists.flat().forEach(item => {
    if (!out.has(item.file)) out.set(item.file, item);
  });
  return [...out.values()];
};
/**
 * Build the lightweight metadata entry (no patch body) for one changed file.
 * @param {Object} item - The status/diff entry `{file, status}`.
 * @param {Map} map - The stats map from {@link nums} keyed by file path.
 * @returns {Object} `{file, patch: "", additions, deletions, status}`.
 */
// Build the lightweight metadata entry for a single file — no per-file
// git show / structuredPatch work, so this returns in O(1) per file once
// the git status / stats batch is already computed.
const meta = (item, map) => {
  const stat = map.get(item.file);
  return {
    file: item.file,
    patch: "",
    additions: stat?.additions ?? (item.status === "added" ? 0 : 0),
    deletions: stat?.deletions ?? (item.status === "deleted" ? 0 : 0),
    status: item.status,
  };
};
/**
 * Compute the patch body and accurate add/delete counts for one changed file.
 * @param {Object} fs - The AppFileSystem service.
 * @param {Object} git - The Git service (provides `show`).
 * @param {string} cwd - The repository root directory.
 * @param {string} ref - The git ref to diff against ("HEAD" or a merge base), or falsy for none.
 * @param {string} base - The path prefix returned by `git rev-parse --show-prefix`.
 * @param {Object} item - The status/diff entry `{file, status}`.
 * @param {Object} stat - The matching stats entry `{additions, deletions}`, or undefined.
 * @returns {Effect} An Effect yielding `{file, patch, additions, deletions, status}`.
 */
// Compute patch + accurate add/del counts for one file. The `git show`
// + working-tree read happen on the main thread (small, I/O-bound), but
// the synchronous structuredPatch is dispatched to a worker_thread so it
// can run while the event loop keeps serving other requests.
const computePatch = Effect.fnUntraced(function* (fs, git, cwd, ref, base, item, stat) {
  const before = item.status === "added" || !ref ? "" : yield* git.show(cwd, ref, item.file, base);
  const after = item.status === "deleted" ? "" : yield* work(fs, cwd, item.file);
  const patch = yield* Effect.promise(() => formatViaWorker(item.file, before, after));
  return {
    file: item.file,
    patch,
    additions: stat?.additions ?? (item.status === "added" ? count(after) : 0),
    deletions: stat?.deletions ?? (item.status === "deleted" ? count(before) : 0),
    status: item.status,
  };
});
// Listing helpers. These are the lightweight, "always cheap" pieces of the
// diff — the working-tree comparison or branch comparison plus stats. Patch
// generation is split off into computePatch() so it can run in the
// background, off the HTTP critical path.
/**
 * List the working-tree changes against a ref ("git" mode), pairing the status
 * list with a stats map. With no ref, returns the raw status and an empty map.
 * @param {Object} git - The Git service.
 * @param {string} cwd - The repository root directory.
 * @param {string} ref - The ref to compute stats against, or falsy.
 * @returns {Effect} An Effect yielding `{list, map}`.
 */
const trackList = Effect.fnUntraced(function* (git, cwd, ref) {
  if (!ref) return { list: yield* git.status(cwd), map: new Map() };
  const [list, stats] = yield* Effect.all([git.status(cwd), git.stats(cwd, ref)], { concurrency: 2 });
  return { list, map: nums(stats) };
});
/**
 * List the changes for "branch" mode: the diff against the merge-base ref plus
 * any untracked files (status code "??"), paired with a stats map.
 * @param {Object} git - The Git service.
 * @param {string} cwd - The repository root directory.
 * @param {string} ref - The merge-base ref to diff against.
 * @returns {Effect} An Effect yielding `{list, map}`.
 */
const compareList = Effect.fnUntraced(function* (git, cwd, ref) {
  const [list, stats, extra] = yield* Effect.all([git.diff(cwd, ref), git.stats(cwd, ref), git.status(cwd)], { concurrency: 3 });
  return { list: merge(list, extra.filter(item => item.code === "??")), map: nums(stats) };
});
/** Diff mode: "git" (working tree vs HEAD) or "branch" (vs default-branch merge base). */
export const Mode = Schema.Literals(["git", "branch"]).pipe(withStatics(s => ({
  zod: zod(s)
})));
/** Bus event definitions published by the Vcs service. */
export const Event = {
  BranchUpdated: BusEvent.define("vcs.branch.updated", Schema.Struct({
    branch: Schema.optional(Schema.String)
  })),
  // Emitted in batches after a /vcs/diff request: the HTTP response
  // returns metadata immediately and a background fiber computes patches
  // off-thread, publishing them in batches of up to 16 (or every 100ms)
  // so the renderer doesn't have to re-render once per file.
  FileDiffReady: BusEvent.define("vcs.file-diff.ready", Schema.Struct({
    mode: Schema.Literals(["git", "branch"]),
    files: Schema.Array(Schema.Struct({
      file: Schema.String,
      patch: Schema.String,
      additions: NonNegativeInt,
      deletions: NonNegativeInt,
      status: Schema.optional(Schema.Literals(["added", "deleted", "modified"])),
    })),
  })),
};
/** Schema describing the current and default branch names for a repository. */
export const Info = Schema.Struct({
  branch: Schema.optional(Schema.String),
  default_branch: Schema.optional(Schema.String)
}).annotate({
  identifier: "VcsInfo"
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
/** Schema for a single file's diff: path, unified patch, add/delete counts, and status. */
export const FileDiff = Schema.Struct({
  file: Schema.String,
  patch: Schema.String,
  additions: NonNegativeInt,
  deletions: NonNegativeInt,
  status: Schema.optional(Schema.Literals(["added", "deleted", "modified"]))
}).annotate({
  identifier: "VcsFileDiff"
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
/** Effect Context tag for the Vcs service. */
export class Service extends Context.Service()("@closedcode/Vcs") {}
/**
 * Layer constructing the Vcs service: resolves the current/default branch,
 * forks a HEAD watcher that publishes {@link Event.BranchUpdated} on change, and
 * exposes `init`, `branch`, `defaultBranch`, and `diff` operations.
 */
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const fs = yield* AppFileSystem.Service;
  const git = yield* Git.Service;
  const bus = yield* Bus.Service;
  const scope = yield* Scope.Scope;
  // Track the in-flight patch-stream fiber per mode. When the renderer
  // invalidates the diff query (file watcher fires, branch change, etc.) and
  // calls /vcs/diff again, the previous stream is still running on the
  // sidecar — for a 2885-file repo that means each consecutive invalidation
  // stacks another 12-second patch stream worth of worker_thread and libuv
  // I/O on top of the previous one. Tools that touch many files in sequence
  // produce a long enough chain that the sidecar never goes idle. Interrupt
  // the previous fiber for this mode before starting a new one.
  const inflight = new Map();
  const state = yield* InstanceState.make(Effect.fn("Vcs.state")(function* (ctx) {
    if (ctx.project.vcs !== "git") {
      return {
        current: undefined,
        root: undefined
      };
    }
    const get = Effect.fnUntraced(function* () {
      return yield* git.branch(ctx.directory);
    });
    const [current, root] = yield* Effect.all([git.branch(ctx.directory), git.defaultBranch(ctx.directory)], {
      concurrency: 2
    });
    const value = {
      current,
      root
    };
    log.info("initialized", {
      branch: value.current,
      default_branch: value.root?.name
    });
    yield* bus.subscribe(FileWatcher.Event.Updated).pipe(Stream.filter(evt => evt.properties.file.endsWith("HEAD")), Stream.runForEach(_evt => Effect.gen(function* () {
      const next = yield* get();
      if (next !== value.current) {
        log.info("branch changed", {
          from: value.current,
          to: next
        });
        value.current = next;
        yield* bus.publish(Event.BranchUpdated, {
          branch: next
        });
      }
    })), Effect.forkScoped);
    return value;
  }));
  return Service.of({
    // Eagerly initialize the branch state (and HEAD watcher) in the background.
    init: Effect.fn("Vcs.init")(function* () {
      yield* InstanceState.get(state).pipe(Effect.forkIn(scope));
    }),
    // Return the current branch name (undefined for non-git projects).
    branch: Effect.fn("Vcs.branch")(function* () {
      return yield* InstanceState.use(state, x => x.current);
    }),
    // Return the default branch name (e.g. "main"), or undefined.
    defaultBranch: Effect.fn("Vcs.defaultBranch")(function* () {
      return yield* InstanceState.use(state, x => x.root?.name);
    }),
    // Compute the diff for the given mode. Returns per-file metadata
    // synchronously; for projects under PATCH_AUTOLOAD_LIMIT files it also
    // forks a background fiber that computes patch bodies off-thread and
    // publishes them in batches via Event.FileDiffReady. The prior in-flight
    // fiber for this mode is interrupted first.
    diff: Effect.fn("Vcs.diff")(function* (mode) {
      const value = yield* InstanceState.get(state);
      const ctx = yield* InstanceState.context;
      if (ctx.project.vcs !== "git") return [];
      let ref;
      let listed;
      if (mode === "git") {
        ref = (yield* git.hasHead(ctx.directory)) ? "HEAD" : undefined;
        listed = yield* trackList(git, ctx.directory, ref);
      } else {
        if (!value.root) return [];
        if (value.current && value.current === value.root.name) return [];
        ref = yield* git.mergeBase(ctx.directory, value.root.ref);
        if (!ref) return [];
        listed = yield* compareList(git, ctx.directory, ref);
      }
      const metaList = listed.list.map(item => meta(item, listed.map))
        .toSorted((a, b) => a.file.localeCompare(b.file));
      // structuredPatch is Myers-diff O(N*D) where D is edit distance — for
      // line-ending re-encoded / mass-rewritten files D ≈ N so each patch
      // is O(N²). Multiplied by thousands of dirty files the worker thread
      // sustains 100% CPU for minutes (≈ 85 billion ops for 2885 × 100-line
      // files), keeping the sidecar's libuv loop saturated and any LLM
      // request stuck waiting on fetch. Above this threshold, ship metadata
      // only; the renderer's review UI already shows filename, +/- counts,
      // and status without the patch body. Expanding a file inline still
      // works for the small number that have patches; oversized projects
      // simply don't preload everyone.
      const PATCH_AUTOLOAD_LIMIT = 500;
      if (listed.list.length > PATCH_AUTOLOAD_LIMIT) {
        log.info("vcs.diff returning metadata only", { files: listed.list.length, limit: PATCH_AUTOLOAD_LIMIT });
        return metaList;
      }
      // Background patch generation, batched. Each completed patch goes
      // into a buffer; the buffer is flushed when it reaches BATCH_SIZE
      // or when no new patch has arrived for BATCH_MS. This keeps the
      // renderer to roughly one re-render per batch instead of one per
      // file, while still feeling near-real-time.
      const base = ref ? yield* git.prefix(ctx.directory) : "";
      const cwd = ctx.directory;
      const BATCH_SIZE = 16;
      const BATCH_MS = 100;
      const batched = [];
      let flushTimer;
      const flush = () => {
        if (batched.length === 0) return Effect.void;
        const files = batched.splice(0);
        return bus.publish(Event.FileDiffReady, { mode, files });
      };
      // Interrupt any prior in-flight patch stream for this mode before
      // starting a new one. Without this, file.watcher events that
      // invalidate the diff query stack multiple full patch passes on top
      // of each other.
      const previous = inflight.get(mode);
      if (previous) yield* Fiber.interrupt(previous);
      const fiberRef = { current: undefined };
      const fiber = yield* Effect.forEach(listed.list, item => Effect.gen(function* () {
        const stat = listed.map.get(item.file);
        const result = yield* computePatch(fs, git, cwd, ref, base, item, stat).pipe(
          Effect.catch(() => Effect.succeed(undefined))
        );
        if (!result) return;
        batched.push(result);
        if (flushTimer !== undefined) {
          clearTimeout(flushTimer);
          flushTimer = undefined;
        }
        if (batched.length >= BATCH_SIZE) {
          yield* flush();
        } else {
          flushTimer = setTimeout(() => {
            void Effect.runPromise(flush());
          }, BATCH_MS);
        }
      }), { concurrency: 8, discard: true }).pipe(
        Effect.ensuring(Effect.suspend(() => {
          if (flushTimer !== undefined) {
            clearTimeout(flushTimer);
            flushTimer = undefined;
          }
          if (fiberRef.current && inflight.get(mode) === fiberRef.current) inflight.delete(mode);
          return flush();
        })),
        Effect.forkIn(scope),
      );
      fiberRef.current = fiber;
      inflight.set(mode, fiber);
      return metaList;
    })
  });
}));
/** The Vcs layer with its Git, AppFileSystem, and Bus dependencies provided. */
export const defaultLayer = layer.pipe(Layer.provide(Git.defaultLayer), Layer.provide(AppFileSystem.defaultLayer), Layer.provide(Bus.layer));
export * as Vcs from "./vcs.js";