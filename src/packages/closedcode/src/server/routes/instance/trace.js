/** @file Tracing helpers for instance HTTP handlers: build OTel span attributes from a request and run handler effects inside a span. */
import { Effect } from "effect";
import { AppRuntime } from "#effect/app-runtime.js";

// Build the base span attributes for an HTTP handler: method, path, and every
// matched route param. Names follow OTel attribute-naming guidance:
// domain-first (`session.id`, `message.id`, …) so they match the existing
// OTel `session.id` semantic convention and the bare `message.id` we
// already emit from Tool.execute. Non-standard route params fall back to
// `closedcode.<name>` since those are internal implementation details
// (per https://opentelemetry.io/blog/2025/how-to-name-your-span-attributes/).

// Normalize a route param key (e.g. `sessionID`, `messageID`, `name`)
// to an OTel attribute key. `fooID` → `foo.id` for ID-shaped params; any
// other param is namespaced under `closedcode.` to avoid colliding with
// standard conventions.
/**
 * Map a route param name to an OTel span attribute key.
 * Names ending in `ID` become `<lowercased-prefix>.id` (e.g. `sessionID` -> `session.id`);
 * all other names are namespaced under `closedcode.` to avoid colliding with standard conventions.
 * @param {string} key - The route parameter name.
 * @returns {string} The corresponding OTel attribute key.
 */
export function paramToAttributeKey(key) {
  const m = key.match(/^(.+)ID$/);
  if (m) return `${m[1].toLowerCase()}.id`;
  return `closedcode.${key}`;
}
/**
 * Build the base span attributes for an HTTP request: HTTP method, path, and every matched route param.
 * @param {Object} c - The request context (Hono-style context exposing `c.req`).
 * @returns {Object} A map of OTel attribute keys to string values.
 */
export function requestAttributes(c) {
  const attributes = {
    "http.method": c.req.method,
    "http.path": new URL(c.req.url).pathname
  };
  for (const [key, value] of Object.entries(c.req.param())) {
    attributes[paramToAttributeKey(key)] = value;
  }
  return attributes;
}
/**
 * Run an effect as a traced HTTP request, wrapping it in a span named `name` with the request's attributes.
 * @param {string} name - The span name.
 * @param {Object} c - The request context used to derive span attributes.
 * @param {Effect} effect - The effect to execute within the span.
 * @returns {Promise<*>} A promise that resolves to the effect's result.
 */
export function runRequest(name, c, effect) {
  return AppRuntime.runPromise(effect.pipe(Effect.withSpan(name, {
    attributes: requestAttributes(c)
  })));
}
/**
 * Run a request-producing effect within a span and serialize its result as a JSON response.
 * @param {string} name - The span name.
 * @param {Object} c - The request context; also used to build the JSON response.
 * @param {Function} effect - A function receiving the context `c` and returning the effect to run.
 * @returns {Promise<*>} A promise resolving to the JSON response.
 */
export async function jsonRequest(name, c, effect) {
  return c.json(await runRequest(name, c, Effect.gen(() => effect(c))));
}