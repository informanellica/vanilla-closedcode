import { template as _$template } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { mergeProps as _$mergeProps } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div data-slot=tooltip-keybind><span></span><span data-slot=tooltip-keybind-key>`);
import { Tooltip as KobalteTooltip } from "@kobalte/core/tooltip";
import { createEffect, Match, onCleanup, splitProps, Switch } from "solid-js";
import { createStore } from "solid-js/store";
export function TooltipKeybind(props) {
  const [local, others] = splitProps(props, ["title", "keybind"]);
  return _$createComponent(Tooltip, _$mergeProps(others, {
    get value() {
      return (() => {
        var _el$ = _tmpl$(),
          _el$2 = _el$.firstChild,
          _el$3 = _el$2.nextSibling;
        _$insert(_el$2, () => local.title);
        _$insert(_el$3, () => local.keybind);
        return _el$;
      })();
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
  return _$createComponent(Switch, {
    get children() {
      return [_$createComponent(Match, {
        get when() {
          return local.inactive;
        },
        get children() {
          return local.children;
        }
      }), _$createComponent(Match, {
        when: true,
        get children() {
          return _$createComponent(KobalteTooltip, _$mergeProps({
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
              return [_$createComponent(KobalteTooltip.Trigger, {
                ref(r$) {
                  var _ref$ = ref;
                  typeof _ref$ === "function" ? _ref$(r$) : ref = r$;
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
              }), _$createComponent(KobalteTooltip.Portal, {
                get children() {
                  return _$createComponent(KobalteTooltip.Content, {
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