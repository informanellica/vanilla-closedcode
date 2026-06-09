import androidStudio from "../assets/icons/app/android-studio.svg";
import antigravity from "../assets/icons/app/antigravity.svg";
import cursor from "../assets/icons/app/cursor.svg";
import fileExplorer from "../assets/icons/app/file-explorer.svg";
import finder from "../assets/icons/app/finder.png";
import ghostty from "../assets/icons/app/ghostty.svg";
import iterm2 from "../assets/icons/app/iterm2.svg";
import powershell from "../assets/icons/app/powershell.svg";
import terminal from "../assets/icons/app/terminal.png";
import textmate from "../assets/icons/app/textmate.png";
import vscode from "../assets/icons/app/vscode.svg";
import warp from "../assets/icons/app/warp.png";
import xcode from "../assets/icons/app/xcode.png";
import zed from "../assets/icons/app/zed.svg";
import zedDark from "../assets/icons/app/zed-dark.svg";
import sublimetext from "../assets/icons/app/sublimetext.svg";
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
    if (classList[cls]) el.classList.add(cls);
    else el.classList.remove(cls);
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
