/** @file Retry policy for LLM streaming: classifies retryable provider errors and computes backoff delays (honoring retry-after headers). */
import { Cause, Clock, Duration, Effect, Schedule } from "effect";
import { MessageV2 } from "./message-v2.js";
import { iife } from "#util/iife.js";
// This exported message is shared with the TUI upsell detector. Matching on a
// literal error string kind of sucks, but it is the simplest for now.
export const GO_UPSELL_MESSAGE = "Free usage limit exceeded";
export const RETRY_INITIAL_DELAY = 2000;
export const RETRY_BACKOFF_FACTOR = 2;
export const RETRY_MAX_DELAY_NO_HEADERS = 30_000; // 30 seconds
export const RETRY_MAX_DELAY = 2_147_483_647; // max 32-bit signed integer for setTimeout

/**
 * Clamps a delay so it never exceeds the maximum safe setTimeout value.
 * @param {number} ms - Proposed delay in milliseconds.
 * @returns {number} The delay capped at RETRY_MAX_DELAY.
 */
function cap(ms) {
  return Math.min(ms, RETRY_MAX_DELAY);
}
/**
 * Computes the wait before the next retry attempt. Prefers the provider's
 * `retry-after-ms` / `retry-after` response headers (seconds or HTTP date);
 * otherwise falls back to exponential backoff capped per the no-headers limit.
 * @param {number} attempt - 1-based attempt number.
 * @param {*} error - Optional APIError-like value carrying `data.responseHeaders`.
 * @returns {number} Delay in milliseconds before retrying.
 */
export function delay(attempt, error) {
  if (error) {
    const headers = error.data.responseHeaders;
    if (headers) {
      const retryAfterMs = headers["retry-after-ms"];
      if (retryAfterMs) {
        const parsedMs = Number.parseFloat(retryAfterMs);
        if (!Number.isNaN(parsedMs)) {
          return cap(parsedMs);
        }
      }
      const retryAfter = headers["retry-after"];
      if (retryAfter) {
        const parsedSeconds = Number.parseFloat(retryAfter);
        if (!Number.isNaN(parsedSeconds)) {
          // convert seconds to milliseconds
          return cap(Math.ceil(parsedSeconds * 1000));
        }
        // Try parsing as HTTP date format
        const parsed = Date.parse(retryAfter) - Date.now();
        if (!Number.isNaN(parsed) && parsed > 0) {
          return cap(Math.ceil(parsed));
        }
      }
      return cap(RETRY_INITIAL_DELAY * Math.pow(RETRY_BACKOFF_FACTOR, attempt - 1));
    }
  }
  return cap(Math.min(RETRY_INITIAL_DELAY * Math.pow(RETRY_BACKOFF_FACTOR, attempt - 1), RETRY_MAX_DELAY_NO_HEADERS));
}
/**
 * Decides whether an error should be retried and, if so, the human-readable
 * reason. Treats 5xx and rate-limit-style errors (via status code, message
 * heuristics, or parsed JSON error codes) as retryable; context overflow is not.
 * @param {*} error - Parsed error to classify.
 * @returns {string|undefined} A retry reason message when retryable, otherwise undefined.
 */
export function retryable(error) {
  // context overflow errors should not be retried
  if (MessageV2.ContextOverflowError.isInstance(error)) return undefined;
  if (MessageV2.APIError.isInstance(error)) {
    const status = error.data.statusCode;
    // 5xx errors are transient server failures and should always be retried,
    // even when the provider SDK doesn't explicitly mark them as retryable.
    if (!error.data.isRetryable && !(status !== undefined && status >= 500)) return undefined;
    // No ClosedCode Zen/Go upsell: that hosted tier is removed from this build.
    return error.data.message.includes("Overloaded") ? "Provider is overloaded" : error.data.message;
  }

  // Check for rate limit patterns in plain text error messages
  const msg = error.data?.message;
  if (typeof msg === "string") {
    const lower = msg.toLowerCase();
    if (lower.includes("rate increased too quickly") || lower.includes("rate limit") || lower.includes("too many requests")) {
      return msg;
    }
  }
  const json = iife(() => {
    try {
      if (typeof error.data?.message === "string") {
        const parsed = JSON.parse(error.data.message);
        return parsed;
      }
      return JSON.parse(error.data.message);
    } catch {
      return undefined;
    }
  });
  if (!json || typeof json !== "object") return undefined;
  const code = typeof json.code === "string" ? json.code : "";
  if (json.type === "error" && json.error?.type === "too_many_requests") {
    return "Too Many Requests";
  }
  if (code.includes("exhausted") || code.includes("unavailable")) {
    return "Provider is overloaded";
  }
  if (json.type === "error" && typeof json.error?.code === "string" && json.error.code.includes("rate_limit")) {
    return "Rate Limited";
  }
  return undefined;
}
/**
 * Builds an Effect Schedule that retries while `retryable` returns a reason,
 * waiting the computed `delay` between attempts and reporting progress.
 * @param {Object} opts - Policy hooks.
 * @param {Function} opts.parse - Maps a raw stream error to the classified error consumed by `retryable`.
 * @param {Function} opts.set - Called per attempt with `{attempt, message, next}` to report retry status.
 * @returns {*} An Effect Schedule usable with `Effect.retry`.
 */
export function policy(opts) {
  return Schedule.fromStepWithMetadata(Effect.succeed(meta => {
    const error = opts.parse(meta.input);
    const message = retryable(error);
    if (!message) return Cause.done(meta.attempt);
    return Effect.gen(function* () {
      const wait = delay(meta.attempt, MessageV2.APIError.isInstance(error) ? error : undefined);
      const now = yield* Clock.currentTimeMillis;
      yield* opts.set({
        attempt: meta.attempt,
        message,
        next: now + wait
      });
      return [meta.attempt, Duration.millis(wait)];
    });
  }));
}
export * as SessionRetry from "./retry.js";