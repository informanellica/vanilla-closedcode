import { randomBytes } from "crypto";
/**
 * @file Identifier namespace generating 26-char, time-ordered IDs (ascending or descending sortable),
 * combining a millisecond timestamp, a per-millisecond counter, and random base62 suffix bytes.
 */
export let Identifier;
(function (_Identifier) {
  const LENGTH = 26;

  // State for monotonic ID generation
  let lastTimestamp = 0;
  let counter = 0;
  /**
   * Generate an identifier whose lexicographic order matches chronological order (oldest first).
   * @returns {string} A 26-character ascending-sortable identifier.
   */
  function ascending() {
    return create(false);
  }
  _Identifier.ascending = ascending;
  /**
   * Generate an identifier whose lexicographic order is reverse-chronological (newest first).
   * @returns {string} A 26-character descending-sortable identifier.
   */
  function descending() {
    return create(true);
  }
  _Identifier.descending = descending;
  /**
   * Produce a random base62 string of the requested length.
   * @param {number} length - Number of characters to generate.
   * @returns {string} The random base62 string.
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
   * Build a time-ordered identifier. The leading 12 hex chars encode a 6-byte value derived from
   * the timestamp and a per-millisecond counter (bitwise-inverted when descending), guaranteeing
   * monotonic ordering within the same millisecond; the remainder is random base62.
   * @param {boolean} descending - When true, invert the time bytes for reverse-chronological ordering.
   * @param {number} timestamp - Optional millisecond timestamp; defaults to Date.now().
   * @returns {string} A 26-character identifier.
   */
  function create(descending, timestamp) {
    const currentTimestamp = timestamp ?? Date.now();
    if (currentTimestamp !== lastTimestamp) {
      lastTimestamp = currentTimestamp;
      counter = 0;
    }
    counter++;
    let now = BigInt(currentTimestamp) * BigInt(0x1000) + BigInt(counter);
    now = descending ? ~now : now;
    const timeBytes = Buffer.alloc(6);
    for (let i = 0; i < 6; i++) {
      timeBytes[i] = Number(now >> BigInt(40 - 8 * i) & BigInt(0xff));
    }
    return timeBytes.toString("hex") + randomBase62(LENGTH - 12);
  }
  _Identifier.create = create;
})(Identifier || (Identifier = {}));