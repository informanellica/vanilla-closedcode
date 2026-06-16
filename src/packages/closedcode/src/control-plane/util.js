/** @file Control-plane utility: an Effect that resolves when a matching global bus event arrives. */
import { GlobalBus } from "#bus/global.js";
import { Effect } from "effect";
/**
 * Build an Effect that waits for a global bus "event" matching a predicate.
 * Resolves successfully when `input.fn` returns truthy for an event; fails if the predicate
 * throws, the timeout elapses, or the provided abort signal aborts (including if already aborted).
 * The event listener, abort listener and timeout are always cleaned up.
 * @param {Object} input - Wait parameters.
 * @param {Function} input.fn - Predicate called with each event; truthy result resolves the Effect.
 * @param {number} input.timeout - Milliseconds to wait before failing with a timeout error.
 * @param {AbortSignal} input.signal - Optional signal that aborts the wait when triggered.
 * @returns {Effect} An Effect that succeeds with void on match or fails on abort/timeout/error.
 */
export function waitEvent(input) {
  if (input.signal?.aborted) return Effect.fail(input.signal.reason ?? new Error("Request aborted"));
  return Effect.callback(resume => {
    const abort = () => {
      cleanup();
      resume(Effect.fail(input.signal?.reason ?? new Error("Request aborted")));
    };
    const handler = event => {
      try {
        if (!input.fn(event)) return;
        cleanup();
        resume(Effect.void);
      } catch (error) {
        cleanup();
        resume(Effect.fail(error));
      }
    };
    const cleanup = () => {
      clearTimeout(timeout);
      GlobalBus.off("event", handler);
      input.signal?.removeEventListener("abort", abort);
    };
    const timeout = setTimeout(() => {
      cleanup();
      resume(Effect.fail(new Error("Timed out waiting for global event")));
    }, input.timeout);
    GlobalBus.on("event", handler);
    input.signal?.addEventListener("abort", abort, {
      once: true
    });
    return Effect.sync(cleanup);
  });
}