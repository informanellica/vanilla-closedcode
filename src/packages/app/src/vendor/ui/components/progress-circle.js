import { createMemo, createRenderEffect, splitProps } from "../../../lib/reactivity.js";

const SVG_NS = "http://www.w3.org/2000/svg";

// Keys the compiled mergeProps() overrides took precedence over, so matching
// keys in the rest spread must be ignored (classList/class never reach rest
// because splitProps already extracts them).
const OVERRIDDEN = new Set(["width", "height", "viewBox", "fill", "data-component"]);

export function ProgressCircle(props) {
  const [split, rest] = splitProps(props, ["percentage", "size", "strokeWidth", "class", "classList"]);
  const size = () => split.size || 16;
  const strokeWidth = () => split.strokeWidth || 3;
  const viewBoxSize = 16;
  const center = viewBoxSize / 2;
  const radius = () => center - strokeWidth() / 2;
  const circumference = createMemo(() => 2 * Math.PI * (radius() || 0));
  const offset = createMemo(() => {
    const clampedPercentage = Math.max(0, Math.min(100, split.percentage || 0));
    const progress = clampedPercentage / 100;
    return (circumference() || 0) * (1 - progress);
  });

  const svg = document.createElementNS(SVG_NS, "svg");
  const background = document.createElementNS(SVG_NS, "circle");
  const progressEl = document.createElementNS(SVG_NS, "circle");
  background.setAttribute("cx", "8");
  background.setAttribute("cy", "8");
  background.setAttribute("data-slot", "progress-circle-background");
  progressEl.setAttribute("cx", "8");
  progressEl.setAttribute("cy", "8");
  progressEl.setAttribute("data-slot", "progress-circle-progress");
  svg.appendChild(background);
  svg.appendChild(progressEl);

  // Static attributes from the compiled spread overrides.
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("fill", "none");
  svg.setAttribute("data-component", "progress-circle");

  // Mirror the compiled spread(): listeners attached once, everything else
  // re-applied reactively (splitProps keeps rest getters live).
  for (const key in rest) {
    if (/^on[A-Z]/.test(key) && typeof rest[key] === "function") {
      svg.addEventListener(key.slice(2).toLowerCase(), rest[key]);
    }
  }
  createRenderEffect(() => {
    for (const key in rest) {
      if (/^on[A-Z]/.test(key)) continue;
      if (key === "ref" || key === "children" || key === "class" || key === "className") continue;
      if (OVERRIDDEN.has(key)) continue;
      const value = rest[key];
      if (value == null || value === false) svg.removeAttribute(key);
      else svg.setAttribute(key, value === true ? "" : String(value));
    }
  });

  createRenderEffect(() => {
    svg.setAttribute("width", String(size()));
    svg.setAttribute("height", String(size()));
  });

  // Solid's classList toggles whitespace-separated tokens for truthy keys.
  // Nothing else writes the class attribute here, so a full rebuild is
  // equivalent. Empty/falsy keys (class undefined) are skipped like Solid.
  createRenderEffect(() => {
    const classes = {
      ...split.classList,
      [split.class ?? ""]: !!split.class
    };
    const tokens = [];
    for (const key of Object.keys(classes)) {
      if (!key || !classes[key]) continue;
      tokens.push(key);
    }
    if (tokens.length) svg.setAttribute("class", tokens.join(" "));
    else svg.removeAttribute("class");
  });

  createRenderEffect(() => {
    const r = String(radius());
    const sw = String(strokeWidth());
    background.setAttribute("r", r);
    background.setAttribute("stroke-width", sw);
    progressEl.setAttribute("r", r);
    progressEl.setAttribute("stroke-width", sw);
    progressEl.setAttribute("stroke-dasharray", String(circumference() ?? 0));
    progressEl.setAttribute("stroke-dashoffset", String(offset() ?? 0));
  });

  if (typeof rest.ref === "function") rest.ref(svg);
  return svg;
}
