import { createEffect, createMemo } from "solid-js";

// Resolve Solid-style children: call zero-argument function children until
// they yield values and flatten nested arrays (same contract as the compiled
// insert() from solid-js/web). Functions that take arguments are render
// props and must be passed through untouched.
const resolveChildren = value => {
  if (typeof value === "function" && !value.length) return resolveChildren(value());
  if (Array.isArray(value)) {
    const out = [];
    for (const item of value) {
      const resolved = resolveChildren(item);
      if (Array.isArray(resolved)) out.push(...resolved);
      else out.push(resolved);
    }
    return out;
  }
  return value;
};

export const SettingsList = props => {
  const el = document.createElement("div");
  el.className = "d-flex flex-column gap-3";

  // The first memo evaluates the children getter exactly once per dependency
  // change so component creation inside it (e.g. a For) is not re-run when
  // only the nested reactive children (For's internal memo) update; the
  // second memo tracks those nested functions and re-resolves the node list.
  const raw = createMemo(() => props.children);
  const resolved = createMemo(() => resolveChildren(raw()));

  createEffect(() => {
    const value = resolved();
    const nodes = (Array.isArray(value) ? value : [value]).filter(
      child => child != null && typeof child !== "boolean"
    );
    el.replaceChildren(...nodes);
  });

  return el;
};
