// Static logo renderer for the vanilla TUI app shell (Stage T3). The live
// component/logo.js is a per-cell animated shimmer field over @opentui RGBA
// text nodes (subpixel ▀/▄ blocks); reproducing that animation in immediate
// mode is a later (status/logo/misc) stage. Here we draw the SAME glyph shape
// (cli/logo.js) statically: the shadow markers (_ ^ ~ ,) collapse to their plain
// block/space form so the wordmark reads correctly without the shadow pass.
/** @file Static logo renderer for the vanilla TUI app shell: draws the cli/logo.js wordmark shape with shadow markers collapsed to their plain block/space form. */
import { logo as SHAPE } from "../../../logo.js";
import { width } from "../runtime/text.js";

// Shadow markers -> plain glyph. `_`/`~`/`,` are shadow-only cells (blank when
// the shadow pass is dropped); `^` is "letter top over shadow" -> a top block.
const MARK = { _: " ", "^": "▀", "~": " ", ",": " " };
/**
 * Flatten a single shape character: shadow markers map via MARK, others pass through.
 * @param {string} ch - The shape character.
 * @returns {string} The flattened glyph.
 */
const flatten = ch => MARK[ch] ?? ch;

// The full wordmark: left half + 1-col gap + right half, per row.
const GAP = 1;
export const LOGO_LINES = SHAPE.left.map(
  (line, i) => [...line].map(flatten).join("") + " ".repeat(GAP) + [...SHAPE.right[i]].map(flatten).join(""),
);
export const LOGO_WIDTH = Math.max(0, ...LOGO_LINES.map(width));
export const LOGO_HEIGHT = LOGO_LINES.length;

/**
 * Draw the logo into `region`, horizontally centered by default.
 * @param {Object} region - The render region (text(x, y, str, attr), width).
 * @param {*} attr - The text attribute to draw the logo with.
 * @param {Object} [opts] - Layout options.
 * @param {number} [opts.row] - The starting row within the region (default 0).
 * @param {boolean} [opts.center] - Whether to center horizontally (default true).
 * @returns {number} The number of rows drawn (LOGO_HEIGHT) so callers can lay out below it.
 */
export function drawLogo(region, attr, { row = 0, center = true } = {}) {
  const offset = center ? Math.max(0, Math.floor((region.width - LOGO_WIDTH) / 2)) : 0;
  LOGO_LINES.forEach((line, i) => region.text(offset, row + i, line, attr));
  return LOGO_HEIGHT;
}
