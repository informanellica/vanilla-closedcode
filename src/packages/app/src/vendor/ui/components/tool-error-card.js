/** @file Collapsible error card for a failed tool invocation: shows a localized tool name, derived subtitle/body parsed from the error text, and a copy-to-clipboard control. */
import { createComponent, createMemo, createRenderEffect, createRoot, onCleanup, splitProps } from "../../../lib/reactivity.js";
import { createStore } from "../../../lib/store.js";
import { Card, CardDescription } from "./card.js";
import { Collapsible } from "./collapsible.js";
import { Icon } from "./icon.js";
import { IconButton } from "./icon-button.js";
import { Tooltip } from "./tooltip.js";
import { useI18n } from "../context/i18n.js";

/**
 * Collapsible card that displays a tool error. The header shows a localized tool
 * name plus a subtitle derived from the error message (optionally a clickable
 * subagent link when an href is supplied); the expanded body shows the cleaned
 * error detail and a copy button. State (open/copied) is held in a local store.
 * @param {Object} props - Component props (extra props pass through to the Card).
 * @param {string} props.tool - Tool identifier used to resolve a localized display name.
 * @param {string} props.error - Raw error message text; parsed into subtitle and body.
 * @param {boolean} props.defaultOpen - Whether the card starts expanded.
 * @param {string} props.subtitle - Optional explicit subtitle overriding the parsed one.
 * @param {string} props.href - Optional link target; when set with a subtitle, renders the subtitle as an anchor.
 * @returns {HTMLElement} The Card root element.
 */
