import { insert as _solidInsert } from "solid-js/web";
import { createComponent, createRenderEffect, createRoot, createUniqueId, getOwner, onCleanup, runWithOwner, splitProps } from "solid-js";
import { createStore } from "solid-js/store";
import { makeEventListener } from "../../../lib/primitives/event-listener.js";
import { useI18n } from "../context/i18n.js";
import { IconButton } from "./icon-button.js";
import { autoPosition } from "./_floating.js";

// Build a detached element from compact HTML (no inter-element whitespace,
// matching the compiled Solid templates).
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  return wrapper.firstElementChild;
}

// Apply a Solid-style style prop (string or object) onto an element without
// clobbering inline styles already set.
function applyStyle(el, style) {
  if (!style) return;
  if (typeof style === "string") {
    const existing = el.getAttribute("style") ?? "";
    el.setAttribute("style", existing + (existing && !existing.endsWith(";") ? ";" : "") + style);
    return;
  }
  for (const key in style) {
    const value = style[key];
    if (value == null) continue;
    // Solid accepts both kebab and camelCase keys in style objects; setProperty
    // needs CSS property names (kebab-case). Custom properties (--x) pass through.
    const prop = key.startsWith("--") ? key : key.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
    el.style.setProperty(prop, String(value));
  }
}

// Apply a Solid-style classList ({ "a b": true, c: false }) onto an element.
function applyClassList(el, classList) {
  if (!classList) return;
  for (const cls in classList) {
    if (!cls) continue;
    const tokens = cls.split(/\s+/).filter(Boolean);
    if (!tokens.length) continue;
    if (classList[cls]) el.classList.add(...tokens);
    else el.classList.remove(...tokens);
  }
}

