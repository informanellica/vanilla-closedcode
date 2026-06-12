import { insert as _solidInsert } from "solid-js/web";
import { Tooltip as KobalteTooltip } from "@kobalte/core/tooltip";
import { createComponent, createEffect, Match, mergeProps, onCleanup, splitProps, Switch } from "solid-js";
import { createStore } from "solid-js/store";

// Build a detached element from compact HTML (no inter-element whitespace,
// matching the compiled Solid templates). Built fresh per call: no cloneNode.
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  return wrapper.firstElementChild;
}

export function TooltipKeybind(props) {
  const [local, others] = splitProps(props, ["title", "keybind"]);
  return createComponent(Tooltip, mergeProps(others, {
    get value() {
      // Fresh nodes per read, like the compiled template factory: the getter
      // runs again whenever the tooltip content remounts.
      const root = template(`<div data-slot="tooltip-keybind"><span></span><span data-slot="tooltip-keybind-key"></span></div>`);
      const titleEl = root.firstElementChild;
      const keybindEl = titleEl.nextElementSibling;
      // title/keybind are arbitrary (possibly reactive) children rendered
      // inside the presence-gated tooltip content, so they go through solid's
      // insert() to stay live (established exception).
      _solidInsert(titleEl, () => local.title);
      _solidInsert(keybindEl, () => local.keybind);
      return root;
    }
  }));
}

export function Tooltip(props) {
  let ref;
  const [state, setState] = createStore({
    open: false,
    block: false,
    expand: false
  });
  const [local, others] = splitProps(props, ["children", "class", "contentClass", "contentStyle", "inactive", "forceOpen", "ignoreSafeArea", "value"]);
  const close = () => setState("open", false);
  const inside = () => {
    const active = document.activeElement;
    if (!ref || !active) return false;
    return ref.contains(active);
  };
  const drop = (expand = state.expand) => {
    if (expand) return;
    if (ref?.matches(":hover")) return;
    if (inside()) return;
    setState("block", false);
  };
  const sync = () => {
    const expand = !!ref?.querySelector('[aria-expanded="true"], [data-expanded]');
    setState("expand", expand);
    if (expand) {
      setState("block", true);
      close();
      return;
    }
    drop(expand);
  };
  const arm = () => {
    setState("block", true);
    close();
  };
  const leave = () => {
    if (!inside()) close();
    drop();
  };
  createEffect(() => {
    if (!ref) return;
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(ref, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["aria-expanded", "data-expanded"]
    });
    onCleanup(() => obs.disconnect());
  });
  let justClickedTrigger = false;
  // Switch/Match are the same runtime solid-js components the original used:
  // non-keyed truthiness switching between the inactive passthrough and the
  // Kobalte tooltip (a flip disposes and rebuilds the active branch).
  return createComponent(Switch, {
    get children() {
      return [createComponent(Match, {
        get when() {
          return local.inactive;
        },
        get children() {
          return local.children;
        }
      }), createComponent(Match, {
        when: true,
        get children() {
          return createComponent(KobalteTooltip, mergeProps({
            gutter: 4
          }, others, {
            closeDelay: 0,
            get ignoreSafeArea() {
              return local.ignoreSafeArea ?? true;
            },
            get open() {
              return local.forceOpen || state.open;
            },
            onOpenChange: open => {
              if (local.forceOpen) return;
              if (state.block && open) return;
              if (justClickedTrigger) {
                justClickedTrigger = false;
                return;
              }
              setState("open", open);
            },
            get children() {
              return [createComponent(KobalteTooltip.Trigger, {
                // Capture the rendered trigger element. The compiled ref
                // forwarder special-cased a function-valued `ref`, but the
                // local `ref` above is only ever undefined or an element.
                ref(r) {
                  ref = r;
                },
                as: "div",
                "data-component": "tooltip-trigger",
                get ["class"]() {
                  return local.class;
                },
                onPointerDownCapture: arm,
                onKeyDownCapture: event => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  arm();
                },
                onPointerLeave: leave,
                onFocusOut: () => requestAnimationFrame(() => drop()),
                get children() {
                  return local.children;
                }
              }), createComponent(KobalteTooltip.Portal, {
                get children() {
                  return createComponent(KobalteTooltip.Content, {
                    "data-component": "tooltip",
                    get ["data-placement"]() {
                      return props.placement;
                    },
                    get ["data-force-open"]() {
                      return local.forceOpen;
                    },
                    get ["class"]() {
                      return local.contentClass;
                    },
                    get style() {
                      return local.contentStyle;
                    },
                    onPointerDownOutside: e => {
                      if (ref === e.target || e.target instanceof Node && ref?.contains(e.target)) {
                        justClickedTrigger = true;
                      }
                      e.preventDefault();
                    },
                    get children() {
                      return local.value;
                    }
                  });
                }
              })];
            }
          }));
        }
      })];
    }
  });
}
