/** @module Wildcard */
/** @file Glob-style wildcard matching (`*`/`?`) plus pattern-map lookups that resolve to the most specific match. */
import { sortBy, pipe } from "remeda";

/**
 * Tests whether a string matches a glob pattern using `*` (any run) and `?` (single char).
 *
 * Backslashes in both inputs are normalized to forward slashes. A trailing `" *"`
 * makes the wildcard portion optional (so `"ls *"` matches both `"ls"` and `"ls -la"`).
 * Matching is case-insensitive on Windows.
 *
 * @param {string} str - Input string to test.
 * @param {string} pattern - Glob pattern containing `*` and/or `?`.
 * @returns {boolean} `true` if the input matches the pattern.
 */
export function match(str, pattern) {
  if (str) str = str.replaceAll("\\", "/");
  if (pattern) pattern = pattern.replaceAll("\\", "/");
  let escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&") // escape special regex chars
  .replace(/\*/g, ".*") // * becomes .*
  .replace(/\?/g, "."); // ? becomes .

  // If pattern ends with " *" (space + wildcard), make the trailing part optional
  // This allows "ls *" to match both "ls" and "ls -la"
  if (escaped.endsWith(" .*")) {
    escaped = escaped.slice(0, -3) + "( .*)?";
  }
  const flags = process.platform === "win32" ? "si" : "s";
  return new RegExp("^" + escaped + "$", flags).test(str);
}
/**
 * Looks up `input` against a map of glob patterns, returning the value of the most specific match.
 *
 * Patterns are evaluated from shortest to longest (ties broken alphabetically), so the
 * last (longest/most specific) matching pattern wins.
 *
 * @param {string} input - Input string to match against the patterns.
 * @param {Object} patterns - Map of glob pattern strings to associated values.
 * @returns {*} The value of the most specific matching pattern, or `undefined` if none match.
 */
export function all(input, patterns) {
  const sorted = pipe(patterns, Object.entries, sortBy([([key]) => key.length, "asc"], [([key]) => key, "asc"]));
  let result = undefined;
  for (const [pattern, value] of sorted) {
    if (match(input, pattern)) {
      result = value;
      continue;
    }
  }
  return result;
}
/**
 * Like {@link all}, but matches a structured command (head + tail) against space-delimited patterns.
 *
 * Each pattern's first token must glob-match `input.head`; remaining tokens are matched
 * as an ordered subsequence of `input.tail` (with `*` matching any element). Patterns are
 * tried shortest-first so the most specific match wins.
 *
 * @param {{head: string, tail: Array}} input - The command head and its tail arguments.
 * @param {Object} patterns - Map of space-delimited glob pattern strings to associated values.
 * @returns {*} The value of the most specific matching pattern, or `undefined` if none match.
 */
export function allStructured(input, patterns) {
  const sorted = pipe(patterns, Object.entries, sortBy([([key]) => key.length, "asc"], [([key]) => key, "asc"]));
  let result = undefined;
  for (const [pattern, value] of sorted) {
    const parts = pattern.split(/\s+/);
    if (!match(input.head, parts[0])) continue;
    if (parts.length === 1 || matchSequence(input.tail, parts.slice(1))) {
      result = value;
      continue;
    }
  }
  return result;
}
/**
 * Tests whether `patterns` match an ordered subsequence of `items` (gaps allowed).
 *
 * A `*` pattern is skipped (matches the gap). Each non-`*` pattern must glob-match
 * some item at or after the current position, with subsequent patterns matching later items.
 *
 * @param {Array} items - The candidate items to scan.
 * @param {Array} patterns - The ordered glob patterns to satisfy.
 * @returns {boolean} `true` if every pattern matches in order.
 */
function matchSequence(items, patterns) {
  if (patterns.length === 0) return true;
  const [pattern, ...rest] = patterns;
  if (pattern === "*") return matchSequence(items, rest);
  for (let i = 0; i < items.length; i++) {
    if (match(items[i], pattern) && matchSequence(items.slice(i + 1), rest)) {
      return true;
    }
  }
  return false;
}
export * as Wildcard from "./wildcard.js";