function makeSvg(width, height, paths, attrs = {}) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svg.setAttribute("fill", "none");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  for (const [key, value] of Object.entries(attrs)) {
    svg.setAttribute(key, String(value));
  }
  for (const pathAttrs of paths) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    for (const [key, value] of Object.entries(pathAttrs)) {
      path.setAttribute(key, String(value));
    }
    svg.appendChild(path);
  }
  return svg;
}

function applyClass(el, cls) {
  if (cls) el.classList.add(...String(cls).split(/\s+/).filter(Boolean));
}

const MARK_PATHS = [
  { d: "M12 16H4V8H12V16Z", fill: "var(--icon-weak-base)", "data-slot": "logo-logo-mark-shadow" },
  { d: "M12 4H4V16H12V4ZM16 20H0V0H16V20Z", fill: "var(--icon-strong-base)", "data-slot": "logo-logo-mark-o" }
];

const C_SQUARE = () => makeSvg(16, 20, MARK_PATHS, { "data-component": "logo-mark" });

export const Mark = props => {
  const svg = C_SQUARE();
  applyClass(svg, props.class);
  return svg;
};

export const Splash = props => {
  const svg = C_SQUARE();
  applyClass(svg, props.class);
  if (typeof props.ref === "function") props.ref(svg);
  else if (props.ref && typeof props.ref === "object") props.ref.current = svg;
  return svg;
};

export const Logo = props => {
  const svg = C_SQUARE();
  applyClass(svg, props.class);
  return svg;
};
