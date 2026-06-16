/**
 * @file Effect-wrapped @clack/prompts helpers: intro/outro/log/select/spinner
 * exposed as Effects so interactive CLI prompts compose inside Effect handlers.
 */
import * as prompts from "@clack/prompts";
import { Effect, Option } from "effect";
/**
 * Print a prompt intro line.
 * @param {string} msg - The intro message.
 * @returns {Effect} An Effect that prints the intro when run.
 */
export const intro = msg => Effect.sync(() => prompts.intro(msg));
/**
 * Print a prompt outro line.
 * @param {string} msg - The outro message.
 * @returns {Effect} An Effect that prints the outro when run.
 */
export const outro = msg => Effect.sync(() => prompts.outro(msg));
/**
 * Logging helpers wrapped as Effects.
 * @type {Object}
 */
export const log = {
  /**
   * Print an info-level log line.
   * @param {string} msg - The message to log.
   * @returns {Effect} An Effect that logs when run.
   */
  info: msg => Effect.sync(() => prompts.log.info(msg))
};
/**
 * Present a single-select prompt, mapping cancellation to Option.none.
 * @param {Object} opts - @clack/prompts select options (message, options, initialValue).
 * @returns {Effect} An Effect resolving to Option.some(value) or Option.none() if cancelled.
 */
export const select = opts => Effect.tryPromise(() => prompts.select(opts)).pipe(Effect.map(result => {
  if (prompts.isCancel(result)) return Option.none();
  return Option.some(result);
}));
/**
 * Create a spinner whose start/stop are exposed as Effects.
 * @returns {Object} { start, stop } where each returns an Effect.
 */
export const spinner = () => {
  const s = prompts.spinner();
  return {
    start: msg => Effect.sync(() => s.start(msg)),
    stop: (msg, code) => Effect.sync(() => s.stop(msg, code))
  };
};