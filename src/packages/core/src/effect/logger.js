/** @file Effect Logger bridge: routes Effect log output through the app's structured logger, plus a `create` factory for annotation-aware loggers. */
import { Cause, Effect, Logger, References } from "effect";
import * as Log from "../util/log.js";
/**
 * Canonicalize a log-annotation key, renaming "sessionID" to "session.id".
 * @param {string} key - The raw annotation key.
 * @returns {string} The normalized key.
 */
const normalizeKey = key => key === "sessionID" ? "session.id" : key;
/**
 * Drop null/undefined annotation values and normalize their keys.
 * @param {Object} input - A raw annotations object (may be null or undefined).
 * @returns {Object} A new object with normalized keys and only defined values.
 */
const clean = input => Object.fromEntries(Object.entries(input ?? {}).filter(entry => entry[1] !== undefined && entry[1] !== null).map(([key, value]) => [normalizeKey(key), value]));
/**
 * Coerce a log message into a string, joining array messages with spaces.
 * @param {*} input - The message (array, scalar, or undefined).
 * @returns {string} The string form of the message ("" for undefined).
 */
const text = input => {
  // oxlint-disable-next-line no-base-to-string
  if (Array.isArray(input)) return input.map(item => String(item)).join(" ");
  // oxlint-disable-next-line no-base-to-string
  return input === undefined ? "" : String(input);
};
/**
 * Run a logging Effect for a message, attaching merged/cleaned annotations.
 * @param {Function} run - A function mapping the message to a logging Effect (e.g. Effect.logInfo).
 * @param {Object} base - Base annotations carried by the logger instance.
 * @param {*} msg - The message to log.
 * @param {Object} extra - Per-call annotations merged over the base.
 * @returns {Object} The (optionally annotated) logging Effect.
 */
const call = (run, base, msg, extra) => {
  const ann = clean({
    ...base,
    ...extra
  });
  const fx = run(msg);
  return Object.keys(ann).length ? Effect.annotateLogs(fx, ann) : fx;
};
/**
 * Effect Logger that forwards each log record to the app's structured logger,
 * translating log spans/cause into annotations and mapping Effect levels to
 * the logger's debug/info/warn/error methods.
 */
export const logger = Logger.make(opts => {
  const extra = clean(opts.fiber.getRef(References.CurrentLogAnnotations));
  const now = opts.date.getTime();
  for (const [key, start] of opts.fiber.getRef(References.CurrentLogSpans)) {
    extra[`logSpan.${key}`] = `${now - start}ms`;
  }
  if (opts.cause.reasons.length > 0) {
    extra.cause = Cause.pretty(opts.cause);
  }
  const svc = typeof extra.service === "string" ? extra.service : undefined;
  if (svc) delete extra.service;
  const log = svc ? Log.create({
    service: svc
  }) : Log.Default;
  const msg = text(opts.message);
  switch (opts.logLevel) {
    case "Trace":
    case "Debug":
      return log.debug(msg, extra);
    case "Warn":
      return log.warn(msg, extra);
    case "Error":
    case "Fatal":
      return log.error(msg, extra);
    default:
      return log.info(msg, extra);
  }
});
/** Effect Layer that installs {@link logger} as the sole logger, replacing any default. */
export const layer = Logger.layer([logger], {
  mergeWithExisting: false
});
/**
 * Create an Effect-based logger bound to a set of base annotations, exposing
 * level methods plus `with` to derive a logger with additional annotations.
 * @param {Object} base - Base annotations attached to every log call (defaults to empty).
 * @returns {Object} A logger with `debug`, `info`, `warn`, `error`, and `with` methods.
 */
export const create = (base = {}) => ({
  debug: (msg, extra) => call(item => Effect.logDebug(item), base, msg, extra),
  info: (msg, extra) => call(item => Effect.logInfo(item), base, msg, extra),
  warn: (msg, extra) => call(item => Effect.logWarning(item), base, msg, extra),
  error: (msg, extra) => call(item => Effect.logError(item), base, msg, extra),
  with: extra => create({
    ...base,
    ...extra
  })
});