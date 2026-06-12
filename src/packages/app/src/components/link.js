import { createRenderEffect as _solidRenderEffect, splitProps } from "solid-js";
import { insert as _solidInsert } from "solid-js/web";
import { usePlatform } from "@/context/platform.js";

// Assign one forwarded (rest) prop onto the anchor, mirroring Solid's spread
// semantics for the prop shapes Link callers use: style objects, classList
// maps, on* event handlers, class/className, and plain attributes (tabIndex
// et al. — setAttribute lowercases them, matching the compiled output).
function assignProp(el, key, value, prev) {
  if (key === "style") {
    if (value && typeof value === "object") Object.assign(el.style, value);
    else if (value == null) el.removeAttribute("style");
    else el.style.cssText = value;
    return;
  }
  if (key === "classList") {
    if (value && typeof value === "object") {
      for (const cls in value) {
        const names = cls.split(/\s+/).filter(Boolean);
        if (value[cls]) el.classList.add(...names);
        else el.classList.remove(...names);
      }
    }
    return;
  }
  if (key.slice(0, 2) === "on" && (typeof value === "function" || typeof prev === "function")) {
    const name = key.slice(2).toLowerCase();
    if (typeof prev === "function") el.removeEventListener(name, prev);
    if (typeof value === "function") el.addEventListener(name, value);
    return;
  }
  if (key === "class" || key === "className") {
    el.className = value ?? "";
    return;
  }
  if (value == null || value === false) el.removeAttribute(key);
  else el.setAttribute(key, value === true ? "" : value);
}

export function Link(props) {
  const platform = usePlatform();
  const [local, rest] = splitProps(props, ["href", "children", "class"]);
  const el = document.createElement("a");

  // Clicks open through the platform layer instead of in-app navigation.
  el.addEventListener("click", event => {
    if (!local.href) return;
    event.preventDefault();
    platform.openLink(local.href);
  });

  // href and class are signal-backed getters at the call sites — bind them in
  // effects so e.g. OAuth URLs arriving later still populate the anchor.
  _solidRenderEffect(() => {
    const href = local.href;
    if (href == null) el.removeAttribute("href");
    else el.setAttribute("href", href);
  });
  _solidRenderEffect(() => {
    el.className = `text-body-emphasis underline ${local.class ?? ""}`;
  });

  // Forwarded ref: Solid's spread invokes function refs with the node.
  _solidRenderEffect(() => {
    if (typeof rest.ref === "function") rest.ref(el);
  });

  // Remaining props spread onto the anchor in a single effect with per-key
  // diffing, like Solid's compiled spread (children/ref handled above).
  const prev = {};
  _solidRenderEffect(() => {
    for (const key in rest) {
      if (key === "ref" || key === "children") continue;
      const value = rest[key];
      if (value === prev[key]) continue;
      assignProp(el, key, value, prev[key]);
      prev[key] = value;
    }
  });

  // children is typically a getter returning a translated label — insert it
  // reactively so the text follows live language switches.
  _solidInsert(el, () => local.children);

  return el;
}
