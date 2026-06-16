/** @file Shared viewport-aware floating-position math and placement helpers for the overlay components (Tooltip, Popover, HoverCard). */
// Shared floating-position math for the vanilla overlay components (Tooltip,
// Popover, HoverCard). This mirrors the proven viewport-aware technique in
// src/bs/dropdown-menu.js positionContent(): position:fixed content, measured
// against the reference's getBoundingClientRect(), with main-axis flip and
// viewport clamping so the panel never spills off-screen.
//
// Imports nothing from the reactive runtime — pure DOM/geometry — so it obeys
// the flip-safe import constraint by importing nothing at all.
//
// Positioning support for the @kobalte/core-derived overlay components in this
// directory. Derivative of @kobalte/core (MIT License,
// Copyright (c) 2024 jer3m01 <jer3m01@jer3m01.com>). See THIRD-PARTY-NOTICES.md.

// Parse a standard placement string ("bottom-end", "top", "right-start", …) into
// a side + alignment pair.
/**
 * Parse a placement string into its side and alignment components, with safe defaults.
 * @param {string} placement - A placement like "bottom-end", "top", "right-start"; defaults to "bottom".
 * @returns {Object} An object with side ("top"/"bottom"/"left"/"right") and align ("start"/"center"/"end").
 */
function parsePlacement(placement) {
  const raw = placement || "bottom";
  const [side, align] = raw.split("-");
  return {
    side: side === "top" || side === "bottom" || side === "left" || side === "right" ? side : "bottom",
    align: align === "start" || align === "end" ? align : "center",
  };
}

/**
 * Whether a side lies on the vertical (top/bottom) axis.
 * @param {string} side - The side ("top"/"bottom"/"left"/"right").
 * @returns {boolean} True for "top" or "bottom".
 */
const isVertical = (side) => side === "top" || side === "bottom";

// Compute the top/left (viewport coordinates, for position:fixed) of the
// content box given the reference rect, content size, and options.
//
// Options:
//   placement : placement string (default "bottom")
//   gutter    : main-axis gap between reference and content (default 0)
//   shift     : cross-axis nudge applied after alignment (default 0)
//   overlap   : when true, the content overlaps the reference on the main axis
//               (the `overlap` option — used by the compact message-nav tooltip)
//   padding   : min distance kept from the viewport edge (default 8)
/**
 * Compute the viewport-coordinate top/left for the content box (for position:fixed) given the
 * reference and content rects, applying main-axis flip when the requested side does not fit and
 * clamping to the viewport so the panel stays fully visible.
 * @param {DOMRect} referenceRect - The reference element's bounding rect.
 * @param {DOMRect} contentRect - The content element's bounding rect (its size).
 * @param {Object} options - Positioning options: placement, gutter, shift, overlap, padding.
 * @returns {Object} An object with top, left (pixels) and the resolved side.
 */
export function computePosition(referenceRect, contentRect, options = {}) {
  const { side, align } = parsePlacement(options.placement);
  const gutter = Number(options.gutter ?? 0);
  const shift = Number(options.shift ?? 0);
  const overlap = !!options.overlap;
  const padding = Number(options.padding ?? 8);
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // --- main axis: place on the requested side, flip if it doesn't fit ---
  const place = (s) => {
    if (s === "top") return referenceRect.top - (overlap ? 0 : contentRect.height) - gutter;
    if (s === "bottom") return referenceRect.bottom - (overlap ? referenceRect.height : 0) + gutter;
    if (s === "left") return referenceRect.left - (overlap ? 0 : contentRect.width) - gutter;
    // right
    return referenceRect.right - (overlap ? referenceRect.width : 0) + gutter;
  };
  const opposite = { top: "bottom", bottom: "top", left: "right", right: "left" };

  let resolvedSide = side;
  let mainPos = place(side);
  if (!overlap) {
    const vertical = isVertical(side);
    const extent = vertical ? contentRect.height : contentRect.width;
    const viewportMax = vertical ? vh : vw;
    const fitsPrimary = mainPos >= padding && mainPos + extent <= viewportMax - padding;
    if (!fitsPrimary) {
      const flippedPos = place(opposite[side]);
      const flippedFits = flippedPos >= padding && flippedPos + extent <= viewportMax - padding;
      // Flip only when the opposite side actually fits better.
      if (flippedFits) {
        resolvedSide = opposite[side];
        mainPos = flippedPos;
      }
    }
  }

  // --- cross axis: alignment (start/center/end) + shift ---
  const crossStart = (refStart, refSize, contentSize) => {
    if (align === "start") return refStart;
    if (align === "end") return refStart + refSize - contentSize;
    return refStart + refSize / 2 - contentSize / 2;
  };

  let top;
  let left;
  if (isVertical(resolvedSide)) {
    top = mainPos;
    left = crossStart(referenceRect.left, referenceRect.width, contentRect.width) + shift;
  } else {
    left = mainPos;
    top = crossStart(referenceRect.top, referenceRect.height, contentRect.height) + shift;
  }

  // --- clamp to the viewport so the panel stays fully visible ---
  left = Math.max(padding, Math.min(left, vw - contentRect.width - padding));
  top = Math.max(padding, Math.min(top, vh - contentRect.height - padding));

  return { top, left, side: resolvedSide };
}

// Position `contentEl` (must be position:fixed) relative to `referenceEl`.
// Returns the resolved side, or null when either node is detached. Writes the
// resolved side onto data-placement so styling/arrows can react to a flip.
/**
 * Position a fixed content element against a reference element and record the resolved side.
 * @param {HTMLElement} referenceEl - The anchor element to position against.
 * @param {HTMLElement} contentEl - The content element to position (must be position:fixed).
 * @param {Object} options - Positioning options forwarded to computePosition.
 * @returns {string} The resolved side, or null when either node is missing/detached.
 */
export function positionFloating(referenceEl, contentEl, options = {}) {
  if (!referenceEl || !contentEl) return null;
  if (!referenceEl.isConnected || !contentEl.isConnected) return null;
  const referenceRect = referenceEl.getBoundingClientRect();
  const contentRect = contentEl.getBoundingClientRect();
  const { top, left, side } = computePosition(referenceRect, contentRect, options);
  contentEl.style.left = `${left}px`;
  contentEl.style.top = `${top}px`;
  contentEl.setAttribute("data-placement", side);
  return side;
}

// Keep `contentEl` positioned against `referenceEl` while it is open: an
// initial rAF-deferred placement (so the content has been measured), plus
// scroll/resize listeners that re-run the placement. Returns a teardown fn.
/**
 * Keep a content element positioned against a reference element while open: schedules an initial
 * rAF-deferred placement and re-runs it on capture-phase scroll/resize events.
 * @param {HTMLElement} referenceEl - The anchor element to position against.
 * @param {HTMLElement} contentEl - The content element to keep positioned (must be position:fixed).
 * @param {Object} options - Positioning options forwarded to positionFloating.
 * @returns {Function} A teardown function that cancels the pending frame and removes the listeners.
 */
export function autoPosition(referenceEl, contentEl, options = {}) {
  let frame = 0;
  const update = () => positionFloating(referenceEl, contentEl, options);
  const schedule = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(update);
  };
  schedule();
  // Capture phase so we react to scrolling inside any ancestor scroll
  // container, not just the window.
  window.addEventListener("scroll", schedule, true);
  window.addEventListener("resize", schedule, true);
  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener("scroll", schedule, true);
    window.removeEventListener("resize", schedule, true);
  };
}
