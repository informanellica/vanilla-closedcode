import { createHash } from "crypto";
/** @file Hash namespace exposing a fast SHA-1 hex digest helper. */
export let Hash;
(function (_Hash) {
  /**
   * Compute a hex-encoded SHA-1 digest of the input.
   * @param {string|Buffer} input - The data to hash.
   * @returns {string} The lowercase hex SHA-1 digest.
   */
  function fast(input) {
    return createHash("sha1").update(input).digest("hex");
  }
  _Hash.fast = fast;
})(Hash || (Hash = {}));