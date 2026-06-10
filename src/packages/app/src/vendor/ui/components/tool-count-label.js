import { createComponent, createRenderEffect as _solidRenderEffect } from "solid-js";
import { insert as _solidInsert } from "solid-js/web";
import { AnimatedNumber } from "./animated-number.js";

function split(text) {
  const match = /{{\s*count\s*}}/.exec(text);
  if (!match || match.index === undefined) return { before: "", after: text };
  return {
    before: text.slice(0, match.index),
    after: text.slice(match.index + match[0].length)
  };
}

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
  else _solidInsert(root, number);

  root.appendChild(wordEl);

  // props.count/one/other are signal-backed getters — derive the label pieces
  // in an effect so the singular/plural form follows the live count.
  _solidRenderEffect(() => {
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

  _solidRenderEffect(() => {
    root.className = props.class ?? "";
  });

  return root;
}
