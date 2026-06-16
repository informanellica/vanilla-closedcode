/** @file TextStrikethrough component: spring-animated line-through that sweeps across text as it activates. */
import { createRenderEffect, onMount } from "../../../lib/reactivity.js";
import { createResizeObserver } from "../../../lib/primitives/resize-observer.js";
import { createStore } from "../../../lib/store.js";
import { useSpring } from "./motion-spring.js";

/**
 * Text with an animated line-through that sweeps from left to right as it activates: stacks the base
 * text and an aria-hidden line-through overlay in one grid cell, then spring-animates complementary
 * clip-paths so the strike progressively covers the revealed portion. Re-measures on resize.
 * @param {Object} props - Component props.
 * @param {*} props.text - The text to render (function/nullish/boolean values follow insert() semantics).
 * @param {boolean} props.active - Whether the strikethrough is engaged (drives the spring to 1).
 * @param {number} props.visualDuration - Spring visual duration in seconds (default 0.35).
 * @param {string} props.class - Class string applied to the container.
 * @param {Object} props.style - Style object applied to the container (key-diffed).
 * @returns {HTMLElement} The strikethrough container element.
 */
export function TextStrikethrough(props) {
  const progress = useSpring(() => props.active ? 1 : 0, () => ({
    visualDuration: props.visualDuration ?? 0.35,
    bounce: 0
  }));
  let baseRef;
  let containerRef;
  const [state, setState] = createStore({
    textWidth: 0,
    containerWidth: 0
  });
  const textWidth = () => state.textWidth;
  const containerWidth = () => state.containerWidth;
  const measure = () => {
    if (baseRef) setState("textWidth", baseRef.scrollWidth);
    if (containerRef) setState("containerWidth", containerRef.offsetWidth);
  };
  onMount(measure);
  createResizeObserver(() => containerRef, measure);

  // Revealed pixels from left = progress * textWidth
  const revealedPx = () => {
    const tw = textWidth();
    return tw > 0 ? progress() * tw : 0;
  };

  // Overlay clip: hide everything to the right of revealed area
  const overlayClip = () => {
    const cw = containerWidth();
    const tw = textWidth();
    if (cw <= 0 || tw <= 0) return `inset(0 ${(1 - progress()) * 100}% 0 0)`;
    const remaining = Math.max(0, cw - revealedPx());
    return `inset(0 ${remaining}px 0 0)`;
  };

  // Base clip: hide everything to the left of revealed area (complementary)
  const baseClip = () => {
    const px = revealedPx();
    if (px <= 0.5) return "none";
    return `inset(0 0 0 ${px}px)`;
  };

  // Static skeleton: a grid container stacking the base text and an
  // aria-hidden line-through overlay in the same grid cell.
  const container = document.createElement("span");
  container.setAttribute("data-component", "text-strikethrough");
  container.style.cssText = "display:grid";
  const base = document.createElement("span");
  base.style.cssText = "grid-area:1 / 1";
  const overlay = document.createElement("span");
  overlay.setAttribute("aria-hidden", "true");
  overlay.style.cssText = "grid-area:1 / 1;text-decoration:line-through;pointer-events:none";
  container.appendChild(base);
  container.appendChild(overlay);
  containerRef = container;
  baseRef = base;

  // Reactive text on both layers. props.text is plain text; render it via
  // textContent (never innerHTML). Function/nullish/boolean values follow
  // Solid insert() semantics for primitives.
  createRenderEffect(() => {
    let value = props.text;
    while (typeof value === "function") value = value();
    const text = value == null || typeof value === "boolean" ? "" : String(value);
    base.textContent = text;
    overlay.textContent = text;
  });

  // class / style / clip-path updates, mirroring the compiled render effect:
  // class is skipped when unchanged, style objects are key-diffed against the
  // previous object (removeProperty for dropped keys, setProperty otherwise),
  // and clip-paths only touch the DOM when their value changes.
  let prevClass;
  let prevStyle = {};
  let prevBaseClip;
  let prevOverlayClip;
  createRenderEffect(() => {
    const nextClass = props.class;
    if (nextClass !== prevClass) {
      prevClass = nextClass;
      if (nextClass == null) container.removeAttribute("class");
      else container.className = nextClass;
    }
    const nextStyle = {
      ...props.style
    };
    for (const key in prevStyle) {
      if (nextStyle[key] == null) container.style.removeProperty(key);
    }
    for (const key in nextStyle) {
      const v = nextStyle[key];
      if (v !== prevStyle[key]) container.style.setProperty(key, v);
    }
    prevStyle = nextStyle;
    const nextBaseClip = baseClip();
    if (nextBaseClip !== prevBaseClip) {
      prevBaseClip = nextBaseClip;
      base.style.setProperty("clip-path", nextBaseClip);
    }
    const nextOverlayClip = overlayClip();
    if (nextOverlayClip !== prevOverlayClip) {
      prevOverlayClip = nextOverlayClip;
      overlay.style.setProperty("clip-path", nextOverlayClip);
    }
  });
  return container;
}
