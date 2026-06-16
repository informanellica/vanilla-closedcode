/** @file Block-glyph wordmark data for the "closedcode" logo, consumed by the CLI/TUI renderers. */
// Wordmark block-glyphs. Each glyph is 4 rows x 4 cols built from █ ▀ ▄ plus the
// shadow markers (_ ^ ~ ,) that the renderers (cli/ui.js, vanilla/logo.js)
// flatten/recolor. Spells "closedcode" — left half "closed", right half "code".
// Reuses the original c/o/d/e glyphs; l/s were added for the opencode->closedcode
// rebrand. Assembled programmatically so the per-row glyph spacing can't drift.
// Most glyphs are 4 cols wide; the narrow 'l' is 1 col so it kerns tightly
// against its neighbors (the per-row join just separates glyphs with one space).
const G = {
  c: ["    ", "█▀▀▀", "█___", "▀▀▀▀"],
  l: ["▄", "█", "█", "▀"],
  o: ["    ", "█▀▀█", "█__█", "▀▀▀▀"],
  s: ["    ", "█▀▀▀", "▀▀▀█", "▀▀▀▀"],
  e: ["    ", "█▀▀█", "█^^^", "▀▀▀▀"],
  d: ["   ▄", "█▀▀█", "█__█", "▀▀▀▀"],
};
/**
 * Assemble a 4-row word from glyph keys, joining the per-row glyph cells with a single space.
 * @param {...string} letters - Glyph keys (e.g. "c", "l", "o") to look up in the glyph table G.
 * @returns {Array<string>} Four strings, one per glyph row.
 */
const word = (...letters) => [0, 1, 2, 3].map(r => letters.map(ch => G[ch][r]).join(" "));

/**
 * The "closedcode" wordmark split into its two halves, each a 4-row array of glyph strings.
 * @type {{left: Array<string>, right: Array<string>}}
 */
export const logo = {
  left: word("c", "l", "o", "s", "e", "d"),
  right: word("c", "o", "d", "e"),
};
/**
 * The "go" wordmark, kept as a two-half pair in the same shape as `logo`.
 * @type {{left: Array<string>, right: Array<string>}}
 */
export const go = {
  left: ["    ", "█▀▀▀", "█_^█", "▀▀▀▀"],
  right: ["    ", "█▀▀█", "█__█", "▀▀▀▀"]
};
/**
 * The shadow-marker characters (`_ ^ ~ ,`) that renderers flatten or recolor when drawing.
 * @type {string}
 */
export const marks = "_^~,";
