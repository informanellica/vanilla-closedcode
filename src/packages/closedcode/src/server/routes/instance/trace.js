import { Effect } from "effect";
import { AppRuntime } from "@/effect/app-runtime.js";

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
export function paramToAttributeKey(key) {
  const m = key.match(/^(.+)ID$/);
  if (m) return `${m[1].toLowerCase()}.id`;
  return `closedcode.${key}`;
}
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
export function runRequest(name, c, effect) {
  return AppRuntime.runPromise(effect.pipe(Effect.withSpan(name, {
    attributes: requestAttributes(c)
  })));
}
export async function jsonRequest(name, c, effect) {
  return c.json(await runRequest(name, c, Effect.gen(() => effect(c))));
}