export function ToolErrorCard(props) {
  const i18n = useI18n();
  const [state, setState] = createStore({
    open: props.defaultOpen ?? false,
    copied: false
  });
  const open = () => state.open;
  const copied = () => state.copied;
  const [split, rest] = splitProps(props, ["tool", "error", "defaultOpen", "subtitle", "href"]);
  const name = createMemo(() => {
    const map = {
      read: "ui.tool.read",
      list: "ui.tool.list",
      glob: "ui.tool.glob",
      grep: "ui.tool.grep",
      task: "ui.tool.task",
      webfetch: "ui.tool.webfetch",
      websearch: "ui.tool.websearch",
      bash: "ui.tool.shell",
      apply_patch: "ui.tool.patch",
      question: "ui.tool.questions"
    };
    const key = map[split.tool];
    if (!key) return split.tool;
    if (!key.includes(".")) return key;
    return i18n.t(key);
  });
  const cleaned = createMemo(() => split.error.replace(/^Error:\s*/, "").trim());
  const tail = createMemo(() => {
    const value = cleaned();
    const prefix = `${split.tool} `;
    if (value.startsWith(prefix)) return value.slice(prefix.length);
    return value;
  });
  const subtitle = createMemo(() => {
    if (split.subtitle) return split.subtitle;
    const parts = tail().split(": ");
    if (parts.length <= 1) return i18n.t("ui.toolErrorCard.failed");
    const head = (parts[0] ?? "").trim();
    if (!head) return i18n.t("ui.toolErrorCard.failed");
    return head[0] ? head[0].toUpperCase() + head.slice(1) : i18n.t("ui.toolErrorCard.failed");
  });
  const body = createMemo(() => {
    const parts = tail().split(": ");
    if (parts.length <= 1) return cleaned();
    return parts.slice(1).join(": ").trim() || cleaned();
  });
  /**
   * Copy the cleaned error text to the clipboard and flash the "copied" state
   * for two seconds.
   * @returns {Promise<void>} Resolves once the clipboard write completes.
   */
  const copy = async () => {
    const text = cleaned();
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setState("copied", true);
    setTimeout(() => setState("copied", false), 2000);
  };

  // ---- Collapsible.Trigger content ----
  // Static skeleton mirroring the compiled _tmpl$2:
  //   <div data-component=tool-trigger>
  //     <div data-slot=basic-tool-tool-trigger-content>
  //       <span data-slot=basic-tool-tool-indicator data-component=tool-error-card-icon></span>
  //       <div data-slot=basic-tool-tool-info>
  //         <div data-slot=basic-tool-tool-info-structured>
  //           <div data-slot=basic-tool-tool-info-main>
  //             <span data-slot=basic-tool-tool-title></span>
  /**
   * Build the Collapsible trigger subtree: the error icon, the live tool title,
   * a reactively-mounted subtitle (anchor when an href + subtitle exist, else a
   * plain span), and the collapsible arrow.
   * @returns {HTMLElement} The trigger `<div>` element.
   */
  const triggerContent = () => {
    const trigger = document.createElement("div");
    trigger.setAttribute("data-component", "tool-trigger");
    const content = document.createElement("div");
    content.setAttribute("data-slot", "basic-tool-tool-trigger-content");
    const indicator = document.createElement("span");
    indicator.setAttribute("data-slot", "basic-tool-tool-indicator");
    indicator.setAttribute("data-component", "tool-error-card-icon");
    const info = document.createElement("div");
    info.setAttribute("data-slot", "basic-tool-tool-info");
    const structured = document.createElement("div");
    structured.setAttribute("data-slot", "basic-tool-tool-info-structured");
    const main = document.createElement("div");
    main.setAttribute("data-slot", "basic-tool-tool-info-main");
    const title = document.createElement("span");
    title.setAttribute("data-slot", "basic-tool-tool-title");

    trigger.appendChild(content);
    content.appendChild(indicator);
    content.appendChild(info);
    info.appendChild(structured);
    structured.appendChild(main);
    main.appendChild(title);

    // <Icon name="circle-ban-sign" size="small" style={{ "stroke-width": 1.5 }}/>
    indicator.appendChild(createComponent(Icon, {
      name: "circle-ban-sign",
      size: "small",
      style: {
        "stroke-width": 1.5
      }
    }));

    // Live tool title text (compiled inserted `name` into the title span).
    let prevName;
    createRenderEffect(() => {
      const next = name();
      const text = next == null ? "" : String(next);
      if (text !== prevName) title.textContent = prevName = text;
    });

    // Hand-rolled <Show when={!!split.href && split.subtitle}> with a fallback,
    // inserted into `main` after the title (mirrors the compiled insert of the
    // Show into the info-main div):
    //   when  -> <a data-slot=basic-tool-tool-subtitle class="clickable subagent-link" href=…>
    //   else  -> <span data-slot=basic-tool-tool-subtitle>
    // Both render the live `subtitle` memo as text. The branch is re-evaluated
    // reactively; a flip remounts the correct node in its own reactive root so
    // the previous branch's effects dispose, matching solid's <Show>.
    /**
     * Build the subtitle as a clickable subagent link with a live text and
     * href, stopping click propagation so it doesn't toggle the collapsible.
     * @returns {HTMLAnchorElement} The subtitle anchor element.
     */
    const buildSubtitleLink = () => {
      const a = document.createElement("a");
      a.setAttribute("data-slot", "basic-tool-tool-subtitle");
      a.className = "clickable subagent-link";
      a.addEventListener("click", e => e.stopPropagation());
      let prevText;
      createRenderEffect(() => {
        const next = subtitle();
        const text = next == null ? "" : String(next);
        if (text !== prevText) a.textContent = prevText = text;
      });
      // Live href attribute (compiled set it via an effect on split.href).
      let prevHref;
      createRenderEffect(() => {
        const next = split.href;
        if (next !== prevHref) {
          prevHref = next;
          if (next == null || next === false) a.removeAttribute("href");
          else a.setAttribute("href", String(next));
        }
      });
      return a;
    };
    /**
     * Build the subtitle as a plain span with live text (used when there is no
     * href or no subtitle to link).
     * @returns {HTMLElement} The subtitle `<span>` element.
     */
    const buildSubtitleSpan = () => {
      const span = document.createElement("span");
      span.setAttribute("data-slot", "basic-tool-tool-subtitle");
      let prevText;
      createRenderEffect(() => {
        const next = subtitle();
        const text = next == null ? "" : String(next);
        if (text !== prevText) span.textContent = prevText = text;
      });
      return span;
    };
    let subtitleNode = null;
    let subtitleDispose = null;
    let prevWhen;
    createRenderEffect(() => {
      const when = !!split.href && !!split.subtitle;
      if (when === prevWhen) return;
      prevWhen = when;
      if (subtitleNode) {
        subtitleNode.remove();
        subtitleNode = null;
      }
      if (subtitleDispose) {
        subtitleDispose();
        subtitleDispose = null;
      }
      subtitleNode = createRoot(dispose => {
        subtitleDispose = dispose;
        return when ? buildSubtitleLink() : buildSubtitleSpan();
      });
      main.appendChild(subtitleNode);
    });
    onCleanup(() => {
      if (subtitleDispose) subtitleDispose();
    });

    // Arrow appended after the content block (compiled inserted it last).
    trigger.appendChild(createComponent(Collapsible.Arrow, {}));
    return trigger;
  };

  // ---- Collapsible.Content ----
  // Static skeleton mirroring _tmpl$4 (<div data-slot=tool-error-card-content>).
  /**
   * Build the Collapsible content subtree: a copy-button block that mounts only
   * while the card is open, followed by a CardDescription that mounts only while
   * there is body text. Both are kept in order via comment anchors and live in
   * their own reactive roots so unmounting disposes their inner effects.
   * @returns {HTMLElement} The content `<div>` element.
   */
  const collapsibleContent = () => {
    const contentEl = document.createElement("div");
    contentEl.setAttribute("data-slot", "tool-error-card-content");

    // Two comment anchors keep the dynamic children as direct descendants of
    // tool-error-card-content in the original order (copy block, then the
    // description), exactly like the compiled inserts into the content div.
    const copyAnchor = document.createComment("");
    const descAnchor = document.createComment("");
    contentEl.appendChild(copyAnchor);
    contentEl.appendChild(descAnchor);

    // <Show when={open()}>: the copy button only mounts while open. Each mount
    // builds a fresh subtree inside its own reactive root so unmount disposes
    // the inner effects (icon/aria-label mirrors), matching solid's <Show>.
    let copyNode = null;
    let copyDispose = null;
    /**
     * Build the copy-button block: a tooltip-wrapped IconButton whose icon and
     * aria-label reflect the current copied state and that copies the error on
     * click.
     * @returns {HTMLElement} The copy wrapper `<div>` element.
     */
    const buildCopy = () => {
      // <div data-slot=tool-error-card-copy>
      const copyWrap = document.createElement("div");
      copyWrap.setAttribute("data-slot", "tool-error-card-copy");
      copyWrap.appendChild(createComponent(Tooltip, {
        get value() {
          return copied() ? i18n.t("ui.message.copied") : i18n.t("ui.toolErrorCard.copyError");
        },
        placement: "top",
        gutter: 4,
        get children() {
          // IconButton with a reactive icon + aria-label. The vendor IconButton
          // reads those eagerly, so build it once and mirror them via guarded
          // render effects on the returned node.
          const button = createComponent(IconButton, {
            icon: copied() ? "check" : "copy",
            size: "normal",
            variant: "ghost",
            onMouseDown: e => e.preventDefault(),
            onClick: e => {
              e.stopPropagation();
              void copy();
            }
          });
          let prevIcon;
          createRenderEffect(() => {
            const next = copied() ? "check" : "copy";
            if (next !== prevIcon) {
              prevIcon = next;
              const old = button.querySelector('[data-component="icon"]');
              if (old) old.remove();
              button.dataset.icon = next;
              button.insertBefore(Icon({ name: next, size: "small" }), button.firstChild);
            }
          });
          let prevLabel;
          createRenderEffect(() => {
            const next = copied() ? i18n.t("ui.message.copied") : i18n.t("ui.toolErrorCard.copyError");
            if (next !== prevLabel) button.setAttribute("aria-label", prevLabel = next);
          });
          return button;
        }
      }));
      return copyWrap;
    };
    let prevOpen;
    createRenderEffect(() => {
      const isOpen = open();
      if (isOpen === prevOpen) return;
      prevOpen = isOpen;
      if (copyNode) {
        copyNode.remove();
        copyNode = null;
      }
      if (copyDispose) {
        copyDispose();
        copyDispose = null;
      }
      if (isOpen) {
        copyNode = createRoot(dispose => {
          copyDispose = dispose;
          return buildCopy();
        });
        contentEl.insertBefore(copyNode, copyAnchor);
      }
    });
    onCleanup(() => {
      if (copyDispose) copyDispose();
    });

    // <Show when={body()}>{value => <CardDescription>{value()}</CardDescription>}</Show>
    // body() is a non-empty string or falsy. The CardDescription mounts only
    // while body() is truthy, remounting when the truthiness flips. While shown,
    // the description text stays live: a function child is routed through the
    // vanilla CardDescription's reactive insert (mirroring the `value()` render
    // prop accessor). The subtree lives in its own root so unmount disposes it.
    let descNode = null;
    let descDispose = null;
    let prevHasBody;
    createRenderEffect(() => {
      const hasBody = !!body();
      if (hasBody === prevHasBody) return;
      prevHasBody = hasBody;
      if (descNode) {
        descNode.remove();
        descNode = null;
      }
      if (descDispose) {
        descDispose();
        descDispose = null;
      }
      if (hasBody) {
        descNode = createRoot(dispose => {
          descDispose = dispose;
          return createComponent(CardDescription, {
            children: () => body()
          });
        });
        contentEl.insertBefore(descNode, descAnchor);
      }
    });
    onCleanup(() => {
      if (descDispose) descDispose();
    });

    return contentEl;
  };

  // Build the Card. `data-open` is a reactive attribute the vanilla Card freezes,
  // so mirror it via a guarded render effect on the returned node.
  const cardNode = createComponent(Card, {
    ...rest,
    "data-kind": "tool-error-card",
    "data-open": open() ? "true" : "false",
    variant: "error",
    get children() {
      return createComponent(Collapsible, {
        "class": "tool-collapsible",
        get ["data-open"]() {
          return open() ? "true" : "false";
        },
        get open() {
          return open();
        },
        onOpenChange: value => setState("open", value),
        get children() {
          return [
            createComponent(Collapsible.Trigger, {
              get children() {
                return triggerContent();
              }
            }),
            createComponent(Collapsible.Content, {
              get children() {
                return collapsibleContent();
              }
            })
          ];
        }
      });
    }
  });
  let prevCardOpen;
  createRenderEffect(() => {
    const next = open() ? "true" : "false";
    if (next !== prevCardOpen) cardNode.setAttribute("data-open", prevCardOpen = next);
  });
  return cardNode;
}