export function Popover(props) {
  const i18n = useI18n();
  const owner = getOwner();
  const id = createUniqueId();
  const [local, rest] = splitProps(props, [
    "trigger", "triggerAs", "triggerProps", "title", "description", "class", "classList",
    "style", "children", "portal", "open", "defaultOpen", "onOpenChange", "modal",
    "placement", "gutter", "shift", "anchorRef", "onDismiss", "noAutoFocus", "contentProps"
  ]);
  const [state, setState] = createStore({
    contentRef: undefined,
    triggerRef: undefined,
    dismiss: null,
    uncontrolledOpen: local.defaultOpen ?? false
  });

  const controlled = () => local.open !== undefined;
  const opened = () => {
    if (controlled()) return local.open ?? false;
    return state.uncontrolledOpen;
  };
  const onOpenChange = (next) => {
    if (next) setState("dismiss", null);
    if (local.onOpenChange) local.onOpenChange(next);
    if (controlled()) return;
    setState("uncontrolledOpen", next);
  };

  // ----- Trigger -----
  // Anchor-only mode: when `anchorRef` is supplied and there's no own trigger,
  // the popover renders no trigger element (it positions against an external
  // anchor, e.g. a sibling dropdown button) and returns a comment placeholder.
  const anchorMode = !!local.anchorRef && local.trigger == null && local.triggerAs == null && local.triggerProps == null;
  const anchorEl = () => local.anchorRef?.() ?? state.triggerRef;

  // `triggerAs` may be a tag name (default "div") or a component (e.g. Button).
  const triggerAs = local.triggerAs ?? "div";
  let triggerEl = null;
  if (!anchorMode) {
    if (typeof triggerAs === "function") {
      // Component `as`: invoke with the trigger props + the trigger content as
      // children, and use the returned element as the trigger node. A `style`
      // object is post-applied onto the produced element — Kobalte used to
      // handle object styles for the polymorphic `as`; our leaf components
      // (Button) only stringify attributes, so applying it here keeps inline
      // styles intact.
      const tp = local.triggerProps ?? {};
      const { style: _ignoredStyle, ...passthrough } = tp;
      const produced = triggerAs({
        ...passthrough,
        get children() {
          return local.trigger;
        }
      });
      triggerEl = produced instanceof Node ? produced : document.createElement("div");
      // The trigger style can be animation-driven (e.g. the prompt-input model
      // button's spring), so re-read and re-apply it reactively rather than
      // freezing the first value.
      createRenderEffect(() => applyStyle(triggerEl, local.triggerProps?.style));
    } else {
      triggerEl = document.createElement(triggerAs);
      if (local.triggerProps) applyTriggerProps(triggerEl, local.triggerProps);
      appendTrigger(triggerEl, local.trigger);
    }
    triggerEl.setAttribute("data-slot", "popover-trigger");
    triggerEl.setAttribute("aria-haspopup", "dialog");
    triggerEl.setAttribute("aria-controls", id);
    setState("triggerRef", triggerEl);
    createRenderEffect(() => {
      triggerEl.setAttribute("aria-expanded", opened() ? "true" : "false");
    });
    triggerEl.addEventListener("click", (event) => {
      if (event.defaultPrevented) return;
      onOpenChange(!opened());
    });
  }

  function applyTriggerProps(el, tp) {
    for (const key in tp) {
      if (key === "children") continue;
      const value = tp[key];
      if (key === "class") {
        if (value) el.classList.add(...String(value).split(/\s+/).filter(Boolean));
        continue;
      }
      if (key === "classList") {
        applyClassList(el, value);
        continue;
      }
      if (key === "style") {
        applyStyle(el, value);
        continue;
      }
      if (key.startsWith("on") && typeof value === "function") {
        el.addEventListener(key.slice(2).toLowerCase(), value);
        continue;
      }
      if (value == null || value === false) continue;
      el.setAttribute(key, value === true ? "" : String(value));
    }
  }
  function appendTrigger(el, content) {
    if (content == null) return;
    if (content instanceof Node) {
      el.appendChild(content);
    } else if (typeof content === "string") {
      el.textContent = content;
    } else {
      _solidInsert(el, () => local.trigger);
    }
  }

  // ----- Content -----
  const buildContent = () => {
    const contentEl = document.createElement("div");
    contentEl.setAttribute("data-component", "popover-content");
    contentEl.setAttribute("role", "dialog");
    contentEl.id = id;
    contentEl.tabIndex = -1;
    contentEl.style.position = "fixed";
    if (local.class) contentEl.classList.add(...String(local.class).split(/\s+/).filter(Boolean));
    createRenderEffect(() => applyClassList(contentEl, local.classList));
    applyStyle(contentEl, local.style);
    // Extra static attributes/styles for the content node (data-*, inline
    // style, etc.). Style merges; everything else is set as an attribute.
    if (local.contentProps) {
      for (const key in local.contentProps) {
        const value = local.contentProps[key];
        if (key === "style") {
          applyStyle(contentEl, value);
        } else if (value != null && value !== false) {
          contentEl.setAttribute(key, value === true ? "" : String(value));
        }
      }
    }

    // Header (title + close button), only when a title is provided.
    if (local.title != null && local.title !== false) {
      const header = template(`<div data-slot="popover-header"></div>`);
      const titleEl = document.createElement("h2");
      titleEl.setAttribute("data-slot", "popover-title");
      _solidInsert(titleEl, () => local.title);
      header.appendChild(titleEl);
      const closeBtn = IconButton({
        "data-slot": "popover-close-button",
        icon: "close",
        variant: "ghost",
        get ["aria-label"]() {
          return i18n.t("ui.common.close");
        },
        onClick: () => {
          setState("dismiss", "close");
          onOpenChange(false);
        }
      });
      header.appendChild(closeBtn);
      contentEl.appendChild(header);
    }

    // Description.
    if (local.description != null && local.description !== false) {
      const descEl = document.createElement("p");
      descEl.setAttribute("data-slot", "popover-description");
      _solidInsert(descEl, () => local.description);
      contentEl.appendChild(descEl);
    }

    // Body — children may be reactive (an accessor/component), keep live.
    const body = template(`<div data-slot="popover-body"></div>`);
    _solidInsert(body, () => local.children);
    contentEl.appendChild(body);

    return contentEl;
  };

  // ----- Presence: mount/position/dismiss while open -----
  let stopPosition = null;
  let disposeContent = null;
  const usePortal = () => local.portal == null ? true : !!local.portal;

  const inside = (node) => {
    if (!node) return false;
    if (state.contentRef && state.contentRef.contains(node)) return true;
    if (triggerEl && triggerEl.contains(node)) return true;
    // In anchor mode the anchor element acts as the trigger; clicks on it are
    // not "outside" dismissals (its own toggle drives open/close).
    const anchor = anchorEl();
    if (anchor && anchor !== triggerEl && anchor.contains && anchor.contains(node)) return true;
    return false;
  };

  const mountContent = () => {
    if (state.contentRef) return;
    const build = () => createRoot((dispose) => {
      const contentEl = buildContent();
      setState("contentRef", contentEl);
      if (usePortal()) document.body.appendChild(contentEl);
      else (triggerEl?.parentNode ?? document.body).appendChild(contentEl);
      stopPosition = autoPosition(anchorEl(), contentEl, {
        placement: local.placement ?? "bottom",
        gutter: local.gutter ?? 4,
        shift: local.shift
      });

      // Dismissal listeners, attached only while open.
      const close = (reason) => {
        setState("dismiss", reason);
        local.onDismiss?.(reason);
        onOpenChange(false);
      };
      makeEventListener(window, "keydown", (event) => {
        if (event.key !== "Escape") return;
        close("escape");
        event.preventDefault();
        event.stopPropagation();
      }, { capture: true });
      makeEventListener(window, "pointerdown", (event) => {
        const target = event.target;
        if (!(target instanceof Node)) return;
        if (inside(target)) return;
        close("outside");
      }, { capture: true });
      makeEventListener(window, "focusin", (event) => {
        const target = event.target;
        if (!(target instanceof Node)) return;
        if (inside(target)) return;
        close("outside");
      }, { capture: true });

      // Focus the panel on open (Kobalte autofocuses content). Skipped when the
      // caller opts out (noAutoFocus) — some panels manage their own focus
      // (e.g. the model list autofocuses its search input).
      if (!local.noAutoFocus) {
        requestAnimationFrame(() => {
          if (contentEl.isConnected) contentEl.focus({ preventScroll: true });
        });
      }

      disposeContent = dispose;
    });
    if (owner) runWithOwner(owner, build);
    else build();
  };
  const unmountContent = () => {
    if (stopPosition) {
      stopPosition();
      stopPosition = null;
    }
    const el = state.contentRef;
    // Mirror Kobalte onCloseAutoFocus: when dismissed by an outside pointer,
    // do NOT pull focus back to the trigger; otherwise restore it.
    const restoreFocus = state.dismiss !== "outside";
    setState("contentRef", undefined);
    if (disposeContent) {
      disposeContent();
      disposeContent = null;
    }
    if (el) el.remove();
    if (restoreFocus && triggerEl && triggerEl.isConnected) {
      const focusable = typeof triggerEl.focus === "function";
      if (focusable) triggerEl.focus({ preventScroll: true });
    }
    setState("dismiss", null);
  };

  createRenderEffect(() => {
    if (opened()) mountContent();
    else unmountContent();
  });

  if (owner) {
    onCleanup(() => {
      unmountContent();
    });
  }

  // Anchor mode contributes no inline element (content is portaled and
  // positioned against the external anchor); return a comment placeholder so
  // the surrounding insert has a stable node, like Kobalte's anchor-only root.
  return triggerEl ?? document.createComment("popover-anchor");
}
