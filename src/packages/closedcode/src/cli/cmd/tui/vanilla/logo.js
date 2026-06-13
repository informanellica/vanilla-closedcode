// Static logo renderer for the vanilla TUI app shell (Stage T3). The live
// component/logo.js is a per-cell animated shimmer field over @opentui RGBA
// text nodes (subpixel ▀/▄ blocks); reproducing that animation in immediate
// mode is a later (status/logo/misc) stage. Here we draw the SAME glyph shape
// (cli/logo.js) statically: the shadow markers (_ ^ ~ ,) collapse to their plain
// block/space form so the wordmark reads correctly without the shadow pass.
import { logo as SHAPE } from "../../../logo.js";
import { width } from "../runtime/text.js";

// Shadow markers -> plain glyph. `_`/`~`/`,` are shadow-only cells (blank when
// the shadow pass is dropped); `^` is "letter top over shadow" -> a top block.
const MARK = { _: " ", "^": "▀", "~": " ", ",": " " };
const flatten = ch => MARK[ch] ?? ch;

// The full wordmark: left half + 1-col gap + right half, per row.
const GAP = 1;
export const LOGO_LINES = SHAPE.left.map(
  (line, i) => [...line].map(flatten).join("") + " ".repeat(GAP) + [...SHAPE.right[i]].map(flatten).join(""),
);
export const LOGO_WIDTH = Math.max(0, ...LOGO_LINES.map(width));
export const LOGO_HEIGHT = LOGO_LINES.length;

// Draw the logo into `region`, horizontally centered by default. Returns the
// number of rows drawn (LOGO_HEIGHT) so callers can lay out below it.
export function drawLogo(region, attr, { row = 0, center = true } = {}) {
  const offset = center ? Math.max(0, Math.floor((region.width - LOGO_WIDTH) / 2)) : 0;
  LOGO_LINES.forEach((line, i) => region.text(offset, row + i, line, attr));
  return LOGO_HEIGHT;
}
