/** @file Modal / overlay helpers for the vanilla TUI runtime (Stage T2 widgets). */
// centerBox draws a centered bordered box over a region and returns the inner
// region — the building block for dialogs. Pair it with the key-router's layer
// stack (focus.js) so an open dialog captures input and Escape closes only the
// top layer.
import { box } from "./layout.js";

/**
 * Center a w×h box within `region` and return the inner (padded) region.
 * The box is clamped to the region's bounds and centered both axes; when
 * `opts.fill` is set the outer box is filled before the border is drawn.
 * @param {Object} region - The parent Region to draw into.
 * @param {number} w - Desired box width in columns (clamped to region.width).
 * @param {number} h - Desired box height in rows (clamped to region.height).
 * @param {Object} opts - Box options forwarded to box(); also fill and fillAttr for the backing fill.
 * @returns {Object} The inner Region inside the box border (after padding).
 */
export function centerBox(region, w, h, opts = {}) {
  const cw = Math.min(w, region.width);
  const ch = Math.min(h, region.height);
  const x = Math.max(0, Math.floor((region.width - cw) / 2));
  const y = Math.max(0, Math.floor((region.height - ch) / 2));
  const outer = region.sub(x, y, cw, ch);
  if (opts.fill !== undefined) outer.fill(opts.fillAttr ?? {}, opts.fill);
  return box(outer, opts);
}
