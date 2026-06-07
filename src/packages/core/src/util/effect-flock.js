import path from "path";
import os from "os";
import { randomUUID } from "crypto";
import { Context, Effect, Function, Layer, Option, Schedule, Schema } from "effect";
import { AppFileSystem } from "../filesystem.js";
import { Global } from "../global.js";
import { Hash } from "./hash.js";
export let EffectFlock;
(function (_EffectFlock) {
  class LockTimeoutError extends Schema.TaggedErrorClass()("LockTimeoutError", {
    key: Schema.String
  }) {}
  _EffectFlock.LockTimeoutError = LockTimeoutError;
  class LockCompromisedError extends Schema.TaggedErrorClass()("LockCompromisedError", {
    detail: Schema.String
  }) {}
  _EffectFlock.LockCompromisedError = LockCompromisedError;
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

  class Service extends Context.Service()("EffectFlock") {}
  _EffectFlock.Service = Service;
  // ---------------------------------------------------------------------------
  // Layer
  // ---------------------------------------------------------------------------

  function wall() {
    return performance.timeOrigin + performance.now();
  }
  const mtimeMs = info => Option.getOrElse(info.mtime, () => new Date(0)).getTime();
  const isPathGone = e => e.reason._tag === "NotFound" || e.reason._tag === "Unknown";
  const layer = _EffectFlock.layer = Layer.effect(Service, Effect.gen(function* () {
    const global = yield* Global.Service;
    const fs = yield* AppFileSystem.Service;
    const lockRoot = path.join(global.state, "locks");
    const hostname = os.hostname();
    const ensuredDirs = new Set();

    // -- helpers (close over fs) --

    const safeStat = file => fs.stat(file).pipe(Effect.catchIf(isPathGone, () => Effect.void), Effect.orDie);
    const forceRemove = target => fs.remove(target, {
      recursive: true
    }).pipe(Effect.ignore);

    /** Atomic mkdir — returns true if created, false if already exists, dies on other errors. */
    const atomicMkdir = dir => fs.makeDirectory(dir, {
      mode: 0o700
    }).pipe(Effect.as(true), Effect.catchIf(e => e.reason._tag === "AlreadyExists", () => Effect.succeed(false)), Effect.orDie);

    /** Write with exclusive create — compromised error if file already exists. */
    const exclusiveWrite = (filePath, content, lockDir, detail) => fs.writeFileString(filePath, content, {
      flag: "wx"
    }).pipe(Effect.catch(() => Effect.gen(function* () {
      yield* forceRemove(lockDir);
      return yield* new LockCompromisedError({
        detail
      });
    })));
    const cleanStaleBreaker = Effect.fnUntraced(function* (breakerPath) {
      const bs = yield* safeStat(breakerPath);
      if (bs && wall() - mtimeMs(bs) > STALE_MS) yield* forceRemove(breakerPath);
      return false;
    });
    const ensureDir = Effect.fnUntraced(function* (dir) {
      if (ensuredDirs.has(dir)) return;
      yield* fs.makeDirectory(dir, {
        recursive: true
      }).pipe(Effect.orDie);
      ensuredDirs.add(dir);
    });
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

    const acquireHandle = (lockfile, key) => tryAcquireLockDir(lockfile, key).pipe(Effect.retry({
      while: err => err._tag === "NotAcquired",
      schedule: retrySchedule
    }), Effect.catchTag("NotAcquired", () => Effect.fail(new LockTimeoutError({
      key
    }))));

    // -- release --

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

    const acquire = Effect.fn("EffectFlock.acquire")(function* (key, dir) {
      const lockDir = dir ?? lockRoot;
      yield* ensureDir(lockDir);
      const lockfile = path.join(lockDir, Hash.fast(key) + ".lock");

      // acquireRelease: acquire is uninterruptible, release is guaranteed
      const handle = yield* Effect.acquireRelease(acquireHandle(lockfile, key), handle => release(handle));

      // Heartbeat fiber — scoped, so it's interrupted before release runs
      yield* fs.utimes(handle.heartbeatPath, new Date(), new Date()).pipe(Effect.ignore, Effect.repeat(Schedule.spaced(HEARTBEAT_MS)), Effect.forkScoped);
    });
    const withLock = Function.dual(args => Effect.isEffect(args[0]), (body, key, dir) => Effect.scoped(Effect.gen(function* () {
      yield* acquire(key, dir);
      return yield* body;
    })));
    return Service.of({
      acquire,
      withLock
    });
  }));
  const defaultLayer = _EffectFlock.defaultLayer = layer.pipe(Layer.provide(AppFileSystem.defaultLayer), Layer.provide(Global.layer));
})(EffectFlock || (EffectFlock = {}));