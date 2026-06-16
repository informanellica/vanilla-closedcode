/** @file BasicTool / GenericTool collapsible components: render a tool-call trigger row with optional animated, lazily-mounted details. */
import { insert } from "../../../lib/reactivity.js";
import { createComponent, createEffect, createMemo, createRenderEffect, For, on, onCleanup } from "../../../lib/reactivity.js";
import { animate } from "motion";
import { useI18n } from "../context/i18n.js";
import { createStore } from "../../../lib/store.js";
import { Collapsible } from "./collapsible.js";
import { TextShimmer } from "./text-shimmer.js";
/**
 * Detects whether a trigger value is a structured title object (vs raw content/Node).
 * @param {*} val - Candidate trigger value.
 * @returns {boolean} True when val is a plain object carrying a `title` field and is not a DOM Node.
 */
const isTriggerTitle = val => {
  return typeof val === "object" && val !== null && "title" in val && (typeof Node === "undefined" || !(val instanceof Node));
};
const SPRING = {
  type: "spring",
  visualDuration: 0.35,
  bounce: 0
};

/**
 * Builds a detached element from a compact HTML string.
 * @param {string} html - HTML markup for a single root element.
 * @returns {Element} The first element child of the parsed markup.
 */
// Build a detached element from compact HTML (no inter-element whitespace,
// matching the compiled Solid templates).
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  return wrapper.firstElementChild;
}

/**
 * Sets or removes an attribute, removing it when the value is nullish.
 * @param {Element} el - Target element.
 * @param {string} name - Attribute name.
 * @param {*} value - Attribute value; null/undefined removes the attribute.
 * @returns {void}
 */
// Mirror solid-js/web setAttribute semantics: nullish removes the attribute.
function setAttr(el, name, value) {
  if (value == null) el.removeAttribute(name);
  else el.setAttribute(name, value);
}

/**
 * Toggles each space-separated class token within a classList key.
 * @param {Element} el - Target element.
 * @param {string} key - One or more whitespace-separated class names.
 * @param {boolean} value - Whether to add (true) or remove (false) the tokens.
 * @returns {void}
 */
// classList keys may hold several space-separated class names; toggle each.
function toggleClassKey(el, key, value) {
  for (const name of key.trim().split(/\s+/)) {
    if (name) el.classList.toggle(name, value);
  }
}

/**
 * Diffs a desired classList map against the previous snapshot, toggling only the changed tokens.
 * @param {Element} el - Target element.
 * @param {Object} value - Desired class map (key to truthy/falsy).
 * @param {Object} prev - Mutable snapshot of the previously-applied class map; updated in place.
 * @returns {Object} The updated `prev` snapshot.
 */
// Mirror solid-js/web classList(): diff `value` against the mutable `prev`
// snapshot, removing classes that turned falsy and adding ones that turned
// truthy. Empty keys (a nullish class prop collapses to "") are skipped.
function applyClassList(el, value, prev) {
  for (const key of Object.keys(prev)) {
    if (!key || key === "undefined" || value[key]) continue;
    toggleClassKey(el, key, false);
    delete prev[key];
  }
  for (const key of Object.keys(value)) {
    const classValue = !!value[key];
    if (!key || key === "undefined" || prev[key] === classValue || !classValue) continue;
    toggleClassKey(el, key, true);
    prev[key] = classValue;
  }
  return prev;
}
/**
 * BasicTool component. Renders a collapsible tool-call panel: a trigger row
 * (structured title with subtitle/args/action, or raw content) plus optional
 * details that can be height-animated and/or lazily mounted while open.
 * @param {Object} props - Component props.
 * @param {boolean} props.defaultOpen - Whether the panel starts open.
 * @param {boolean} props.forceOpen - When true, forces the panel open.
 * @param {boolean} props.defer - Defer rendering the open content until a frame after opening.
 * @param {string} props.status - Tool status; "pending"/"running" mark it busy.
 * @param {boolean} props.animated - Animate the content height on open/close.
 * @param {boolean} props.locked - Prevent closing via the trigger.
 * @param {*} props.trigger - Structured title object or raw trigger content.
 * @param {Function} props.onSubtitleClick - Handler invoked when the subtitle is clicked.
 * @param {Function} props.onTriggerClick - Handler invoked when the trigger is clicked.
 * @param {string} props.triggerHref - When set, renders the trigger as an anchor with this href.
 * @param {boolean} props.hideDetails - Hide the collapsible details and arrow.
 * @param {boolean} props.clickable - Marks the trigger as clickable (data-clickable).
 * @param {*} props.children - Detail content shown when the panel is open.
 * @returns {Node} The Collapsible root node for the tool panel.
 */
