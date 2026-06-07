import { usePlatform } from "@/context/platform.js";
import { createSdkForServer } from "./server.js";
const defaultTimeoutMs = 3000;
const defaultRetryCount = 2;
const defaultRetryDelayMs = 100;
const cacheMs = 750;
const healthCache = new Map();
function cacheKey(server) {
  return `${server.url}\n${server.username ?? ""}\n${server.password ?? ""}`;
}
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
function retryable(error, signal) {
  if (signal?.aborted) return false;
  if (!(error instanceof Error)) return false;
  if (error.name === "AbortError" || error.name === "TimeoutError") return false;
  if (error instanceof TypeError) return true;
  return /network|fetch|econnreset|econnrefused|enotfound|timedout/i.test(error.message);
}
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