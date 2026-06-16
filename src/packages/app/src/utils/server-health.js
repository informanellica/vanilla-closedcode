/** @file Probes a server's /health endpoint with timeout, retry, and short-lived caching. */
import { usePlatform } from "@/context/platform.js";
import { createSdkForServer } from "./server.js";
const defaultTimeoutMs = 3000;
const defaultRetryCount = 2;
const defaultRetryDelayMs = 100;
const cacheMs = 750;
const healthCache = new Map();
/**
 * Build a cache key uniquely identifying a server by url and credentials.
 * @param {Object} server - The server descriptor with url, username, and password.
 * @returns {string} A newline-joined key string.
 */
function cacheKey(server) {
  return `${server.url}\n${server.username ?? ""}\n${server.password ?? ""}`;
}
/**
 * Produce an abort signal that fires after a timeout, preferring AbortSignal.timeout.
 * @param {number} timeoutMs - Milliseconds before the signal aborts.
 * @returns {Object} An object with the signal and an optional clear() to cancel the fallback timer.
 */
function timeoutSignal(timeoutMs) {
  const timeout = AbortSignal.timeout;
  if (timeout) {
    try {
      return {
        signal: timeout.call(AbortSignal, timeoutMs),
        clear: undefined
      };
    } catch {}
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer)
  };
}
/**
 * Resolve after a delay, rejecting early with an AbortError if the signal aborts.
 * @param {number} ms - Milliseconds to wait.
 * @param {AbortSignal} signal - Optional signal whose abort rejects the wait.
 * @returns {Promise} Resolves when the delay elapses, rejects on abort.
 */
function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, {
      once: true
    });
  });
}
/**
 * Decide whether a failed health attempt should be retried.
 * @param {*} error - The error thrown by the attempt.
 * @param {AbortSignal} signal - Optional signal; an aborted signal disables retry.
 * @returns {boolean} True for transient network-style errors, false otherwise.
 */
function retryable(error, signal) {
  if (signal?.aborted) return false;
  if (!(error instanceof Error)) return false;
  if (error.name === "AbortError" || error.name === "TimeoutError") return false;
  if (error instanceof TypeError) return true;
  return /network|fetch|econnreset|econnrefused|enotfound|timedout/i.test(error.message);
}
/**
 * Probe a server's health endpoint, retrying transient failures with backoff.
 * @param {Object} server - The server descriptor (url and optional credentials).
 * @param {Function} fetch - The fetch implementation passed to the SDK client.
 * @param {Object} opts - Optional config: signal, timeoutMs, retryCount, retryDelayMs.
 * @returns {Promise<Object>} Resolves to a result with a healthy boolean and optional version.
 */
export async function checkServerHealth(server, fetch, opts) {
  const timeout = opts?.signal ? undefined : timeoutSignal(opts?.timeoutMs ?? defaultTimeoutMs);
  const signal = opts?.signal ?? timeout?.signal;
  const retryCount = opts?.retryCount ?? defaultRetryCount;
  const retryDelayMs = opts?.retryDelayMs ?? defaultRetryDelayMs;
  const next = (count, error) => {
    if (count >= retryCount || !retryable(error, signal)) return Promise.resolve({
      healthy: false
    });
    return wait(retryDelayMs * (count + 1), signal).then(() => attempt(count + 1)).catch(() => ({
      healthy: false
    }));
  };
  const attempt = count => createSdkForServer({
    server,
    fetch,
    signal
  }).global.health().then(x => x.error ? next(count, x.error) : {
    healthy: x.data?.healthy === true,
    version: x.data?.version
  }).catch(error => next(count, error));
  return attempt(0).finally(() => timeout?.clear?.());
}
/**
 * Hook returning a health-check function that dedupes and briefly caches results.
 * Uses the platform fetch (falling back to globalThis.fetch) and keys cache entries
 * per server; in-flight and recently completed probes are reused within cacheMs.
 * @returns {Function} A function taking a server descriptor and returning a Promise of the health result.
 */
export function useCheckServerHealth() {
  const platform = usePlatform();
  const fetcher = platform.fetch ?? globalThis.fetch;
  return http => {
    const key = cacheKey(http);
    const hit = healthCache.get(key);
    const now = Date.now();
    if (hit && hit.fetch === fetcher && (!hit.done || now - hit.at < cacheMs)) return hit.promise;
    const promise = checkServerHealth(http, fetcher).finally(() => {
      const next = healthCache.get(key);
      if (!next || next.promise !== promise) return;
      next.done = true;
      next.at = Date.now();
    });
    healthCache.set(key, {
      at: now,
      done: false,
      fetch: fetcher,
      promise
    });
    return promise;
  };
}