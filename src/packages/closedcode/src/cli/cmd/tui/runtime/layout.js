// Region + layout model for the vanilla TUI runtime (Stage T2). A Region is a
// clipped rectangular view onto a terminal-kit ScreenBuffer; everything draws
// THROUGH a region so coordinates are local and out-of-bounds writes are
// silently clipped. Layout is app-specific row/column splitting (NOT a general
// Flexbox engine), which is all the TUI needs.
import { fit, sliceCols, width } from "./text.js";

// A Region over a ScreenBuffer rectangle. col/row are 0-based and local.
export function makeRegion(buf, x, y, w, h) {
  const region = {
    buf,
    x,
    y,
    width: Math.max(0, w),
    height: Math.max(0, h),
    // Put a (single-line) string at local (col,row), clipped to the region width
    // and to the region's rows. Fullwidth-safe via sliceCols.
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
    // Fill the whole region with a char+attr.
    fill(attr, ch = " ") {
      const line = ch.repeat(region.width);
      for (let r = 0; r < region.height; r++) {
        buf.put({ x: region.x, y: region.y + r, attr, wrap: false }, line);
      }
    },
    // Write a full line, padded/truncated to the region width (align via fit()).
    line(row, str, attr, align = "left") {
      region.text(0, row, fit(String(str).replace(/\n/g, " "), region.width, align), attr);
    },
    // A sub-region in local coordinates, clipped to this region's bounds.
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

// Resolve a list of {size} specs against a total length. size: a number = fixed
// cells; "flex" or {flex:n} = share the remainder weighted by n; undefined = flex 1.
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

// Split `region` vertically; each child = { size?, draw(region) }. Calls each
// child's draw with its slice. Children with numeric size get exactly that many
// rows; the rest share the remainder (flex).
export function column(region, children) {
  const sizes = resolveSizes(children, region.height);
  let row = 0;
  children.forEach((c, i) => {
    const h = Math.max(0, sizes[i] || 0);
    if (h > 0) c.draw(region.sub(0, row, region.width, h));
    row += h;
  });
}

// Split `region` horizontally (numeric size = columns, flex shares remainder).
export function row(region, children) {
  const sizes = resolveSizes(children, region.width);
  let col = 0;
  children.forEach((c, i) => {
    const w = Math.max(0, sizes[i] || 0);
    if (w > 0) c.draw(region.sub(col, 0, w, region.height));
    col += w;
  });
}

// Draw a single-line box border (+ optional title) and return the inner region.
const BORDER = { tl: "╭", tr: "╮", bl: "╰", br: "╯", h: "─", v: "│" };
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
