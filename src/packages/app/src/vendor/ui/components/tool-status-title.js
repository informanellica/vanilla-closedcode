/** @file Tool status title component that animates between an in-progress and a completed label, sharing a common prefix where possible and shimmering the changing portion. */
import { createRenderEffect } from "../../../lib/reactivity.js";
import { TextShimmer } from "./text-shimmer.js";

/**
 * Compute the longest common leading run of two strings (character-wise) and the
 * differing tails of each.
 * @param {string} active - The active/in-progress text.
 * @param {string} done - The completed text.
 * @returns {Object} `{ prefix, active, done }` where `prefix` is the shared head and the others are the remaining tails.
 */
function common(active, done) {
  const a = Array.from(active ?? "");
  const b = Array.from(done ?? "");
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return {
    prefix: a.slice(0, i).join(""),
    active: a.slice(i).join(""),
    done: b.slice(i).join("")
  };
}

/**
 * Create a `<span>` with the given data-slot containing a TextShimmer for the
 * supplied text.
 * @param {string} slot - The `data-slot` attribute value for the span.
 * @param {string} text - The text to render inside the shimmer.
 * @param {*} active - Boolean or zero-arg accessor controlling whether the shimmer animates.
 * @param {number} offset - Character offset passed to the shimmer for staggered animation.
 * @returns {HTMLElement} The created `<span>` element.
 */
function createTextSpan(slot, text, active, offset) {
  const el = document.createElement("span");
  el.setAttribute("data-slot", slot);
  el.appendChild(TextShimmer({
    text,
    get active() { return typeof active === "function" ? active() : active; },
    offset
  }));
  return el;
}

/**
 * Render a tool status title that transitions between an active (in-progress)
 * and a done label. When the labels share a leading prefix it renders in
 * "suffix" mode (static prefix + animated tail); otherwise it cross-fades the
 * two labels in "swap" mode. The mode is reflected via `data-mode`/`data-active`
 * for CSS, and `aria-label` tracks the current state.
 * @param {Object} props - Component props.
 * @param {boolean} props.active - Whether the tool is still running (selects the active label/animation).
 * @param {string} props.activeText - Label shown while the tool is running.
 * @param {string} props.doneText - Label shown once the tool has finished.
 * @param {boolean} props.split - When false, forces swap mode instead of the shared-prefix suffix mode (defaults to true).
 * @param {string} props.class - Optional CSS classes added to the root span.
 * @returns {HTMLElement} The root `<span>` element.
 */
export function ToolStatusTitle(props) {
  const root = document.createElement("span");
  root.setAttribute("data-component", "tool-status-title");
  root.dataset.ready = "true";
  if (props.class) root.classList.add(...String(props.class).split(/\s+/).filter(Boolean));

  // active flips while the tool runs (pending → done); track it instead of
  // reading once, or the title freezes on the in-flight wording forever.
  const isActive = () => !!props.active;

  // Texts come from i18n getters, so rebuild the structure when they change
  // (locale switch); the active flip alone is handled by CSS via data-active.
  createRenderEffect(() => {
    const activeText = props.activeText ?? "";
    const doneText = props.doneText ?? "";
    const split = common(activeText, doneText);
    const suffix = (props.split ?? true) && split.prefix.length >= 2 && split.active.length > 0 && split.done.length > 0;
    const prefixLen = Array.from(split.prefix).length;
    const activeTail = suffix ? split.active : activeText;
    const doneTail = suffix ? split.done : doneText;

    root.dataset.mode = suffix ? "suffix" : "swap";

    if (suffix) {
      const suffixEl = document.createElement("span");
      suffixEl.setAttribute("data-slot", "tool-status-suffix");

      const prefix = document.createElement("span");
      prefix.setAttribute("data-slot", "tool-status-prefix");
      prefix.appendChild(TextShimmer({ text: split.prefix, get active() { return isActive(); }, offset: 0 }));
      suffixEl.appendChild(prefix);

      const tail = document.createElement("span");
      tail.setAttribute("data-slot", "tool-status-tail");
      tail.appendChild(createTextSpan("tool-status-active", activeTail, isActive, prefixLen));
      tail.appendChild(createTextSpan("tool-status-done", doneTail, false, prefixLen));
      suffixEl.appendChild(tail);
      root.replaceChildren(suffixEl);
      return;
    }

    const swap = document.createElement("span");
    swap.setAttribute("data-slot", "tool-status-swap");
    swap.appendChild(createTextSpan("tool-status-active", activeTail, isActive, 0));
    swap.appendChild(createTextSpan("tool-status-done", doneTail, false, 0));
    root.replaceChildren(swap);
  });

  createRenderEffect(() => {
    const active = isActive();
    root.dataset.active = active ? "true" : "false";
    root.setAttribute("aria-label", active ? props.activeText : props.doneText);
  });

  return root;
}
