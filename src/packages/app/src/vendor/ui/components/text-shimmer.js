/** @file TextShimmer component: text with an animated shimmer sweep overlay that runs while active. */
import { createRenderEffect, onCleanup } from "../../../lib/reactivity.js";

/**
 * Text with a shimmer-sweep effect: stacks an aria-hidden base and shimmer layer (same text) in one
 * grid cell and runs the sweep animation while active, keeping it running one extra swap period after
 * deactivation so the fade-out is not cut short.
 * @param {Object} props - Component props.
 * @param {string} props.as - Tag name for the outer element (default "span").
 * @param {string} props.text - The text to render (also set as the aria-label).
 * @param {string} props.class - Class string applied to the outer element.
 * @param {number} props.offset - Animation index offset (sets the --text-shimmer-index custom property).
 * @param {boolean} props.active - Whether the shimmer sweep is running (default true).
 * @returns {HTMLElement} The outer shimmer element.
 */
export const TextShimmer = props => {
  const swap = 220;
  const outer = document.createElement(props.as || "span");
  const charEl = document.createElement("span");
  const base = document.createElement("span");
  const shimmer = document.createElement("span");

  outer.setAttribute("data-component", "text-shimmer");
  outer.style.setProperty("--text-shimmer-swap", `${swap}ms`);

  // The CSS overlays char-base and char-shimmer via grid-area 1/1 inside the
  // char container — both carry the same text, only one is visible at a time.
  charEl.setAttribute("data-slot", "text-shimmer-char");
  base.setAttribute("data-slot", "text-shimmer-char-base");
  base.setAttribute("aria-hidden", "true");
  shimmer.setAttribute("data-slot", "text-shimmer-char-shimmer");
  shimmer.setAttribute("aria-hidden", "true");

  charEl.appendChild(base);
  charEl.appendChild(shimmer);
  outer.appendChild(charEl);

  createRenderEffect(() => {
    outer.className = props.class ?? "";
  });

  createRenderEffect(() => {
    const text = props.text ?? "";
    base.textContent = text;
    shimmer.textContent = text;
    outer.setAttribute("aria-label", text);
  });

  createRenderEffect(() => {
    outer.style.setProperty("--text-shimmer-index", `${props.offset ?? 0}`);
  });

  // data-run keeps the sweep animation going for one extra swap period after
  // deactivation so the fade-out isn't cut short (mirrors the Solid original).
  let timer;
  createRenderEffect(() => {
    const active = props.active ?? true;
    outer.setAttribute("data-active", active ? "true" : "false");
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (active) {
      shimmer.setAttribute("data-run", "true");
      return;
    }
    timer = setTimeout(() => {
      timer = undefined;
      shimmer.setAttribute("data-run", "false");
    }, swap);
  });
  onCleanup(() => {
    if (timer) clearTimeout(timer);
  });

  return outer;
};
