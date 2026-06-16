/** @file Paste handling helpers for the prompt input: normalizing line endings and deciding between native and manual paste insertion. */
const LARGE_PASTE_CHARS = 8000;
const LARGE_PASTE_BREAKS = 120;
/**
 * Decide whether pasted text is "large" (by character count or number of line breaks) and therefore needs manual handling.
 * @param {string} text - The pasted text.
 * @returns {boolean} True if the paste exceeds the size or line-break thresholds.
 */
function largePaste(text) {
  if (text.length >= LARGE_PASTE_CHARS) return true;
  let breaks = 0;
  for (const char of text) {
    if (char !== "\n") continue;
    breaks += 1;
    if (breaks >= LARGE_PASTE_BREAKS) return true;
  }
  return false;
}
/**
 * Normalize pasted text by converting CRLF/CR line endings to LF.
 * @param {string} text - The pasted text.
 * @returns {string} The text with line endings normalized to "\n".
 */
export function normalizePaste(text) {
  if (!text.includes("\r")) return text;
  return text.replace(/\r\n?/g, "\n");
}
/**
 * Choose the insertion strategy for a paste: "manual" for large or multi-line text, otherwise "native".
 * @param {string} text - The pasted text.
 * @returns {string} "manual" or "native".
 */
export function pasteMode(text) {
  if (largePaste(text)) return "manual";
  if (text.includes("\n") || text.includes("\r")) return "manual";
  return "native";
}