export function BasicTool(props) {
  const [state, setState] = createStore({
    open: props.defaultOpen ?? false,
    ready: props.defaultOpen ?? false
  });
  const open = () => state.open;
  const ready = () => state.ready;
  const pending = () => props.status === "pending" || props.status === "running";
  let frame;
  const cancel = () => {
    if (frame === undefined) return;
    cancelAnimationFrame(frame);
    frame = undefined;
  };
  onCleanup(cancel);
  createEffect(() => {
    if (props.forceOpen) setState("open", true);
  });
  createEffect(on(open, value => {
    if (!props.defer) return;
    if (!value) {
      cancel();
      setState("ready", false);
      return;
    }
    cancel();
    frame = requestAnimationFrame(() => {
      frame = undefined;
      if (!open()) return;
      setState("ready", true);
    });
  }, {
    defer: true
  }));

  // Animated height for collapsible open/close
  let contentRef;
  let heightAnim;
  const initialOpen = open();
  createEffect(on(open, isOpen => {
    if (!props.animated || !contentRef) return;
    heightAnim?.stop();
    if (isOpen) {
      contentRef.style.overflow = "hidden";
      heightAnim = animate(contentRef, {
        height: "auto"
      }, SPRING);
      void heightAnim.finished.then(() => {
        if (!contentRef || !open()) return;
        contentRef.style.overflow = "visible";
        contentRef.style.height = "auto";
      });
    } else {
      contentRef.style.overflow = "hidden";
      heightAnim = animate(contentRef, {
        height: "0px"
      }, SPRING);
    }
  }, {
    defer: true
  }));
  onCleanup(() => {
    heightAnim?.stop();
  });
  const handleOpenChange = value => {
    if (pending()) return;
    if (props.locked && !value) return;
    setState("open", value);
  };

  // Builds the trigger row. Called once per Collapsible.Trigger mount, like
  // the compiled output.
  const trigger = () => {
    const root = template(`<div data-component="tool-trigger"><div data-slot="basic-tool-tool-trigger-content"><div data-slot="basic-tool-tool-info"></div></div></div>`);
    const info = root.firstChild.firstChild;

    // Switch over props.trigger: structured title object vs raw content.
    // `condition` mirrors the compiled Match condition (false | trigger
    // object, identity equality, short-circuits the second read when not
    // structured); `structured` is its truthiness, so the structured branch
    // persists across trigger object identity changes (non-keyed Match) and
    // only its inner effects re-run via the `title` accessor.
    const condition = createMemo(() => isTriggerTitle(props.trigger) && props.trigger);
    const structured = createMemo(() => !!condition());
    const title = () => condition();
    const buildStructured = () => {
      const box = template(`<div data-slot="basic-tool-tool-info-structured"><div data-slot="basic-tool-tool-info-main"><span data-slot="basic-tool-tool-title"></span></div></div>`);
      const main = box.firstChild;
      const titleSpan = main.firstChild;
      titleSpan.appendChild(createComponent(TextShimmer, {
        get text() {
          return title().title;
        },
        get active() {
          return pending();
        }
      }));
      const notPending = createMemo(() => !pending());

      // Show(!pending): subtitle + args, appended after the title span. The
      // inner regions are created per truthy period, matching the compiled
      // Show children getter.
      insert(main, createMemo(() => {
        if (!notPending()) return undefined;

        // Show(subtitle)
        const hasSubtitle = createMemo(() => !!title().subtitle);
        const subtitleRegion = createMemo(() => {
          if (!hasSubtitle()) return undefined;
          const span = template(`<span data-slot="basic-tool-tool-subtitle"></span>`);
          // Replaces the compiled delegated click handler: stop the click from
          // toggling the collapsible only when a subtitle handler exists.
          span.addEventListener("click", e => {
            if (props.onSubtitleClick) {
              e.stopPropagation();
              props.onSubtitleClick();
            }
          });
          insert(span, () => title().subtitle);
          const cls = {};
          createRenderEffect(() => applyClassList(span, {
            [title().subtitleClass ?? ""]: !!title().subtitleClass,
            clickable: !!props.onSubtitleClick
          }, cls));
          return span;
        });

        // Show(args?.length) -> For over the args (keyed by item identity).
        const hasArgs = createMemo(() => !!title().args?.length);
        const argsRegion = createMemo(() => {
          if (!hasArgs()) return undefined;
          return createComponent(For, {
            get each() {
              return title().args;
            },
            children: arg => {
              const span = template(`<span data-slot="basic-tool-tool-arg"></span>`);
              insert(span, arg);
              const cls = {};
              createRenderEffect(() => applyClassList(span, {
                [title().argsClass ?? ""]: !!title().argsClass
              }, cls));
              return span;
            }
          });
        });
        return [subtitleRegion, argsRegion];
      }), null);

      // Show(!pending && action), appended after the main row. The span is
      // rebuilt only on truthiness flips; the action content stays live.
      const actionVisible = createMemo(() => !!(notPending() && title().action));
      insert(box, createMemo(() => {
        if (!actionVisible()) return undefined;
        const span = template(`<span data-slot="basic-tool-tool-action"></span>`);
        insert(span, () => title().action);
        return span;
      }), null);
      const titleCls = {};
      createRenderEffect(() => applyClassList(titleSpan, {
        [title().titleClass ?? ""]: !!title().titleClass
      }, titleCls));
      return box;
    };
    insert(info, createMemo(() => structured() ? buildStructured() : () => props.trigger));

    // Show: collapsible arrow. The inner memo keeps status changes from
    // re-evaluating props.children, like the compiled condition.
    const arrowOn = createMemo(() => !!(props.children && !props.hideDetails && !props.locked));
    const arrowVisible = createMemo(() => !!(arrowOn() && !pending()));
    insert(root, createMemo(() => arrowVisible() ? createComponent(Collapsible.Arrow, {}) : undefined), null);

    // Change-guarded data attributes, like the compiled effect().
    let prevClickable;
    let prevHide;
    createRenderEffect(() => {
      const clickable = props.clickable ? "true" : undefined;
      const hide = props.hideDetails ? "true" : undefined;
      if (clickable !== prevClickable) setAttr(root, "data-clickable", prevClickable = clickable);
      if (hide !== prevHide) setAttr(root, "data-hide-details", prevHide = hide);
    });
    return root;
  };
  return createComponent(Collapsible, {
    get open() {
      return open();
    },
    onOpenChange: handleOpenChange,
    "class": "tool-collapsible",
    get children() {
      // Show(triggerHref): anchor trigger when a href exists, plain button
      // trigger otherwise. `href` mirrors the compiled condition memo so the
      // anchor updates in place while the value stays truthy.
      const href = createMemo(() => props.triggerHref);
      const hasHref = createMemo(() => !!href());
      const triggerRegion = createMemo(() => {
        if (hasHref()) {
          return createComponent(Collapsible.Trigger, {
            as: "a",
            get href() {
              return href();
            },
            get ["data-hide-details"]() {
              return props.hideDetails ? "true" : undefined;
            },
            get onClick() {
              return props.onTriggerClick;
            },
            get children() {
              return trigger();
            }
          });
        }
        return createComponent(Collapsible.Trigger, {
          get ["data-hide-details"]() {
            return props.hideDetails ? "true" : undefined;
          },
          get onClick() {
            return props.onTriggerClick;
          },
          get children() {
            return trigger();
          }
        });
      });

      // Show(animated && children && !hideDetails): manually height-animated
      // body, always mounted (the open effect above drives the animation).
      const animatedOn = createMemo(() => !!(props.animated && props.children));
      const animatedVisible = createMemo(() => !!(animatedOn() && !props.hideDetails));
      const animatedRegion = createMemo(() => {
        if (!animatedVisible()) return undefined;
        const el = template(`<div data-slot="collapsible-content" data-animated></div>`);
        contentRef = el;
        el.style.setProperty("height", initialOpen ? "auto" : "0px");
        el.style.setProperty("overflow", initialOpen ? "visible" : "hidden");
        insert(el, () => props.children);
        return el;
      });

      // Show(!animated && children && !hideDetails): presence-gated
      // Content (children resolve only while open), so the gate memo below is
      // created once per Content mount.
      const plainOn = createMemo(() => !!(!props.animated && props.children));
      const plainVisible = createMemo(() => !!(plainOn() && !props.hideDetails));
      const plainRegion = createMemo(() => {
        if (!plainVisible()) return undefined;
        return createComponent(Collapsible.Content, {
          get children() {
            // Show(!defer || ready()): props.children stays tracked here, so
            // children re-render on their own reactive changes, like Show.
            const gate = createMemo(() => !props.defer || ready());
            return createMemo(() => gate() ? props.children : undefined);
          }
        });
      });
      return [triggerRegion, animatedRegion, plainRegion];
    }
  });
}
/**
 * Picks the most descriptive string field from a tool input to use as a subtitle.
 * @param {Object} input - Tool input object.
 * @returns {string} The first non-empty string among description/query/url/filePath/path/pattern/name, or undefined.
 */
