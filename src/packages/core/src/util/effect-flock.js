/** @file Effect-based cross-process advisory file lock (`EffectFlock`) using atomic mkdir, heartbeat files, stale detection, and breaker-based recovery. */
import path from "path";
import os from "os";
import { randomUUID } from "crypto";
import { Context, Effect, Function, Layer, Option, Schedule, Schema } from "effect";
import { AppFileSystem } from "../filesystem.js";
import { Global } from "../global.js";
import { Hash } from "./hash.js";
export let EffectFlock;
(function (_EffectFlock) {
  /** Tagged error raised when the lock cannot be acquired within the timeout; carries the lock `key`. */
  class LockTimeoutError extends Schema.TaggedErrorClass()("LockTimeoutError", {
    key: Schema.String
  }) {}
  _EffectFlock.LockTimeoutError = LockTimeoutError;
  /** Tagged error raised when lock state is found inconsistent (e.g. heartbeat/meta already existed). */
  class LockCompromisedError extends Schema.TaggedErrorClass()("LockCompromisedError", {
    detail: Schema.String
  }) {}
  _EffectFlock.LockCompromisedError = LockCompromisedError;
  /** Tagged error raised when releasing a lock fails (missing/invalid metadata or token mismatch). */
  class ReleaseError extends Schema.TaggedErrorClass()("ReleaseError", {
    detail: Schema.String,
    cause: Schema.optional(Schema.Defect)
  }) {
    get message() {
      return this.detail;
    }
  }

  /** Internal: signals "lock is held, retry later". Never leaks to callers. */
  class NotAcquired extends Schema.TaggedErrorClass()("NotAcquired", {}) {}
  // ---------------------------------------------------------------------------
  // Timing (baked in — no caller ever overrides these)
  // ---------------------------------------------------------------------------

  const STALE_MS = 60_000;
  const TIMEOUT_MS = 5 * 60_000;
  const BASE_DELAY_MS = 100;
  const MAX_DELAY_MS = 2_000;
  const HEARTBEAT_MS = Math.max(100, Math.floor(STALE_MS / 3));
  const retrySchedule = Schedule.exponential(BASE_DELAY_MS, 1.7).pipe(Schedule.either(Schedule.spaced(MAX_DELAY_MS)), Schedule.jittered, Schedule.while(meta => meta.elapsed < TIMEOUT_MS));

  // ---------------------------------------------------------------------------
  // Lock metadata schema
  // ---------------------------------------------------------------------------

  const LockMetaJson = Schema.fromJsonString(Schema.Struct({
    token: Schema.String,
    pid: Schema.Number,
    hostname: Schema.String,
    createdAt: Schema.String
  }));
  const decodeMeta = Schema.decodeUnknownSync(LockMetaJson);
  const encodeMeta = Schema.encodeSync(LockMetaJson);

  // ---------------------------------------------------------------------------
  // Service
  // ---------------------------------------------------------------------------

  /** Effect service tag exposing `acquire` (scoped lock) and `withLock` (run an effect while holding the lock). */
  class Service extends Context.Service()("EffectFlock") {}
  _EffectFlock.Service = Service;
  // ---------------------------------------------------------------------------
  // Layer
  // ---------------------------------------------------------------------------

  /**
   * Returns the current wall-clock time in milliseconds, comparable to filesystem mtimes.
   * @returns {number} Wall-clock milliseconds since the Unix epoch.
   */
  function wall() {
    return performance.timeOrigin + performance.now();
  }
  /**
   * Extracts a file's modification time in milliseconds, defaulting to epoch 0 when absent.
   * @param {Object} info - A filesystem stat result whose `mtime` is an Option of Date.
   * @returns {number} The mtime in milliseconds since the Unix epoch.
   */
  const mtimeMs = info => Option.getOrElse(info.mtime, () => new Date(0)).getTime();
  /**
   * Tells whether a filesystem error indicates the target path no longer exists / is unreadable.
   * @param {Object} e - A filesystem error with a `reason._tag` discriminant.
   * @returns {boolean} True when the reason is "NotFound" or "Unknown".
   */
  const isPathGone = e => e.reason._tag === "NotFound" || e.reason._tag === "Unknown";
  /**
   * Layer constructing the EffectFlock service, closing over the filesystem and lock-root directory.
   * @type {Layer}
   */
  const layer = _EffectFlock.layer = Layer.effect(Service, Effect.gen(function* () {
    const global = yield* Global.Service;
    const fs = yield* AppFileSystem.Service;
    const lockRoot = path.join(global.state, "locks");
    const hostname = os.hostname();
    const ensuredDirs = new Set();

    // -- helpers (close over fs) --

    /**
     * Stats a file, yielding undefined (rather than failing) when the path is gone.
     * @param {string} file - The path to stat.
     * @returns {Effect} An Effect yielding the stat result, or undefined when the path does not exist.
     */
    const safeStat = file => fs.stat(file).pipe(Effect.catchIf(isPathGone, () => Effect.void), Effect.orDie);
    /**
     * Recursively removes a target, ignoring any error.
     * @param {string} target - The file or directory to remove.
     * @returns {Effect} An Effect that always succeeds once removal is attempted.
     */
    const forceRemove = target => fs.remove(target, {
      recursive: true
    }).pipe(Effect.ignore);

    /**
     * Atomic mkdir — returns true if created, false if already exists, dies on other errors.
     * @param {string} dir - The lock directory to create.
     * @returns {Effect} An Effect yielding true when newly created, false when it already existed.
     */
    const atomicMkdir = dir => fs.makeDirectory(dir, {
      mode: 0o700
    }).pipe(Effect.as(true), Effect.catchIf(e => e.reason._tag === "AlreadyExists", () => Effect.succeed(false)), Effect.orDie);

    /**
     * Write with exclusive create — compromised error if file already exists.
     * @param {string} filePath - The file to create exclusively.
     * @param {string} content - The content to write.
     * @param {string} lockDir - The owning lock directory, removed if the write collides.
     * @param {string} detail - Detail message for the LockCompromisedError on collision.
     * @returns {Effect} An Effect that succeeds on write, or fails with LockCompromisedError on collision.
     */
    const exclusiveWrite = (filePath, content, lockDir, detail) => fs.writeFileString(filePath, content, {
      flag: "wx"
    }).pipe(Effect.catch(() => Effect.gen(function* () {
      yield* forceRemove(lockDir);
      return yield* new LockCompromisedError({
        detail
      });
    })));
    /**
     * Removes a breaker directory if it is older than the staleness threshold; never claims ownership.
     * @param {string} breakerPath - The breaker directory path to inspect.
     * @returns {Effect} An Effect yielding false (the breaker is never considered claimed here).
     */
    const cleanStaleBreaker = Effect.fnUntraced(function* (breakerPath) {
      const bs = yield* safeStat(breakerPath);
      if (bs && wall() - mtimeMs(bs) > STALE_MS) yield* forceRemove(breakerPath);
      return false;
    });
    /**
     * Ensures a directory exists, caching which directories have already been created this session.
     * @param {string} dir - The directory to create recursively if needed.
     * @returns {Effect} An Effect that completes once the directory is guaranteed to exist.
     */
    const ensureDir = Effect.fnUntraced(function* (dir) {
      if (ensuredDirs.has(dir)) return;
      yield* fs.makeDirectory(dir, {
        recursive: true
      }).pipe(Effect.orDie);
      ensuredDirs.add(dir);
    });
    /**
     * Determines whether a held lock is stale, preferring the heartbeat mtime, then meta, then the lock dir itself.
     * @param {string} lockDir - The lock directory path.
     * @param {string} heartbeatPath - Path to the heartbeat file touched periodically by the holder.
     * @param {string} metaPath - Path to the lock metadata JSON file.
     * @returns {Effect} An Effect yielding true when the most-recent available timestamp exceeds the staleness threshold.
     */
    const isStale = Effect.fnUntraced(function* (lockDir, heartbeatPath, metaPath) {
      const now = wall();
      const hb = yield* safeStat(heartbeatPath);
      if (hb) return now - mtimeMs(hb) > STALE_MS;
      const meta = yield* safeStat(metaPath);
      if (meta) return now - mtimeMs(meta) > STALE_MS;
      const dir = yield* safeStat(lockDir);
      if (!dir) return false;
      return now - mtimeMs(dir) > STALE_MS;
    });

    // -- single lock attempt --

    /**
     * Attempts a single lock acquisition: atomic mkdir, with stale-lock recovery via a breaker directory,
     * then exclusively writes the heartbeat and metadata files.
     * @param {string} lockDir - The lock directory to acquire.
     * @param {string} key - The logical lock key (used for tracing attributes).
     * @returns {Effect} An Effect yielding a lock handle, failing with NotAcquired when currently held.
     */
    const tryAcquireLockDir = (lockDir, key) => Effect.gen(function* () {
      const token = randomUUID();
      const metaPath = path.join(lockDir, "meta.json");
      const heartbeatPath = path.join(lockDir, "heartbeat");

      // Atomic mkdir — the POSIX lock primitive
      const created = yield* atomicMkdir(lockDir);
      if (!created) {
        if (!(yield* isStale(lockDir, heartbeatPath, metaPath))) return yield* new NotAcquired();

        // Stale — race for breaker ownership
        const breakerPath = lockDir + ".breaker";
        const claimed = yield* fs.makeDirectory(breakerPath, {
          mode: 0o700
        }).pipe(Effect.as(true), Effect.catchIf(e => e.reason._tag === "AlreadyExists", () => cleanStaleBreaker(breakerPath)), Effect.catchIf(isPathGone, () => Effect.succeed(false)), Effect.orDie);
        if (!claimed) return yield* new NotAcquired();

        // We own the breaker — double-check staleness, nuke, recreate
        const recreated = yield* Effect.gen(function* () {
          if (!(yield* isStale(lockDir, heartbeatPath, metaPath))) return false;
          yield* forceRemove(lockDir);
          return yield* atomicMkdir(lockDir);
        }).pipe(Effect.ensuring(forceRemove(breakerPath)));
        if (!recreated) return yield* new NotAcquired();
      }

      // We own the lock dir — write heartbeat + meta with exclusive create
      yield* exclusiveWrite(heartbeatPath, "", lockDir, "heartbeat already existed");
      const metaJson = encodeMeta({
        token,
        pid: process.pid,
        hostname,
        createdAt: new Date().toISOString()
      });
      yield* exclusiveWrite(metaPath, metaJson, lockDir, "meta.json already existed");
      return {
        token,
        metaPath,
        heartbeatPath,
        lockDir
      };
    }).pipe(Effect.withSpan("EffectFlock.tryAcquire", {
      attributes: {
        key
      }
    }));

    // -- retry wrapper (preserves Handle type) --

    /**
     * Retries acquisition on the jittered exponential schedule until success or timeout.
     * @param {string} lockfile - The lock directory path to acquire.
     * @param {string} key - The logical lock key.
     * @returns {Effect} An Effect yielding the lock handle, failing with LockTimeoutError when the budget is exhausted.
     */
    const acquireHandle = (lockfile, key) => tryAcquireLockDir(lockfile, key).pipe(Effect.retry({
      while: err => err._tag === "NotAcquired",
      schedule: retrySchedule
    }), Effect.catchTag("NotAcquired", () => Effect.fail(new LockTimeoutError({
      key
    }))));

    // -- release --

    /**
     * Releases a held lock after verifying the stored token matches the handle, then removing the lock dir.
     * @param {Object} handle - The lock handle holding token, metaPath, heartbeatPath, and lockDir.
     * @returns {Effect} An Effect that completes on release, dying with ReleaseError on missing/invalid/mismatched metadata.
     */
    const release = handle => Effect.gen(function* () {
      const raw = yield* fs.readFileString(handle.metaPath).pipe(Effect.catch(err => {
        if (isPathGone(err)) return Effect.die(new ReleaseError({
          detail: "metadata missing"
        }));
        return Effect.die(err);
      }));
      const parsed = yield* Effect.try({
        try: () => decodeMeta(raw),
        catch: cause => new ReleaseError({
          detail: "metadata invalid",
          cause
        })
      }).pipe(Effect.orDie);
      if (parsed.token !== handle.token) return yield* Effect.die(new ReleaseError({
        detail: "token mismatch"
      }));
      yield* forceRemove(handle.lockDir);
    });

    // -- build service --

    /**
     * Acquires the lock for a key within the current scope and starts a heartbeat fiber; the lock is released on scope close.
     * @param {string} key - The logical lock key, hashed into a lock file name.
     * @param {string} dir - Optional override directory to hold the lock under (defaults to the shared lock root).
     * @returns {Effect} A scoped Effect that completes once the lock is held and the heartbeat is running.
     */
    const acquire = Effect.fn("EffectFlock.acquire")(function* (key, dir) {
      const lockDir = dir ?? lockRoot;
      yield* ensureDir(lockDir);
      const lockfile = path.join(lockDir, Hash.fast(key) + ".lock");

      // acquireRelease: acquire is uninterruptible, release is guaranteed
      const handle = yield* Effect.acquireRelease(acquireHandle(lockfile, key), handle => release(handle));

      // Heartbeat fiber — scoped, so it's interrupted before release runs
      yield* fs.utimes(handle.heartbeatPath, new Date(), new Date()).pipe(Effect.ignore, Effect.repeat(Schedule.spaced(HEARTBEAT_MS)), Effect.forkScoped);
    });
    /**
     * Runs an effect while holding the lock for a key, releasing it afterward. Dual-form: usable directly or piped.
     * @param {Effect} body - The effect to run while the lock is held.
     * @param {string} key - The logical lock key.
     * @param {string} dir - Optional override directory for the lock.
     * @returns {Effect} A scoped Effect yielding the body's result, with the lock held for its duration.
     */
    const withLock = Function.dual(args => Effect.isEffect(args[0]), (body, key, dir) => Effect.scoped(Effect.gen(function* () {
      yield* acquire(key, dir);
      return yield* body;
    })));
    return Service.of({
      acquire,
      withLock
    });
  }));
  /** The EffectFlock service layer with its filesystem and global-paths dependencies provided. */
  const defaultLayer = _EffectFlock.defaultLayer = layer.pipe(Layer.provide(AppFileSystem.defaultLayer), Layer.provide(Global.layer));
})(EffectFlock || (EffectFlock = {}));