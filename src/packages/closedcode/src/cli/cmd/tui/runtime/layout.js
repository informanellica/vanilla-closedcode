/** @file Region + layout model for the vanilla TUI runtime (Stage T2): clipped sub-views over a ScreenBuffer plus row/column splitting. */
// A Region is a clipped rectangular view onto a terminal-kit ScreenBuffer;
// everything draws THROUGH a region so coordinates are local and out-of-bounds
// writes are silently clipped. Layout is app-specific row/column splitting (NOT
// a general Flexbox engine), which is all the TUI needs.
import { fit, sliceCols, width } from "./text.js";

/**
 * Create a Region: a local, clipped rectangular view over a ScreenBuffer.
 * All coordinates passed to the returned methods are 0-based and local to the
 * region; writes outside the region (or buffer) are silently clipped.
 * @param {Object} buf - The terminal-kit ScreenBuffer to draw into.
 * @param {number} x - Absolute buffer x of the region's top-left corner.
 * @param {number} y - Absolute buffer y of the region's top-left corner.
 * @param {number} w - Region width in cells (clamped to >= 0).
 * @param {number} h - Region height in cells (clamped to >= 0).
 * @returns {Object} A Region with text, fill, line, and sub methods plus its geometry (buf, x, y, width, height).
 */
export function makeRegion(buf, x, y, w, h) {
  const region = {
    buf,
    x,
    y,
    width: Math.max(0, w),
    height: Math.max(0, h),
    /**
     * Put a single-line string at local (col, row), clipped to the region's
     * width and rows. Newlines are flattened to spaces; fullwidth-safe via sliceCols.
     * @param {number} col - Local column (0-based); negative values clip from the left.
     * @param {number} row - Local row (0-based); out-of-range rows are skipped.
     * @param {*} str - Text to write (coerced to string).
     * @param {Object} attr - Cell attributes (color/style) passed to the buffer.
     * @returns {void}
     */
    text(col, row, str, attr) {
      if (row < 0 || row >= region.height) return;
      if (col >= region.width) return;
      let s = String(str).replace(/\n/g, " ");
      let start = 0;
      if (col < 0) { start = -col; col = 0; }
      const avail = region.width - col;
      if (avail <= 0) return;
      const visible = sliceCols(s, start, avail);
      if (visible === "") return;
      buf.put({ x: region.x + col, y: region.y + row, attr, wrap: false }, visible);
    },
    /**
     * Fill every cell of the region with a character and attributes.
     * @param {Object} attr - Cell attributes (color/style).
     * @param {string} ch - Fill character (default a space).
     * @returns {void}
     */
    fill(attr, ch = " ") {
      const line = ch.repeat(region.width);
      for (let r = 0; r < region.height; r++) {
        buf.put({ x: region.x, y: region.y + r, attr, wrap: false }, line);
      }
    },
    /**
     * Write a full-width line, padded or truncated to the region width.
     * @param {number} row - Local row (0-based).
     * @param {*} str - Line text (coerced to string; newlines flattened to spaces).
     * @param {Object} attr - Cell attributes (color/style).
     * @param {string} align - Alignment passed to fit(): "left", "center", or "right".
     * @returns {void}
     */
    line(row, str, attr, align = "left") {
      region.text(0, row, fit(String(str).replace(/\n/g, " "), region.width, align), attr);
    },
    /**
     * Carve out a sub-region in local coordinates, clipped to this region's bounds.
     * @param {number} dx - Local x offset of the sub-region (clamped to >= 0).
     * @param {number} dy - Local y offset of the sub-region (clamped to >= 0).
     * @param {number} sw - Requested sub-region width (clipped to remaining width).
     * @param {number} sh - Requested sub-region height (clipped to remaining height).
     * @returns {Object} A new Region clipped to this region.
     */
    sub(dx, dy, sw, sh) {
      const nx = region.x + Math.max(0, dx);
      const ny = region.y + Math.max(0, dy);
      const nw = Math.min(sw, region.width - Math.max(0, dx));
      const nh = Math.min(sh, region.height - Math.max(0, dy));
      return makeRegion(buf, nx, ny, nw, nh);
    },
  };
  return region;
}

