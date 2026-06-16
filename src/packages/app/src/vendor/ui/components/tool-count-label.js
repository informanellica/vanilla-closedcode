/** @file Animated, count-aware tool label that switches singular/plural text and rolls the count digits. */
import { createComponent, createRenderEffect } from "../../../lib/reactivity.js";
import { insert } from "../../../lib/reactivity.js";
import { AnimatedNumber } from "./animated-number.js";

/**
 * Split a template string around the `{{count}}` placeholder.
 * @param {string} text - Label template that may contain a `{{ count }}` token.
 * @returns {Object} Object with `before` and `after` strings around the placeholder; if no placeholder is found `before` is empty and `after` is the whole text.
 */
function split(text) {
  const match = /{{\s*count\s*}}/.exec(text);
  if (!match || match.index === undefined) return { before: "", after: text };
  return {
    before: text.slice(0, match.index),
    after: text.slice(match.index + match[0].length)
  };
}

/**
 * Compute the shared leading prefix (stem) of two strings and the divergent tails.
 * @param {string} one - First string (e.g. the singular suffix).
 * @param {string} other - Second string (e.g. the plural suffix).
 * @returns {Object} Object with `stem` (common prefix), `one` (remainder of first), and `other` (remainder of second).
 */
function common(one, other) {
  const a = Array.from(one);
  const b = Array.from(other);
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return {
    stem: a.slice(0, i).join(""),
    one: a.slice(i).join(""),
    other: b.slice(i).join("")
  };
}

/**
 * Inline label that renders a live, animated count alongside singular/plural text.
 * The count is rendered by an AnimatedNumber digit roller so it keeps animating as
 * `props.count` grows; surrounding label text follows the singular/plural form derived
 * from `props.one` / `props.other` and the current count.
 * @param {Object} props - Component props.
 * @param {number} props.count - The current count (signal-backed getter); drives the digit roller and singular/plural selection.
 * @param {string} props.one - Singular label template containing a `{{count}}` placeholder.
 * @param {string} props.other - Plural label template containing a `{{count}}` placeholder.
 * @param {string} props.class - CSS class applied to the root element.
 * @returns {HTMLElement} The root `<span>` element containing the label and animated count.
 */
export function AnimatedCountLabel(props) {
  const root = document.createElement("span");
  root.setAttribute("data-component", "tool-count-label");

  const beforeEl = document.createElement("span");
  beforeEl.setAttribute("data-slot", "tool-count-label-before");

  const wordEl = document.createElement("span");
  wordEl.setAttribute("data-slot", "tool-count-label-word");

  const stemEl = document.createElement("span");
  stemEl.setAttribute("data-slot", "tool-count-label-stem");

  const suffixEl = document.createElement("span");
  suffixEl.setAttribute("data-slot", "tool-count-label-suffix");

  const suffixInner = document.createElement("span");
  suffixInner.setAttribute("data-slot", "tool-count-label-suffix-inner");

  suffixEl.appendChild(suffixInner);
  wordEl.appendChild(stemEl);
  wordEl.appendChild(suffixEl);
  root.appendChild(beforeEl);

  // The count itself is the AnimatedNumber digit roller (between before/word),
  // driven by a getter so it keeps animating as props.count grows mid-turn.
  const number = createComponent(AnimatedNumber, {
    get value() {
      return props.count;
    }
  });
  if (number instanceof Node) root.appendChild(number);
  else insert(root, number);

  root.appendChild(wordEl);

  // props.count/one/other are signal-backed getters — derive the label pieces
  // in an effect so the singular/plural form follows the live count.
  createRenderEffect(() => {
    const one = split(props.one ?? "");
    const other = split(props.other ?? "");
    const singular = Math.round(props.count) === 1;
    const active = singular ? one : other;
    const suffix = common(one.after, other.after);
    const splitSuffix = one.before === other.before && (one.after.startsWith(other.after) || other.after.startsWith(one.after));
    const tail = splitSuffix ? (singular ? suffix.one : suffix.other) : "";

    beforeEl.textContent = splitSuffix ? one.before : active.before;
    stemEl.textContent = splitSuffix ? suffix.stem : active.after;
    suffixInner.textContent = tail;
    suffixEl.setAttribute("data-active", splitSuffix && tail.length > 0 ? "true" : "false");
  });

  createRenderEffect(() => {
    root.className = props.class ?? "";
  });

  return root;
}
