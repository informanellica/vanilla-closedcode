/** @file DiffChanges component: summarizes additions/deletions as +/- counts or a five-block colored bar gauge. */
import { createMemo, createRenderEffect } from "../../../lib/reactivity.js";

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * DiffChanges component. Aggregates additions/deletions from a single change or
 * an array of changes and renders them as one of three variants: "default"
 * (`+N`/`-N` text, hidden when there are no changes), "bars" (a five-block SVG
 * gauge proportioned by add/delete ratio), or "none" (empty).
 * @param {Object} props - Component props.
 * @param {string} props.variant - Display variant: "default", "bars", or otherwise none.
 * @param {*} props.changes - A change object with additions/deletions, or an array of such objects to sum.
 * @param {*} props.class - Class string(s) applied to the root.
 * @returns {Function} A reactive accessor resolving to the root element, or undefined when hidden.
 */
export function DiffChanges(props) {
  const variant = () => props.variant ?? "default";
  const additions = createMemo(() => Array.isArray(props.changes) ? props.changes.reduce((acc, diff) => acc + (diff.additions ?? 0), 0) : props.changes.additions);
  const deletions = createMemo(() => Array.isArray(props.changes) ? props.changes.reduce((acc, diff) => acc + (diff.deletions ?? 0), 0) : props.changes.deletions);
  const total = createMemo(() => (additions() ?? 0) + (deletions() ?? 0));
  const blockCounts = createMemo(() => {
    const TOTAL_BLOCKS = 5;
    const adds = additions() ?? 0;
    const dels = deletions() ?? 0;
    if (adds === 0 && dels === 0) {
      return {
        added: 0,
        deleted: 0,
        neutral: TOTAL_BLOCKS
      };
    }
    const total = adds + dels;
    if (total < 5) {
      const added = adds > 0 ? 1 : 0;
      const deleted = dels > 0 ? 1 : 0;
      const neutral = TOTAL_BLOCKS - added - deleted;
      return {
        added,
        deleted,
        neutral
      };
    }
    const ratio = adds > dels ? adds / dels : dels / adds;
    let BLOCKS_FOR_COLORS = TOTAL_BLOCKS;
    if (total < 20) {
      BLOCKS_FOR_COLORS = TOTAL_BLOCKS - 1;
    } else if (ratio < 4) {
      BLOCKS_FOR_COLORS = TOTAL_BLOCKS - 1;
    }
    const percentAdded = adds / total;
    const percentDeleted = dels / total;
    const added_raw = percentAdded * BLOCKS_FOR_COLORS;
    const deleted_raw = percentDeleted * BLOCKS_FOR_COLORS;
    let added = adds > 0 ? Math.max(1, Math.round(added_raw)) : 0;
    let deleted = dels > 0 ? Math.max(1, Math.round(deleted_raw)) : 0;

    // Cap bars based on actual change magnitude
    if (adds > 0 && adds <= 5) added = Math.min(added, 1);
    if (adds > 5 && adds <= 10) added = Math.min(added, 2);
    if (dels > 0 && dels <= 5) deleted = Math.min(deleted, 1);
    if (dels > 5 && dels <= 10) deleted = Math.min(deleted, 2);
    let total_allocated = added + deleted;
    if (total_allocated > BLOCKS_FOR_COLORS) {
      if (added_raw > deleted_raw) {
        added = BLOCKS_FOR_COLORS - deleted;
      } else {
        deleted = BLOCKS_FOR_COLORS - added;
      }
      total_allocated = added + deleted;
    }
    const neutral = Math.max(0, TOTAL_BLOCKS - total_allocated);
    return {
      added,
      deleted,
      neutral
    };
  });
  const ADD_COLOR = "var(--icon-diff-add-base)";
  const DELETE_COLOR = "var(--icon-diff-delete-base)";
  const NEUTRAL_COLOR = "var(--icon-weak-base)";
  const visibleBlocks = createMemo(() => {
    const counts = blockCounts();
    const blocks = [...Array(counts.added).fill(ADD_COLOR), ...Array(counts.deleted).fill(DELETE_COLOR), ...Array(counts.neutral).fill(NEUTRAL_COLOR)];
    return blocks.slice(0, 5);
  });

  const root = document.createElement("div");
  root.setAttribute("data-component", "diff-changes");

  // Switch/Match over the variant: pick the branch in a memo so equal values
  // never rebuild the branch DOM, only flips between bars/default/none do.
  const branch = createMemo(() => variant() === "bars" ? "bars" : variant() === "default" ? "default" : "none");
  createRenderEffect(() => {
    const which = branch();
    if (which === "bars") {
      const svg = document.createElementNS(SVG_NS, "svg");
      svg.setAttribute("xmlns", SVG_NS);
      svg.setAttribute("viewBox", "0 0 18 14");
      svg.setAttribute("fill", "none");
      const group = document.createElementNS(SVG_NS, "g");
      svg.appendChild(group);
      // For(visibleBlocks): the rects are attribute-only (no listeners or
      // state), so rebuilding all five on change is equivalent to keyed reuse.
      createRenderEffect(() => {
        group.replaceChildren(...visibleBlocks().map((color, i) => {
          const rect = document.createElementNS(SVG_NS, "rect");
          rect.setAttribute("width", "2");
          rect.setAttribute("height", "14");
          rect.setAttribute("rx", "1");
          rect.setAttribute("fill", color);
          rect.setAttribute("x", String(i * 4));
          return rect;
        }));
      });
      root.replaceChildren(svg);
    } else if (which === "default") {
      const addsEl = document.createElement("span");
      addsEl.setAttribute("data-slot", "diff-changes-additions");
      const delsEl = document.createElement("span");
      delsEl.setAttribute("data-slot", "diff-changes-deletions");
      createRenderEffect(() => {
        addsEl.textContent = `+${additions()}`;
      });
      createRenderEffect(() => {
        delsEl.textContent = `-${deletions()}`;
      });
      root.replaceChildren(addsEl, delsEl);
    } else {
      root.replaceChildren();
    }
  });

  // Change-guarded data-variant, like the compiled effect().
  let prevVariant;
  createRenderEffect(() => {
    const v = variant();
    if (v !== prevVariant) root.setAttribute("data-variant", prevVariant = v);
  });

  // classList({ [props.class ?? ""]: true }): tokens from props.class are the
  // only classes ever applied to the root, so swap the attribute wholesale and
  // keep it absent (not empty) when no class is given.
  let prevClass;
  createRenderEffect(() => {
    const cls = props.class ?? "";
    if (cls === prevClass) return;
    prevClass = cls;
    if (cls) root.setAttribute("class", cls);
    else root.removeAttribute("class");
  });

  // Show(when): default variant hides the whole component until there are
  // changes. Callers insert the result via solid insert(), which resolves a
  // returned accessor reactively, so yield the root element or undefined.
  const visible = createMemo(() => variant() === "default" ? total() > 0 : true);
  return createMemo(() => visible() ? root : undefined);
}
