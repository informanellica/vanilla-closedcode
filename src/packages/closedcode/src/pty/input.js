/**
 * @file Decodes inbound PTY WebSocket messages and forwards them to a PTY
 * connection handler, tolerating invalid (non-UTF-8) binary frames.
 */
import { Effect } from "effect";
const inputDecoder = new TextDecoder("utf-8", {
  fatal: true
});
/**
 * Forward a WebSocket input frame to the PTY handler's onMessage callback.
 * String messages are passed through directly; binary messages are decoded as
 * strict UTF-8 and silently dropped if decoding fails.
 * @param {Object} handler - The PTY connection handler with an `onMessage(string)` method.
 * @param {string|*} message - The incoming WebSocket frame (string or binary buffer/view).
 * @returns {Effect} An Effect that performs the forwarding (or no-op on invalid input).
 */
export function handlePtyInput(handler, message) {
  if (typeof message === "string") {
    handler.onMessage(message);
    return Effect.void;
  }
  return Effect.try({
    try: () => inputDecoder.decode(message),
    catch: () => new Error("invalid PTY websocket input")
  }).pipe(Effect.catch(() => Effect.succeed(undefined)), Effect.flatMap(decoded => {
    if (decoded === undefined) return Effect.void;
    handler.onMessage(decoded);
    return Effect.void;
  }));
}