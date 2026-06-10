import { createRenderEffect as _solidRenderEffect } from "solid-js";
import { TextShimmer } from "./text-shimmer.js";

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
  _solidRenderEffect(() => {
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

  _solidRenderEffect(() => {
    const active = isActive();
    root.dataset.active = active ? "true" : "false";
    root.setAttribute("aria-label", active ? props.activeText : props.doneText);
  });

  return root;
}
