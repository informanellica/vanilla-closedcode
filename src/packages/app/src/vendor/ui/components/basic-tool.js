import { insert } from "solid-js/web";
import { createComponent, createEffect, createMemo, createRenderEffect, For, on, onCleanup } from "solid-js";
import { animate } from "motion";
import { useI18n } from "../context/i18n.js";
import { createStore } from "solid-js/store";
import { Collapsible } from "./collapsible.js";
import { TextShimmer } from "./text-shimmer.js";
const isTriggerTitle = val => {
  return typeof val === "object" && val !== null && "title" in val && (typeof Node === "undefined" || !(val instanceof Node));
};
const SPRING = {
  type: "spring",
  visualDuration: 0.35,
  bounce: 0
};

// Build a detached element from compact HTML (no inter-element whitespace,
// matching the compiled Solid templates).
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  return wrapper.firstElementChild;
}

// Mirror solid-js/web setAttribute semantics: nullish removes the attribute.
function setAttr(el, name, value) {
  if (value == null) el.removeAttribute(name);
  else el.setAttribute(name, value);
}

// classList keys may hold several space-separated class names; toggle each.
function toggleClassKey(el, key, value) {
  for (const name of key.trim().split(/\s+/)) {
    if (name) el.classList.toggle(name, value);
  }
}

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

      // Show(!animated && children && !hideDetails): Kobalte presence-gated
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
function label(input) {
  const keys = ["description", "query", "url", "filePath", "path", "pattern", "name"];
  return keys.map(key => input?.[key]).find(value => typeof value === "string" && value.length > 0);
}
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
