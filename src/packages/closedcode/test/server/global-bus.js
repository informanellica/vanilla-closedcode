import { GlobalBus } from "#bus/global.js"
import { Cause, Effect } from "effect"
export function waitGlobalBusEvent(input) {
  return Effect.callback(resume => {
    const cleanup = () => GlobalBus.off("event", handler);
    const handler = event => {
      try {
        if (!input.predicate(event)) return;
        cleanup();
        resume(Effect.succeed(event));
      } catch (error) {
        cleanup();
        resume(Effect.fail(error));
      }
    };
    GlobalBus.on("event", handler);
    return Effect.sync(cleanup);
  }).pipe(Effect.timeout(input.timeout ?? 10_000), Effect.mapError(error => Cause.isTimeoutError(error) ? new Error(input.message ?? "timed out waiting for global bus event") : error));
}
export const waitGlobalBusEventPromise = input => Effect.runPromise(waitGlobalBusEvent(input));