function label(input) {
  const keys = ["description", "query", "url", "filePath", "path", "pattern", "name"];
  return keys.map(key => input?.[key]).find(value => typeof value === "string" && value.length > 0);
}
/**
 * Formats up to three "key=value" argument chips from a tool input, skipping
 * the fields already used as the label and any non-primitive values.
 * @param {Object} input - Tool input object.
 * @returns {Array} Up to three formatted "key=value" strings.
 */
function args(input) {
  if (!input) return [];
  const skip = new Set(["description", "query", "url", "filePath", "path", "pattern", "name"]);
  return Object.entries(input).filter(([key]) => !skip.has(key)).flatMap(([key, value]) => {
    if (typeof value === "string") return [`${key}=${value}`];
    if (typeof value === "number") return [`${key}=${value}`];
    if (typeof value === "boolean") return [`${key}=${value}`];
    return [];
  }).slice(0, 3);
}
/**
 * GenericTool component. A BasicTool preset for generic/MCP tool calls: derives
 * the title, subtitle, and argument chips from the tool name and input.
 * @param {Object} props - Component props.
 * @param {string} props.tool - Display name of the invoked tool.
 * @param {Object} props.input - Tool input object used to derive subtitle and args.
 * @param {string} props.status - Tool status forwarded to BasicTool.
 * @param {boolean} props.hideDetails - Hide the collapsible details, forwarded to BasicTool.
 * @returns {Node} The BasicTool node configured for a generic tool call.
 */
export function GenericTool(props) {
  const i18n = useI18n();
  return createComponent(BasicTool, {
    icon: "mcp",
    get status() {
      return props.status;
    },
    get trigger() {
      return {
        title: i18n.t("ui.basicTool.called", {
          tool: props.tool
        }),
        subtitle: label(props.input),
        args: args(props.input)
      };
    },
    get hideDetails() {
      return props.hideDetails;
    }
  });
}
