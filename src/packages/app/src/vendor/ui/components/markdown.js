import { useMarked } from "../context/marked.js";
import { useI18n } from "../context/i18n.js";
import DOMPurify from "dompurify";
import morphdom from "morphdom";
import { checksum } from "core/util/encode";
import { createEffect, createRenderEffect, createResource, createSignal, mergeProps, onCleanup, splitProps } from "solid-js";
import { isServer } from "solid-js/web";
import { stream } from "./markdown-stream.js";
const max = 200;
const cache = new Map();
if (typeof window !== "undefined" && DOMPurify.isSupported) {
  DOMPurify.addHook("afterSanitizeAttributes", node => {
    if (!(node instanceof HTMLAnchorElement)) return;
    if (node.target !== "_blank") return;
    const rel = node.getAttribute("rel") ?? "";
    const set = new Set(rel.split(/\s+/).filter(Boolean));
    set.add("noopener");
    set.add("noreferrer");
    node.setAttribute("rel", Array.from(set).join(" "));
  });
}
const config = {
  USE_PROFILES: {
    html: true,
    mathMl: true
  },
  SANITIZE_NAMED_PROPS: true,
  FORBID_TAGS: ["style"],
  FORBID_CONTENTS: ["style", "script"]
};
const iconPaths = {
  copy: '<path d="M6.2513 6.24935V2.91602H17.0846V13.7493H13.7513M13.7513 6.24935V17.0827H2.91797V6.24935H13.7513Z" stroke="currentColor" stroke-linecap="round"/>',
  check: '<path d="M5 11.9657L8.37838 14.7529L15 5.83398" stroke="currentColor" stroke-linecap="square"/>'
};
function sanitize(html) {
  if (!DOMPurify.isSupported) return "";
  return DOMPurify.sanitize(html, config);
}
function escape(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function fallback(markdown) {
  return escape(markdown).replace(/\r\n?/g, "\n").replace(/\n/g, "<br>");
}
const urlPattern = /^https?:\/\/[^\s<>()`"']+$/;
function codeUrl(text) {
  const href = text.trim().replace(/[),.;!?]+$/, "");
  if (!urlPattern.test(href)) return;
  try {
    const url = new URL(href);
    return url.toString();
  } catch {
    return;
  }
}
function createIcon(path, slot) {
  const icon = document.createElement("div");
  icon.setAttribute("data-component", "icon");
  icon.setAttribute("data-size", "small");
  icon.setAttribute("data-slot", slot);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("data-slot", "icon-svg");
  svg.setAttribute("fill", "none");
  svg.setAttribute("viewBox", "0 0 20 20");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = path;
  icon.appendChild(svg);
  return icon;
}
function createCopyButton(labels) {
  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute("data-component", "icon-button");
  button.setAttribute("data-variant", "secondary");
  button.setAttribute("data-size", "small");
  button.setAttribute("data-slot", "markdown-copy-button");
  button.setAttribute("aria-label", labels.copy);
  button.setAttribute("data-tooltip", labels.copy);
  button.appendChild(createIcon(iconPaths.copy, "copy-icon"));
  button.appendChild(createIcon(iconPaths.check, "check-icon"));
  return button;
}
function setCopyState(button, labels, copied) {
  if (copied) {
    button.setAttribute("data-copied", "true");
    button.setAttribute("aria-label", labels.copied);
    button.setAttribute("data-tooltip", labels.copied);
    return;
  }
  button.removeAttribute("data-copied");
  button.setAttribute("aria-label", labels.copy);
  button.setAttribute("data-tooltip", labels.copy);
}
function ensureCodeWrapper(block, labels) {
  const parent = block.parentElement;
  if (!parent) return;
  const wrapped = parent.getAttribute("data-component") === "markdown-code";
  if (!wrapped) {
    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-component", "markdown-code");
    parent.replaceChild(wrapper, block);
    wrapper.appendChild(block);
    wrapper.appendChild(createCopyButton(labels));
    return;
  }
  const buttons = Array.from(parent.querySelectorAll('[data-slot="markdown-copy-button"]')).filter(el => el instanceof HTMLButtonElement);
  if (buttons.length === 0) {
    parent.appendChild(createCopyButton(labels));
    return;
  }
  for (const button of buttons.slice(1)) {
    button.remove();
  }
}
function markCodeLinks(root) {
  const codeNodes = Array.from(root.querySelectorAll(":not(pre) > code"));
  for (const code of codeNodes) {
    const href = codeUrl(code.textContent ?? "");
    const parentLink = code.parentElement instanceof HTMLAnchorElement && code.parentElement.classList.contains("external-link") ? code.parentElement : null;
    if (!href) {
      if (parentLink) parentLink.replaceWith(code);
      continue;
    }
    if (parentLink) {
      parentLink.href = href;
      continue;
    }
    const link = document.createElement("a");
    link.href = href;
    link.className = "external-link";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    code.parentNode?.replaceChild(link, code);
    link.appendChild(code);
  }
}
function decorate(root, labels) {
  const blocks = Array.from(root.querySelectorAll("pre"));
  for (const block of blocks) {
    ensureCodeWrapper(block, labels);
  }
  markCodeLinks(root);
}
function setupCodeCopy(root, getLabels) {
  const timeouts = new Map();
  const updateLabel = button => {
    const labels = getLabels();
    const copied = button.getAttribute("data-copied") === "true";
    setCopyState(button, labels, copied);
  };
  const handleClick = async event => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest('[data-slot="markdown-copy-button"]');
    if (!(button instanceof HTMLButtonElement)) return;
    const code = button.closest('[data-component="markdown-code"]')?.querySelector("code");
    const content = code?.textContent ?? "";
    if (!content) return;
    const clipboard = navigator?.clipboard;
    if (!clipboard) return;
    await clipboard.writeText(content);
    const labels = getLabels();
    setCopyState(button, labels, true);
    const existing = timeouts.get(button);
    if (existing) clearTimeout(existing);
    const timeout = setTimeout(() => setCopyState(button, labels, false), 2000);
    timeouts.set(button, timeout);
  };
  const buttons = Array.from(root.querySelectorAll('[data-slot="markdown-copy-button"]'));
  for (const button of buttons) {
    if (button instanceof HTMLButtonElement) updateLabel(button);
  }
  root.addEventListener("click", handleClick);
  return () => {
    root.removeEventListener("click", handleClick);
    for (const timeout of timeouts.values()) {
      clearTimeout(timeout);
    }
  };
}
function touch(key, value) {
  cache.delete(key);
  cache.set(key, value);
  if (cache.size <= max) return;
  const first = cache.keys().next().value;
  if (!first) return;
  cache.delete(first);
}

// Reactive spread for the root <div>, mirroring the compiled
// spread(el, mergeProps({ classList }, others), false, false): re-run on any
// prop change and diff per key against the previous snapshot. classList merges
// the local classList prop with the single `class` token (matching the
// compiled get classList()). "children" is forwarded through insert(), like the
// compiled spread with skipChildren = false.
function applyClassList(el, value, prev) {
  const prevObj = prev || {};
  const nextObj = value || {};
  for (const name of Object.keys(prevObj)) {
    if (!name || name in nextObj || !prevObj[name]) continue;
    for (const cls of name.trim().split(/\s+/)) {
      if (cls) el.classList.remove(cls);
    }
  }
  for (const name of Object.keys(nextObj)) {
    const on = !!nextObj[name];
    if (!name || on === !!prevObj[name]) continue;
    for (const cls of name.trim().split(/\s+/)) {
      if (cls) el.classList.toggle(cls, on);
    }
  }
  return { ...nextObj };
}
function applyStyle(el, value, prev) {
  if (typeof value === "string") {
    if (value !== prev) el.style.cssText = value;
    return value;
  }
  if (typeof prev === "string") {
    el.style.cssText = "";
    prev = undefined;
  }
  const prevObj = prev || {};
  const nextObj = value || {};
  for (const name of Object.keys(prevObj)) {
    if (!(name in nextObj)) el.style.removeProperty(name);
  }
  for (const name of Object.keys(nextObj)) {
    if (nextObj[name] !== prevObj[name]) el.style.setProperty(name, nextObj[name]);
  }
  return { ...nextObj };
}
function setAttr(el, name, value) {
  if (value == null) el.removeAttribute(name);
  else el.setAttribute(name, value);
}
function assignProp(el, key, value, prev, listeners) {
  if (key === "style") return applyStyle(el, value, prev);
  if (key === "classList") return applyClassList(el, value, prev);
  if (value === prev) return prev;
  if (key === "ref") {
    if (typeof value === "function") value(el);
    return value;
  }
  if (key.startsWith("on") && key.length > 2) {
    const name = key.startsWith("on:") ? key.slice(3) : key.slice(2).toLowerCase();
    const existing = listeners.get(key);
    if (existing) el.removeEventListener(name, existing);
    let handler;
    if (typeof value === "function") handler = value;
    else if (Array.isArray(value)) handler = event => value[0](value[1], event);
    if (handler) {
      el.addEventListener(name, handler);
      listeners.set(key, handler);
    } else {
      listeners.delete(key);
    }
    return value;
  }
  if (key === "class" || key === "className") {
    if (value == null) el.removeAttribute("class");
    else el.className = value;
    return value;
  }
  setAttr(el, key, value);
  return value;
}
function spreadProps(el, props) {
  const prev = {};
  const listeners = new Map();
  createRenderEffect(() => {
    for (const key of Object.keys(prev)) {
      if (key === "children" || key in props) continue;
      assignProp(el, key, null, prev[key], listeners);
      delete prev[key];
    }
    for (const key of Object.keys(props)) {
      if (key === "children") continue;
      prev[key] = assignProp(el, key, props[key], prev[key], listeners);
    }
  });
}
export function Markdown(props) {
  const [local, others] = splitProps(props, ["text", "cacheKey", "streaming", "class", "classList"]);
  const marked = useMarked();
  const i18n = useI18n();
  const [root, setRoot] = createSignal();
  const [html] = createResource(() => ({
    text: local.text,
    key: local.cacheKey,
    streaming: local.streaming ?? false
  }), async src => {
    if (isServer) return fallback(src.text);
    if (!src.text) return "";
    const base = src.key ?? checksum(src.text);
    return Promise.all(stream(src.text, src.streaming).map(async (block, index) => {
      const hash = checksum(block.raw);
      const key = base ? `${base}:${index}:${block.mode}` : hash;
      if (key && hash) {
        const cached = cache.get(key);
        if (cached && cached.hash === hash) {
          touch(key, cached);
          return cached.html;
        }
      }
      const next = await Promise.resolve(marked.parse(block.src));
      const safe = sanitize(next);
      if (key && hash) touch(key, {
        hash,
        html: safe
      });
      return safe;
    })).then(list => list.join("")).catch(() => fallback(src.text));
  }, {
    initialValue: fallback(local.text)
  });
  let copyCleanup;
  createEffect(() => {
    const container = root();
    const content = local.text ? html.latest ?? html() ?? "" : "";
    if (!container) return;
    if (isServer) return;
    if (!content) {
      container.innerHTML = "";
      return;
    }
    const labels = {
      copy: i18n.t("ui.message.copy"),
      copied: i18n.t("ui.message.copied")
    };
    const temp = document.createElement("div");
    temp.innerHTML = content;
    decorate(temp, labels);
    morphdom(container, temp, {
      childrenOnly: true,
      onBeforeElUpdated: (fromEl, toEl) => {
        if (fromEl instanceof HTMLButtonElement && toEl instanceof HTMLButtonElement && fromEl.getAttribute("data-slot") === "markdown-copy-button" && toEl.getAttribute("data-slot") === "markdown-copy-button" && fromEl.getAttribute("data-copied") === "true") {
          setCopyState(toEl, labels, true);
        }
        if (fromEl.isEqualNode(toEl)) return false;
        return true;
      }
    });
    if (!copyCleanup) copyCleanup = setupCodeCopy(container, () => ({
      copy: i18n.t("ui.message.copy"),
      copied: i18n.t("ui.message.copied")
    }));
  });
  onCleanup(() => {
    if (copyCleanup) copyCleanup();
  });

  // Static skeleton: <div data-component=markdown>. The original used a solid
  // template + use(setRoot, el) ref + reactive spread; reproduce both here.
  const el = document.createElement("div");
  el.setAttribute("data-component", "markdown");
  setRoot(el);
  spreadProps(el, mergeProps({
    get classList() {
      return {
        ...local.classList,
        [local.class ?? ""]: !!local.class
      };
    }
  }, others));
  return el;
}
