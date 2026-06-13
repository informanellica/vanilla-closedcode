// Modal / overlay helpers for the vanilla TUI runtime (Stage T2 widgets).
// centerBox draws a centered bordered box over a region and returns the inner
// region — the building block for dialogs. Pair it with the key-router's layer
// stack (focus.js) so an open dialog captures input and Escape closes only the
// top layer.
import { box } from "./layout.js";

// Center a w×h box within `region`; returns the inner (padded) region.
export function centerBox(region, w, h, opts = {}) {
  const cw = Math.min(w, region.width);
  const ch = Math.min(h, region.height);
  const x = Math.max(0, Math.floor((region.width - cw) / 2));
  const y = Math.max(0, Math.floor((region.height - ch) / 2));
  const outer = region.sub(x, y, cw, ch);
  if (opts.fill !== undefined) outer.fill(opts.fillAttr ?? {}, opts.fill);
  return box(outer, opts);
}
