/** @file Safe base64 decode helper that swallows decode errors. */
import { base64Decode } from "core/util/encode";
/**
 * Decode a base64 string, returning undefined on missing input or decode failure.
 * @param {string} value - The base64-encoded string to decode.
 * @returns {string} The decoded string, or undefined if input is missing or invalid.
 */
export function decode64(value) {
  if (value === undefined) return;
  try {
    return base64Decode(value);
  } catch {
    return;
  }
}