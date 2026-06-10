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
const scheme = () => {
  if (typeof document !== "object") return "light";
  if (document.documentElement.dataset.colorScheme === "dark") return "dark";
  return "light";
};
function splitProps(props, keys) {
  const split = {};
  const rest = {};
  for (const key in props) {
    if (keys.includes(key)) split[key] = props[key];
    else rest[key] = props[key];
  }
  return [split, rest];
}
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