/**
 * Resolve a list of child {size} specs against a total length. A numeric size
 * is a fixed number of cells; "flex" or {flex:n} shares the remainder weighted
 * by n; undefined behaves as flex 1. The last flex child absorbs rounding so
 * the sizes sum exactly to the available remainder.
 * @param {Array} children - Children, each with optional size and/or flex.
 * @param {number} total - Total cells to distribute.
 * @returns {Array} Per-child resolved sizes (parallel to children).
 */
function resolveSizes(children, total) {
  let used = 0;
  let flexTotal = 0;
  const flexOf = c => (c && (c.flex ?? (c.size === "flex" ? 1 : c.size == null ? (typeof c.size === "number" ? 0 : 1) : 0))) || 0;
  for (const c of children) {
    if (typeof c.size === "number") used += c.size;
    else flexTotal += flexOf(c) || 1;
  }
  let remain = Math.max(0, total - used);
  const sizes = [];
  let distributed = 0;
  const flexChildren = children.filter(c => typeof c.size !== "number");
  flexChildren.forEach((c, i) => {
    const f = flexOf(c) || 1;
    const isLast = i === flexChildren.length - 1;
    const share = isLast ? remain - distributed : Math.floor((remain * f) / (flexTotal || 1));
    c.__flexSize = share;
    distributed += share;
  });
  for (const c of children) sizes.push(typeof c.size === "number" ? c.size : c.__flexSize);
  return sizes;
}

/**
 * Split `region` vertically into rows and draw each child into its slice.
 * Children with a numeric size get exactly that many rows; the rest share the
 * remainder (flex). Each child's draw(region) is called with its sub-region.
 * @param {Object} region - The Region to split.
 * @param {Array} children - Children, each with optional size and a draw(region) function.
 * @returns {void}
 */
export function column(region, children) {
  const sizes = resolveSizes(children, region.height);
  let row = 0;
  children.forEach((c, i) => {
    const h = Math.max(0, sizes[i] || 0);
    if (h > 0) c.draw(region.sub(0, row, region.width, h));
    row += h;
  });
}

/**
 * Split `region` horizontally into columns and draw each child into its slice.
 * Numeric size = fixed columns; flex children share the remaining width.
 * @param {Object} region - The Region to split.
 * @param {Array} children - Children, each with optional size and a draw(region) function.
 * @returns {void}
 */
export function row(region, children) {
  const sizes = resolveSizes(children, region.width);
  let col = 0;
  children.forEach((c, i) => {
    const w = Math.max(0, sizes[i] || 0);
    if (w > 0) c.draw(region.sub(col, 0, w, region.height));
    col += w;
  });
}

// Box-drawing characters for the single-line rounded border.
const BORDER = { tl: "╭", tr: "╮", bl: "╰", br: "╯", h: "─", v: "│" };
/**
 * Draw a single-line rounded box border (plus an optional title) around the
 * edge of `region` and return the inner region. Returns a zero-size region when
 * the area is too small (< 2 in either dimension) to hold a border.
 * @param {Object} region - The Region to draw the border on.
 * @param {Object} opts - Box options: attr (border attributes), title (string drawn on the top edge), padding (inner inset in cells, default 0).
 * @returns {Object} The inner Region inside the border and padding.
 */
export function box(region, { attr, title, padding = 0 } = {}) {
  const { width: w, height: h } = region;
  if (w < 2 || h < 2) return region.sub(0, 0, 0, 0);
  region.text(0, 0, BORDER.tl + BORDER.h.repeat(w - 2) + BORDER.tr, attr);
  region.text(0, h - 1, BORDER.bl + BORDER.h.repeat(w - 2) + BORDER.br, attr);
  for (let r = 1; r < h - 1; r++) { region.text(0, r, BORDER.v, attr); region.text(w - 1, r, BORDER.v, attr); }
  if (title) {
    const t = ` ${title} `;
    if (width(t) <= w - 2) region.text(1, 0, t, attr);
  }
  const p = padding;
  return region.sub(1 + p, 1 + p, w - 2 - 2 * p, h - 2 - 2 * p);
}
