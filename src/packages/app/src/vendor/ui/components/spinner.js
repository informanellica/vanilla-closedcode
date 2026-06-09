const outerIndices = new Set([1, 2, 4, 7, 8, 11, 13, 14]);
const cornerIndices = new Set([0, 3, 12, 15]);
const squares = Array.from({ length: 16 }, (_, i) => ({
  id: i,
  x: (i % 4) * 4,
  y: Math.floor(i / 4) * 4,
  delay: Math.random() * 1.5,
  duration: 1 + Math.random(),
  outer: outerIndices.has(i),
  corner: cornerIndices.has(i)
}));

function splitProps(props, keys) {
  const split = {};
  const rest = {};
  for (const key in props) {
    if (keys.includes(key)) {
      split[key] = props[key];
    } else {
      rest[key] = props[key];
    }
  }
  return [split, rest];
}

function applyClassList(el, classList) {
  if (!classList) return;
  for (const cls in classList) {
    if (!cls) continue;
    if (classList[cls]) el.classList.add(cls);
    else el.classList.remove(cls);
  }
}

function applyRestProps(el, rest) {
  for (const key in rest) {
    if (key === "class" || key === "classList" || key === "children") continue;
    const value = rest[key];
    if (key.startsWith("on") && typeof value === "function") {
      el[key.toLowerCase()] = value;
      continue;
    }
    if (value === undefined) continue;
    if (key in el && !key.includes("-")) {
      try {
        el[key] = value;
        continue;
      } catch {
        // fallback to attribute
      }
    }
    if (value === false || value === null) {
      el.removeAttribute(key);
    } else {
      el.setAttribute(key, String(value));
    }
  }
}

function createSvg(tag, attrs = {}) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, String(value));
  }
  return el;
}

export function Spinner(props) {
  const [split, rest] = splitProps(props, ["class", "classList"]);
  const svg = createSvg("svg", {
    viewBox: "0 0 15 15",
    fill: "currentColor",
    "data-component": "spinner"
  });

  if (split.class) svg.classList.add(...String(split.class).split(/\s+/).filter(Boolean));
  applyClassList(svg, split.classList);
  applyRestProps(svg, rest);

  for (const square of squares) {
    const rect = createSvg("rect", {
      width: 3,
      height: 3,
      rx: 1,
      x: square.x,
      y: square.y
    });
    if (square.corner) {
      rect.style.opacity = "0";
    } else {
      rect.style.animation = `${square.outer ? "pulse-opacity-dim" : "pulse-opacity"} ${square.duration}s ease-in-out infinite`;
      rect.style.animationDelay = `${square.delay}s`;
      rect.style.animationFillMode = "both";
    }
    svg.appendChild(rect);
  }

  return svg;
}
