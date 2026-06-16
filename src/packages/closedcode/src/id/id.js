/** @file Prefixed, time-sortable unique ID generation (ULID-like): monotonic timestamp bytes plus random base62 suffix, in ascending or descending order. */
import z from "zod";
import { randomBytes } from "crypto";
/** Map of entity kinds to their short ID prefixes (e.g. session -> "ses"). */
const prefixes = {
  event: "evt",
  session: "ses",
  message: "msg",
  permission: "per",
  question: "que",
  user: "usr",
  part: "prt",
  pty: "pty",
  tool: "tool",
  workspace: "wrk",
  entry: "ent"
};
/**
 * Build a Zod schema validating that a string starts with the given kind's prefix.
 * @param {string} prefix - Entity kind key (e.g. "session", "message").
 * @returns {Object} Zod string schema enforcing the prefix.
 */
export function schema(prefix) {
  return z.string().startsWith(prefixes[prefix]);
}
/** Total length of the generated ID body (timestamp hex + random suffix). */
const LENGTH = 26;

// State for monotonic ID generation
let lastTimestamp = 0;
let counter = 0;
/**
 * Generate (or validate) an ascending, time-sortable ID for an entity kind.
 * @param {string} prefix - Entity kind key (e.g. "session").
 * @param {string} given - Optional existing ID to validate/return instead of generating a new one.
 * @returns {string} The ascending ID.
 */
export function ascending(prefix, given) {
  return generateID(prefix, "ascending", given);
}
/**
 * Generate (or validate) a descending, time-sortable ID for an entity kind.
 * @param {string} prefix - Entity kind key (e.g. "session").
 * @param {string} given - Optional existing ID to validate/return instead of generating a new one.
 * @returns {string} The descending ID.
 */
export function descending(prefix, given) {
  return generateID(prefix, "descending", given);
}
/**
 * Create a new ID in the requested direction, or validate a provided one.
 * @param {string} prefix - Entity kind key used to look up the short prefix.
 * @param {string} direction - Either "ascending" or "descending".
 * @param {string} given - Optional existing ID; if present it must start with the kind's prefix.
 * @returns {string} The new or validated ID.
 */
function generateID(prefix, direction, given) {
  if (!given) {
    return create(prefixes[prefix], direction);
  }
  if (!given.startsWith(prefixes[prefix])) {
    throw new Error(`ID ${given} does not start with ${prefixes[prefix]}`);
  }
  return given;
}
/**
 * Generate a cryptographically random base62 string of the given length.
 * @param {number} length - Number of characters to produce.
 * @returns {string} Random base62 string.
 */
function randomBase62(length) {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  let result = "";
  const bytes = randomBytes(length);
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % 62];
  }
  return result;
}
/**
 * Build the raw prefixed ID from a 6-byte (de)scending timestamp encoding plus a random base62 suffix.
 * Uses a module-level monotonic counter so multiple IDs in the same millisecond stay ordered.
 * @param {string} prefix - Short ID prefix (already resolved, e.g. "ses").
 * @param {string} direction - "ascending" (timestamp as-is) or "descending" (bitwise-inverted timestamp).
 * @param {number} timestamp - Optional millisecond timestamp; defaults to Date.now().
 * @returns {string} The fully formed ID (prefix + "_" + 12 hex chars + random suffix).
 */
export function create(prefix, direction, timestamp) {
  const currentTimestamp = timestamp ?? Date.now();
  if (currentTimestamp !== lastTimestamp) {
    lastTimestamp = currentTimestamp;
    counter = 0;
  }
  counter++;
  let now = BigInt(currentTimestamp) * BigInt(0x1000) + BigInt(counter);
  now = direction === "descending" ? ~now : now;
  const timeBytes = Buffer.alloc(6);
  for (let i = 0; i < 6; i++) {
    timeBytes[i] = Number(now >> BigInt(40 - 8 * i) & BigInt(0xff));
  }
  return prefix + "_" + timeBytes.toString("hex") + randomBase62(LENGTH - 12);
}

/**
 * Extract timestamp from an ascending ID. Does not work with descending IDs.
 * @param {string} id - An ascending ID produced by this module.
 * @returns {number} The millisecond timestamp embedded in the ID.
 */
export function timestamp(id) {
  const prefix = id.split("_")[0];
  const hex = id.slice(prefix.length + 1, prefix.length + 13);
  const encoded = BigInt("0x" + hex);
  return Number(encoded / BigInt(0x1000));
}
export * as Identifier from "./id.js";