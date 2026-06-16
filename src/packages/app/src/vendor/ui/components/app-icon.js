/** @file AppIcon component: renders the icon image for a known editor/terminal app id, switching themed variants on color-scheme changes. */
const androidStudio = new URL("../assets/icons/app/android-studio.svg", import.meta.url).href;
const antigravity = new URL("../assets/icons/app/antigravity.svg", import.meta.url).href;
const cursor = new URL("../assets/icons/app/cursor.svg", import.meta.url).href;
const fileExplorer = new URL("../assets/icons/app/file-explorer.svg", import.meta.url).href;
const finder = new URL("../assets/icons/app/finder.png", import.meta.url).href;
const ghostty = new URL("../assets/icons/app/ghostty.svg", import.meta.url).href;
const iterm2 = new URL("../assets/icons/app/iterm2.svg", import.meta.url).href;
const powershell = new URL("../assets/icons/app/powershell.svg", import.meta.url).href;
const terminal = new URL("../assets/icons/app/terminal.png", import.meta.url).href;
const textmate = new URL("../assets/icons/app/textmate.png", import.meta.url).href;
const vscode = new URL("../assets/icons/app/vscode.svg", import.meta.url).href;
const warp = new URL("../assets/icons/app/warp.png", import.meta.url).href;
const xcode = new URL("../assets/icons/app/xcode.png", import.meta.url).href;
const zed = new URL("../assets/icons/app/zed.svg", import.meta.url).href;
const zedDark = new URL("../assets/icons/app/zed-dark.svg", import.meta.url).href;
const sublimetext = new URL("../assets/icons/app/sublimetext.svg", import.meta.url).href;
const icons = {
  vscode,
  cursor,
  zed,
  "file-explorer": fileExplorer,
  finder,
  terminal,
  iterm2,
  ghostty,
  warp,
  xcode,
  "android-studio": androidStudio,
  antigravity,
  textmate,
  powershell,
  "sublime-text": sublimetext
};
const themed = {
  zed: {
    light: zed,
    dark: zedDark
  }
};
/**
 * Read the document's current color scheme from the root element dataset.
 * @returns {string} "dark" when data-color-scheme is "dark", otherwise "light".
 */
const scheme = () => {
  if (typeof document !== "object") return "light";
  if (document.documentElement.dataset.colorScheme === "dark") return "dark";
  return "light";
};
/**
 * Partition a props object into the keys listed and the remaining rest props.
 * @param {Object} props - The props object to split.
 * @param {Array} keys - Property names to pull into the first bag.
 * @returns {Array} A [split, rest] pair of objects.
 */
function splitProps(props, keys) {
  const split = {};
  const rest = {};
  for (const key in props) {
    if (keys.includes(key)) split[key] = props[key];
    else rest[key] = props[key];
  }
  return [split, rest];
}
/**
 * Apply a Solid-style classList map to an element, supporting space-separated
 * multi-class keys (which DOMTokenList.add/remove would otherwise reject).
 * @param {HTMLElement} el - Target element.
 * @param {Object} classList - Map of class name(s) to boolean enabled state.
 * @returns {void}
 */
function applyClassList(el, classList) {
  if (!classList) return;
  for (const cls in classList) {
    if (!cls) continue;
    // Solid's classList contract allows space-separated multi-class keys;
    // DOMTokenList.add/remove reject tokens containing spaces.
    const tokens = cls.split(/\s+/).filter(Boolean);
    if (!tokens.length) continue;
    if (classList[cls]) el.classList.add(...tokens);
    else el.classList.remove(...tokens);
  }
}
/**
 * Apply leftover props to an element: bind `on*` handlers, set matching DOM
 * properties when possible, and otherwise reflect/remove attributes.
 * @param {HTMLElement} el - Target element.
 * @param {Object} rest - The rest-props bag (class/classList already handled by the caller).
 * @returns {void}
 */
function applyRestProps(el, rest) {
  for (const key in rest) {
    if (key === "class" || key === "classList") continue;
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
        // fallback
      }
    }
    if (value === false || value === null) el.removeAttribute(key);
    else el.setAttribute(key, String(value));
  }
}
/**
 * Render an <img> for a known app id, picking the theme-appropriate icon source and
 * updating it when the document color scheme changes.
 * @param {Object} props - Component props.
 * @param {string} props.id - The app id (e.g. "vscode", "zed") whose icon to render.
 * @param {string} props.class - Optional class name(s) for the image.
 * @param {Object} props.classList - Optional Solid-style classList map.
 * @param {string} props.alt - Alt text for the image (defaults to empty).
 * @param {boolean} props.draggable - Whether the image is draggable (defaults to false).
 * @returns {HTMLElement} The icon <img> element.
 */
export const AppIcon = props => {
  const [local, rest] = splitProps(props, ["id", "class", "classList", "alt", "draggable"]);
  const img = document.createElement("img");
  let mode = scheme();
  const update = () => {
    mode = scheme();
    img.src = themed[local.id]?.[mode] ?? icons[local.id] ?? "";
  };
  const observer = new MutationObserver(update);
  if (typeof document === "object") {
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-color-scheme"]
    });
  }
  img.setAttribute("data-component", "app-icon");
  img.alt = local.alt ?? "";
  img.draggable = local.draggable ?? false;
  if (local.class) img.classList.add(...String(local.class).split(/\s+/).filter(Boolean));
  applyClassList(img, local.classList);
  applyRestProps(img, rest);
  update();
  queueMicrotask(() => {
    if (img.isConnected) return;
    observer.disconnect();
  });
  return img;
};
