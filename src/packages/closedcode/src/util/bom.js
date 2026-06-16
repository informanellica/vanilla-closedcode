/** @file UTF-8 BOM (byte-order mark) utilities: detect, strip, re-apply, and preserve a leading BOM when reading/writing files. */
import { Effect } from "effect";
const BOM_CODE = 0xfeff;
const BOM = String.fromCharCode(BOM_CODE);
/**
 * Splits a leading BOM (if present) from the text.
 *
 * @param {string} text - The input text, possibly prefixed with a BOM
 * @returns {{bom: boolean, text: string}} `bom` indicates whether a BOM was present; `text` is the content without the BOM
 */
export function split(text) {
  if (text.charCodeAt(0) !== BOM_CODE) return {
    bom: false,
    text
  };
  return {
    bom: true,
    text: text.slice(1)
  };
}
/**
 * Returns the text with a BOM applied or removed, after first stripping any existing BOM.
 *
 * @param {string} text - The input text (any existing leading BOM is stripped first)
 * @param {boolean} bom - When true, prepend a BOM; when false, return the stripped text
 * @returns {string} The text with the BOM state normalized to `bom`
 */
export function join(text, bom) {
  const stripped = split(text).text;
  if (!bom) return stripped;
  return BOM + stripped;
}
/**
 * Reads a file and splits off any leading UTF-8 BOM.
 *
 * The decoder is configured with `ignoreBOM: true` so the BOM is preserved in the
 * decoded string and can be detected/stripped explicitly.
 *
 * @param {Object} fs - Filesystem service exposing `readFile`
 * @param {string} filePath - Path of the file to read
 * @returns {Effect} An Effect yielding `{bom: boolean, text: string}`
 */
export const readFile = Effect.fn("Bom.readFile")(function* (fs, filePath) {
  return split(new TextDecoder("utf-8", {
    ignoreBOM: true
  }).decode(yield* fs.readFile(filePath)));
});
/**
 * Ensures a file's BOM state matches the desired value, rewriting it only if it differs.
 *
 * @param {Object} fs - Filesystem service exposing `readFile` and `writeWithDirs`
 * @param {string} filePath - Path of the file to sync
 * @param {boolean} bom - Desired BOM state: true to ensure a BOM, false to ensure none
 * @returns {Effect} An Effect yielding the file's text without the BOM
 */
export const syncFile = Effect.fn("Bom.syncFile")(function* (fs, filePath, bom) {
  const current = yield* readFile(fs, filePath);
  if (current.bom === bom) return current.text;
  yield* fs.writeWithDirs(filePath, join(current.text, bom));
  return current.text;
});