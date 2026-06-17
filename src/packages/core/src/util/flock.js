import path from "path";
import os from "os";
import { randomBytes, randomUUID } from "crypto";
import { mkdir, readFile, rm, stat, utimes, writeFile } from "fs/promises";
import { Hash } from "./hash.js";
import { Effect } from "effect";
/**
 * @file Cross-process advisory file lock (Flock). Uses atomic directory creation as the lock
 * primitive, a heartbeat file to keep the lock fresh, stale detection with a single-contender
 * "breaker" cleanup, exponential backoff with jitter while waiting, and token-checked release.
 * Exposes Promise-based `acquire`/`withLock` plus an Effect-based `effect` resource.
 */
export let Flock;
(function (_Flock) {
  let global;
  /**
   * Set the global context used to locate the default lock directory (under `global.state/locks`).
   * @param {Object} g - The global context object exposing a `state` directory path.
   * @returns {void}
   */
  function setGlobal(g) {
    global = g;
  }
  _Flock.setGlobal = setGlobal;
  /**
   * Resolve the default lock directory, requiring that the global context has been set.
   * @returns {string} The absolute path to the locks directory.
   */
  const root = () => {
    if (!global) throw new Error("Flock global not set");
    return path.join(global.state, "locks");
  };

  // Defaults for callers that do not provide timing options.
  const defaultOpts = {
    staleMs: 60_000,
    timeoutMs: 5 * 60_000,
    baseDelayMs: 100,
    maxDelayMs: 2_000
  };
  /**
   * Extract the string `code` property from a Node filesystem error, if present.
   * @param {*} err - The thrown error to inspect.
   * @returns {string|undefined} The error code (e.g. "EEXIST", "ENOENT") or undefined.
   */
  function code(err) {
    if (typeof err !== "object" || err === null || !("code" in err)) return;
    const value = err.code;
    if (typeof value !== "string") return;
    return value;
  }
  /**
   * Sleep for the given duration, rejecting early if the abort signal fires (or is already aborted).
   * @param {number} ms - Milliseconds to wait.
   * @param {AbortSignal} signal - Optional signal that aborts the wait.
   * @returns {Promise<void>} Resolves after the delay; rejects with the abort reason on abort.
   */
  function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason ?? new Error("Aborted"));
        return;
      }
      let timer;
      const done = () => {
        signal?.removeEventListener("abort", abort);
        resolve();
      };
      const abort = () => {
        if (timer) {
          clearTimeout(timer);
        }
        signal?.removeEventListener("abort", abort);
        reject(signal?.reason ?? new Error("Aborted"));
      };
      signal?.addEventListener("abort", abort, {
        once: true
      });
      timer = setTimeout(done, ms);
    });
  }
  /**
   * Apply +/-30% random jitter to a delay to avoid thundering-herd retries.
   * @param {number} ms - The base delay in milliseconds.
   * @returns {number} The jittered, non-negative delay.
   */
  function jitter(ms) {
    const j = Math.floor(ms * 0.3);
    const d = Math.floor(Math.random() * (2 * j + 1)) - j;
    return Math.max(0, ms + d);
  }
  /**
   * Read the monotonic clock (immune to wall-clock adjustments), for measuring elapsed time.
   * @returns {number} A monotonic timestamp in milliseconds.
   */
  function mono() {
    return performance.now();
  }
  /**
   * Read an approximate wall-clock time derived from the monotonic clock and its origin.
   * @returns {number} A wall-clock timestamp in milliseconds.
   */
  function wall() {
    return performance.timeOrigin + mono();
  }
  /**
   * Stat a path, treating "missing" errors (ENOENT/ENOTDIR) as absence rather than failure.
   * @param {string} file - The path to stat.
   * @returns {Promise<Object>} The fs.Stats object, or undefined when the path does not exist.
   */
  async function stats(file) {
    try {
      return await stat(file);
    } catch (err) {
      const errCode = code(err);
      if (errCode === "ENOENT" || errCode === "ENOTDIR") return;
      throw err;
    }
  }
  /**
   * Determine whether an existing lock is stale (owner likely crashed) by checking the freshest
   * available timestamp among the heartbeat file, the metadata file, and finally the lock directory.
   * @param {string} lockDir - The lock directory path.
   * @param {string} heartbeatPath - Path to the lock's heartbeat file.
   * @param {string} metaPath - Path to the lock's metadata file.
   * @param {number} staleMs - Age in milliseconds beyond which the lock is considered stale.
   * @returns {Promise<boolean>} True when the lock is older than staleMs (or false if nothing exists).
   */
  async function stale(lockDir, heartbeatPath, metaPath, staleMs) {
    // Stale detection allows automatic recovery after crashed owners.
    const now = wall();
    const heartbeat = await stats(heartbeatPath);
    if (heartbeat) {
      return now - heartbeat.mtimeMs > staleMs;
    }
    const meta = await stats(metaPath);
    if (meta) {
      return now - meta.mtimeMs > staleMs;
    }
    const dir = await stats(lockDir);
    if (!dir) {
      return false;
    }
    return now - dir.mtimeMs > staleMs;
  }
  /**
   * Attempt a single, non-blocking acquisition of the lock directory. Creates the directory atomically;
   * on EEXIST it checks for staleness and, if stale, uses a `.breaker` sibling directory so only one
   * contender performs cleanup before retrying. On success it writes heartbeat and meta files and
   * returns handles to start the heartbeat and release the lock.
   * @param {string} lockDir - The lock directory path to acquire.
   * @param {Object} opts - Timing options (notably `staleMs`).
   * @returns {Promise<Object>} `{ acquired: false }` when busy, or `{ acquired: true, startHeartbeat, release }`.
   */
  async function tryAcquireLockDir(lockDir, opts) {
    const token = randomUUID?.() ?? randomBytes(16).toString("hex");
    const metaPath = path.join(lockDir, "meta.json");
    const heartbeatPath = path.join(lockDir, "heartbeat");
    try {
      await mkdir(lockDir, {
        mode: 0o700
      });
    } catch (err) {
      if (code(err) !== "EEXIST") {
        throw err;
      }
      if (!(await stale(lockDir, heartbeatPath, metaPath, opts.staleMs))) {
        return {
          acquired: false
        };
      }
      const breakerPath = lockDir + ".breaker";
      try {
        await mkdir(breakerPath, {
          mode: 0o700
        });
      } catch (claimErr) {
        const errCode = code(claimErr);
        if (errCode === "EEXIST") {
          const breaker = await stats(breakerPath);
          if (breaker && wall() - breaker.mtimeMs > opts.staleMs) {
            await rm(breakerPath, {
              recursive: true,
              force: true
            }).catch(() => undefined);
          }
          return {
            acquired: false
          };
        }
        if (errCode === "ENOENT" || errCode === "ENOTDIR") {
          return {
            acquired: false
          };
        }
        throw claimErr;
      }
      try {
        // Breaker ownership ensures only one contender performs stale cleanup.
        if (!(await stale(lockDir, heartbeatPath, metaPath, opts.staleMs))) {
          return {
            acquired: false
          };
        }
        await rm(lockDir, {
          recursive: true,
          force: true
        });
        try {
          await mkdir(lockDir, {
            mode: 0o700
          });
        } catch (retryErr) {
          const errCode = code(retryErr);
          if (errCode === "EEXIST" || errCode === "ENOTEMPTY") {
            return {
              acquired: false
            };
          }
          throw retryErr;
        }
      } finally {
        await rm(breakerPath, {
          recursive: true,
          force: true
        }).catch(() => undefined);
      }
    }
    const meta = {
      token,
      pid: process.pid,
      hostname: os.hostname(),
      createdAt: new Date().toISOString()
    };
    await writeFile(heartbeatPath, "", {
      flag: "wx"
    }).catch(async () => {
      await rm(lockDir, {
        recursive: true,
        force: true
      });
      throw new Error("Lock acquired but heartbeat already existed (possible compromise).");
    });
    await writeFile(metaPath, JSON.stringify(meta, null, 2), {
      flag: "wx"
    }).catch(async () => {
      await rm(lockDir, {
        recursive: true,
        force: true
      });
      throw new Error("Lock acquired but meta.json already existed (possible compromise).");
    });
    let timer;
    /**
     * Begin periodically touching the heartbeat file's mtime so long critical sections are not
     * mistaken for stale. The interval is unref'd so it does not keep the process alive.
     * @param {number} intervalMs - Touch interval in milliseconds (defaults to ~staleMs/3, min 100).
     * @returns {void}
     */
    const startHeartbeat = (intervalMs = Math.max(100, Math.floor(opts.staleMs / 3))) => {
      if (timer) return;
      // Heartbeat prevents long critical sections from being evicted as stale.
      timer = setInterval(() => {
        const t = new Date();
        void utimes(heartbeatPath, t, t).catch(() => undefined);
      }, intervalMs);
      timer.unref?.();
    };
    /**
     * Release the lock: stop the heartbeat, verify ownership by comparing the stored token against
     * this acquisition's token, then remove the lock directory. Refuses to release if the metadata is
     * missing, invalid, or the token does not match (lock compromised or re-acquired elsewhere).
     * @returns {Promise<void>} Resolves once the lock directory is removed.
     */
    const release = async () => {
      if (timer) {
        clearInterval(timer);
        timer = undefined;
      }
      const current = await readFile(metaPath, "utf8").then(raw => {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return {};
        return {
          token: "token" in parsed && typeof parsed.token === "string" ? parsed.token : undefined
        };
      }).catch(err => {
        const errCode = code(err);
        if (errCode === "ENOENT" || errCode === "ENOTDIR") {
          throw new Error("Refusing to release: lock is compromised (metadata missing).");
        }
        if (err instanceof SyntaxError) {
          throw new Error("Refusing to release: lock is compromised (metadata invalid).");
        }
        throw err;
      });
      // Token check prevents deleting a lock that was re-acquired by another process.
      if (current.token !== token) {
        throw new Error("Refusing to release: lock token mismatch (not the owner).");
      }
      await rm(lockDir, {
        recursive: true,
        force: true
      });
    };
    return {
      acquired: true,
      startHeartbeat,
      release
    };
  }
  /**
   * Repeatedly try to acquire the lock directory, backing off with jittered exponential delays
   * between attempts until success, timeout, or abort. Invokes `input.onWait` before each wait.
   * @param {string} lockDir - The lock directory path to acquire.
   * @param {Object} input - Acquisition context (`key`, optional `onWait` callback, optional `signal`).
   * @param {Object} opts - Timing options (`timeoutMs`, `baseDelayMs`, `maxDelayMs`, `staleMs`).
   * @returns {Promise<Object>} The successful acquisition result with `startHeartbeat` and `release`.
   */
  async function acquireLockDir(lockDir, input, opts) {
    const stop = mono() + opts.timeoutMs;
    let attempt = 0;
    let waited = 0;
    let delay = opts.baseDelayMs;
    while (true) {
      input.signal?.throwIfAborted();
      const res = await tryAcquireLockDir(lockDir, opts);
      if (res.acquired) {
        return res;
      }
      if (mono() > stop) {
        throw new Error(`Timed out waiting for lock: ${input.key}`);
      }
      attempt += 1;
      const ms = jitter(delay);
      await input.onWait?.({
        key: input.key,
        attempt,
        delay: ms,
        waited
      });
      await sleep(ms, input.signal);
      waited += ms;
      delay = Math.min(opts.maxDelayMs, Math.floor(delay * 1.7));
    }
  }
  /**
   * Acquire a named lock, returning a disposable handle. The lock directory name is derived from a
   * fast hash of the key. The returned handle exposes `release()` and implements `Symbol.asyncDispose`
   * so it can be used with `await using`.
   * @param {string} key - The logical lock key.
   * @param {Object} input - Options: `dir`, `staleMs`, `timeoutMs`, `baseDelayMs`, `maxDelayMs`, `onWait`, `signal`.
   * @returns {Promise<Object>} A handle with `release` and an async dispose method.
   */
  async function acquire(key, input = {}) {
    input.signal?.throwIfAborted();
    const cfg = {
      staleMs: input.staleMs ?? defaultOpts.staleMs,
      timeoutMs: input.timeoutMs ?? defaultOpts.timeoutMs,
      baseDelayMs: input.baseDelayMs ?? defaultOpts.baseDelayMs,
      maxDelayMs: input.maxDelayMs ?? defaultOpts.maxDelayMs
    };
    const dir = input.dir ?? root();
    await mkdir(dir, {
      recursive: true
    });
    const lockfile = path.join(dir, Hash.fast(key) + ".lock");
    const lock = await acquireLockDir(lockfile, {
      key,
      onWait: input.onWait,
      signal: input.signal
    }, cfg);
    lock.startHeartbeat();
    const release = () => lock.release();
    return {
      release,
      [Symbol.asyncDispose]() {
        return release();
      }
    };
  }
  _Flock.acquire = acquire;
  /**
   * Acquire the lock, run a callback while holding it, and release the lock automatically afterward.
   * @param {string} key - The logical lock key.
   * @param {Function} fn - The callback to run while the lock is held; its return value is returned.
   * @param {Object} input - Acquisition options forwarded to `acquire`.
   * @returns {Promise<*>} A promise resolving to the callback's result.
   */
  async function withLock(key, fn, input = {}) {
    await using _ = await acquire(key, input);
    input.signal?.throwIfAborted();
    return await fn();
  }
  _Flock.withLock = withLock;
  /**
   * Effect-based scoped resource that acquires the lock and releases it when the scope closes,
   * wrapping acquire/release in tracing spans. Yields void within the scope.
   * @param {string} key - The logical lock key.
   * @param {Object} input - Acquisition options forwarded to `acquire` (signal is supplied by Effect).
   * @returns {Object} An Effect that manages the lock as an acquire/release resource.
   */
  const effect = _Flock.effect = Effect.fn("Flock.effect")(function* (key, input = {}) {
    return yield* Effect.acquireRelease(Effect.promise(signal => Flock.acquire(key, {
      ...input,
      signal
    })).pipe(Effect.withSpan("Flock.acquire", {
      attributes: {
        key
      }
    })), lock => Effect.promise(() => lock.release()).pipe(Effect.withSpan("Flock.release"))).pipe(Effect.asVoid);
  });
})(Flock || (Flock = {}));