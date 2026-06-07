import { GlobalBus } from "@/bus/global.js";
import { Effect } from "effect";
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