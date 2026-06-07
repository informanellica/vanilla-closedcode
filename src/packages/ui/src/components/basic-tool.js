import { template as _$template } from "solid-js/web";
import { delegateEvents as _$delegateEvents } from "solid-js/web";
import { setStyleProperty as _$setStyleProperty } from "solid-js/web";
import { use as _$use } from "solid-js/web";
import { classList as _$classList } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div data-component=tool-trigger><div data-slot=basic-tool-tool-trigger-content><div data-slot=basic-tool-tool-info>`),
  _tmpl$2 = /*#__PURE__*/_$template(`<span data-slot=basic-tool-tool-subtitle>`),
  _tmpl$3 = /*#__PURE__*/_$template(`<span data-slot=basic-tool-tool-action>`),
  _tmpl$4 = /*#__PURE__*/_$template(`<div data-slot=basic-tool-tool-info-structured><div data-slot=basic-tool-tool-info-main><span data-slot=basic-tool-tool-title>`),
  _tmpl$5 = /*#__PURE__*/_$template(`<span data-slot=basic-tool-tool-arg>`),
  _tmpl$6 = /*#__PURE__*/_$template(`<div data-slot=collapsible-content data-animated>`);
import { createEffect, For, Match, on, onCleanup, Show, Switch } from "solid-js";
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
  const trigger = () => (() => {
    var _el$ = _tmpl$(),
      _el$2 = _el$.firstChild,
      _el$3 = _el$2.firstChild;
    _$insert(_el$3, _$createComponent(Switch, {
      get children() {
        return [_$createComponent(Match, {
          get when() {
            return _$memo(() => !!isTriggerTitle(props.trigger))() && props.trigger;
          },
          children: title => (() => {
            var _el$4 = _tmpl$4(),
              _el$5 = _el$4.firstChild,
              _el$6 = _el$5.firstChild;
            _$insert(_el$6, _$createComponent(TextShimmer, {
              get text() {
                return title().title;
              },
              get active() {
                return pending();
              }
            }));
            _$insert(_el$5, _$createComponent(Show, {
              get when() {
                return !pending();
              },
              get children() {
                return [_$createComponent(Show, {
                  get when() {
                    return title().subtitle;
                  },
                  get children() {
                    var _el$7 = _tmpl$2();
                    _el$7.$$click = e => {
                      if (props.onSubtitleClick) {
                        e.stopPropagation();
                        props.onSubtitleClick();
                      }
                    };
                    _$insert(_el$7, () => title().subtitle);
                    _$effect(_$p => _$classList(_el$7, {
                      [title().subtitleClass ?? ""]: !!title().subtitleClass,
                      clickable: !!props.onSubtitleClick
                    }, _$p));
                    return _el$7;
                  }
                }), _$createComponent(Show, {
                  get when() {
                    return title().args?.length;
                  },
                  get children() {
                    return _$createComponent(For, {
                      get each() {
                        return title().args;
                      },
                      children: arg => (() => {
                        var _el$9 = _tmpl$5();
                        _$insert(_el$9, arg);
                        _$effect(_$p => _$classList(_el$9, {
                          [title().argsClass ?? ""]: !!title().argsClass
                        }, _$p));
                        return _el$9;
                      })()
                    });
                  }
                })];
              }
            }), null);
            _$insert(_el$4, _$createComponent(Show, {
              get when() {
                return _$memo(() => !!!pending())() && title().action;
              },
              get children() {
                var _el$8 = _tmpl$3();
                _$insert(_el$8, () => title().action);
                return _el$8;
              }
            }), null);
            _$effect(_$p => _$classList(_el$6, {
              [title().titleClass ?? ""]: !!title().titleClass
            }, _$p));
            return _el$4;
          })()
        }), _$createComponent(Match, {
          when: true,
          get children() {
            return props.trigger;
          }
        })];
      }
    }));
    _$insert(_el$, _$createComponent(Show, {
      get when() {
        return _$memo(() => !!(props.children && !props.hideDetails && !props.locked))() && !pending();
      },
      get children() {
        return _$createComponent(Collapsible.Arrow, {});
      }
    }), null);
    _$effect(_p$ => {
      var _v$ = props.clickable ? "true" : undefined,
        _v$2 = props.hideDetails ? "true" : undefined;
      _v$ !== _p$.e && _$setAttribute(_el$, "data-clickable", _p$.e = _v$);
      _v$2 !== _p$.t && _$setAttribute(_el$, "data-hide-details", _p$.t = _v$2);
      return _p$;
    }, {
      e: undefined,
      t: undefined
    });
    return _el$;
  })();
  return _$createComponent(Collapsible, {
    get open() {
      return open();
    },
    onOpenChange: handleOpenChange,
    "class": "tool-collapsible",
    get children() {
      return [_$createComponent(Show, {
        get when() {
          return props.triggerHref;
        },
        get fallback() {
          return _$createComponent(Collapsible.Trigger, {
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
        },
        children: href => _$createComponent(Collapsible.Trigger, {
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
        })
      }), _$createComponent(Show, {
        get when() {
          return _$memo(() => !!(props.animated && props.children))() && !props.hideDetails;
        },
        get children() {
          var _el$0 = _tmpl$6();
          var _ref$ = contentRef;
          typeof _ref$ === "function" ? _$use(_ref$, _el$0) : contentRef = _el$0;
          _$setStyleProperty(_el$0, "height", initialOpen ? "auto" : "0px");
          _$setStyleProperty(_el$0, "overflow", initialOpen ? "visible" : "hidden");
          _$insert(_el$0, () => props.children);
          return _el$0;
        }
      }), _$createComponent(Show, {
        get when() {
          return _$memo(() => !!(!props.animated && props.children))() && !props.hideDetails;
        },
        get children() {
          return _$createComponent(Collapsible.Content, {
            get children() {
              return _$createComponent(Show, {
                get when() {
                  return !props.defer || ready();
                },
                get children() {
                  return props.children;
                }
              });
            }
          });
        }
      })];
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
  return _$createComponent(BasicTool, {
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
_$delegateEvents(["click"]);