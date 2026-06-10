import { insert as _solidInsert } from "solid-js/web";
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

function appendChildren(parent, children) {
  if (children == null || children === false) return;
  if (Array.isArray(children)) {
    for (const child of children) appendChildren(parent, child);
    return;
  }
  if (children instanceof Node) {
    parent.appendChild(children);
    return;
  }
  if (typeof children === "function") {
    // Reactive child (Solid Show/For/components return accessors): let
    // solid-js/web insert() track it so updates re-render instead of freezing.
    _solidInsert(parent, children);
    return;
  }
  parent.appendChild(document.createTextNode(String(children)));
}

function createTextSpan(slot, text, active, offset = 0) {
  const el = document.createElement("span");
  el.setAttribute("data-slot", slot);
  appendChildren(el, TextShimmer({ text, active, offset }));
  return el;
}

export function ToolStatusTitle(props) {
  const split = common(props.activeText, props.doneText);
  const suffix = (props.split ?? true) && split.prefix.length >= 2 && split.active.length > 0 && split.done.length > 0;
  const prefixLen = Array.from(split.prefix).length;
  const activeTail = suffix ? split.active : props.activeText;
  const doneTail = suffix ? split.done : props.doneText;

  const root = document.createElement("span");
  root.setAttribute("data-component", "tool-status-title");
  root.dataset.active = props.active ? "true" : "false";
  root.dataset.ready = "true";
  root.dataset.mode = suffix ? "suffix" : "swap";
  if (props.class) root.classList.add(...String(props.class).split(/\s+/).filter(Boolean));
  root.setAttribute("aria-label", props.active ? props.activeText : props.doneText);
  root.style.display = "inline-grid";
  root.style.alignItems = "baseline";
  root.style.whiteSpace = "nowrap";

  if (suffix) {
    const prefixEl = document.createElement("span");
    prefixEl.setAttribute("data-slot", "tool-status-suffix");
    prefixEl.style.display = "inline-grid";
    prefixEl.style.gridTemplateColumns = "auto";

    const prefix = document.createElement("span");
    prefix.setAttribute("data-slot", "tool-status-prefix");
    appendChildren(prefix, TextShimmer({ text: split.prefix, active: props.active, offset: 0 }));
    prefixEl.appendChild(prefix);

    const tail = document.createElement("span");
    tail.setAttribute("data-slot", "tool-status-tail");
    tail.style.display = "inline-grid";
    tail.style.gridTemplateColumns = "auto";
    tail.appendChild(createTextSpan("tool-status-active", activeTail, props.active, prefixLen));
    tail.appendChild(createTextSpan("tool-status-done", doneTail, false, prefixLen));
    prefixEl.appendChild(tail);
    root.appendChild(prefixEl);
    return root;
  }

  const swap = document.createElement("span");
  swap.setAttribute("data-slot", "tool-status-swap");
  swap.style.display = "inline-grid";
  swap.style.gridTemplateColumns = "auto";
  swap.appendChild(createTextSpan("tool-status-active", activeTail, props.active, 0));
  swap.appendChild(createTextSpan("tool-status-done", doneTail, false, 0));
  root.appendChild(swap);
  return root;
}
