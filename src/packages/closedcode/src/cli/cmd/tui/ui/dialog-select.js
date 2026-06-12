import { memo as _$memo } from "@opentui/solid";
import { effect as _$effect } from "@opentui/solid";
import { createComponent as _$createComponent } from "@opentui/solid";
import { use as _$use } from "@opentui/solid";
import { createTextNode as _$createTextNode } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { RGBA, TextAttributes } from "@opentui/core";
import { useTheme, selectedForeground } from "#tui/context/theme.js";
import { entries, filter, flatMap, groupBy, pipe } from "remeda";
import { batch, createEffect, createMemo, For, Show, on } from "solid-js";
import { createStore } from "solid-js/store";
import { useKeyboard, useTerminalDimensions } from "@opentui/solid";
import * as fuzzysort from "fuzzysort";
import { isDeepEqual } from "remeda";
import { useDialog } from "#tui/ui/dialog.js";
import { useKeybind } from "#tui/context/keybind.js";
import { Keybind } from "#util/keybind.js";
import { Locale } from "#util/locale.js";
import { getScrollAcceleration } from "../util/scroll.js";
import { useTuiConfig } from "../context/tui-config.js";
export function DialogSelect(props) {
  const dialog = useDialog();
  const {
    theme
  } = useTheme();
  const tuiConfig = useTuiConfig();
  const scrollAcceleration = createMemo(() => getScrollAcceleration(tuiConfig));
  const [store, setStore] = createStore({
    selected: 0,
    filter: "",
    input: "keyboard"
  });
  createEffect(on(() => props.current, current => {
    if (current) {
      const currentIndex = flat().findIndex(opt => isDeepEqual(opt.value, current));
      if (currentIndex >= 0) {
        setStore("selected", currentIndex);
      }
    }
  }));
  let input;
  const filtered = createMemo(() => {
    if (props.skipFilter) return props.options.filter(x => x.disabled !== true);
    const needle = store.filter.toLowerCase();
    const options = pipe(props.options, filter(x => x.disabled !== true));
    if (!needle) return options;

    // prioritize title matches (weight: 2) over category matches (weight: 1).
    // users typically search by the item name, and not its category.
    const result = fuzzysort.go(needle, options, {
      keys: ["title", "category"],
      scoreFn: r => r[0].score * 2 + r[1].score
    }).map(x => x.obj);
    return result;
  });

  // When the filter changes due to how TUI works, the mousemove might still be triggered
  // via a synthetic event as the layout moves underneath the cursor. This is a workaround to make sure the input mode remains keyboard
  // that the mouseover event doesn't trigger when filtering.
  createEffect(() => {
    filtered();
    setStore("input", "keyboard");
  });
  const flatten = createMemo(() => props.flat && store.filter.length > 0);
  const grouped = createMemo(() => {
    if (flatten()) return [["", filtered()]];
    const result = pipe(filtered(), groupBy(x => x.category ?? ""),
    // mapValues((x) => x.sort((a, b) => a.title.localeCompare(b.title))),
    entries());
    return result;
  });
  const flat = createMemo(() => {
    return pipe(grouped(), flatMap(([_, options]) => options));
  });
  const rows = createMemo(() => {
    const headers = grouped().reduce((acc, [category], i) => {
      if (!category) return acc;
      return acc + (i > 0 ? 2 : 1);
    }, 0);
    return flat().length + headers;
  });
  const dimensions = useTerminalDimensions();
  const height = createMemo(() => Math.min(rows(), Math.floor(dimensions().height / 2) - 6));
  const selected = createMemo(() => flat()[store.selected]);
  createEffect(on([() => store.filter, () => props.current], ([filter, current]) => {
    setTimeout(() => {
      if (filter.length > 0) {
        moveTo(0, true);
      } else if (current) {
        const currentIndex = flat().findIndex(opt => isDeepEqual(opt.value, current));
        if (currentIndex >= 0) {
          moveTo(currentIndex, true);
        }
      }
    }, 0);
  }));
  function move(direction) {
    if (flat().length === 0) return;
    let next = store.selected + direction;
    if (next < 0) next = flat().length - 1;
    if (next >= flat().length) next = 0;
    moveTo(next, true);
  }
  function moveTo(next, center = false) {
    setStore("selected", next);
    const option = selected();
    if (option) props.onMove?.(option);
    if (!scroll) return;
    const target = scroll.getChildren().find(child => {
      return child.id === JSON.stringify(selected()?.value);
    });
    if (!target) return;
    const y = target.y - scroll.y;
    if (center) {
      const centerOffset = Math.floor(scroll.height / 2);
      scroll.scrollBy(y - centerOffset);
    } else {
      if (y >= scroll.height) {
        scroll.scrollBy(y - scroll.height + 1);
      }
      if (y < 0) {
        scroll.scrollBy(y);
        if (isDeepEqual(flat()[0].value, selected()?.value)) {
          scroll.scrollTo(0);
        }
      }
    }
  }
  const keybind = useKeybind();
  useKeyboard(evt => {
    setStore("input", "keyboard");
    if (evt.name === "up" || evt.ctrl && evt.name === "p") move(-1);
    if (evt.name === "down" || evt.ctrl && evt.name === "n") move(1);
    if (evt.name === "pageup") move(-10);
    if (evt.name === "pagedown") move(10);
    if (evt.name === "home") moveTo(0);
    if (evt.name === "end") moveTo(flat().length - 1);
    if (evt.name === "return") {
      const option = selected();
      if (option) {
        evt.preventDefault();
        evt.stopPropagation();
        if (option.onSelect) option.onSelect(dialog);
        props.onSelect?.(option);
      }
    }
    for (const item of props.keybind ?? []) {
      if (item.disabled || !item.keybind) continue;
      if (Keybind.match(item.keybind, keybind.parse(evt))) {
        const s = selected();
        if (s) {
          evt.preventDefault();
          item.onTrigger(s);
        }
      }
    }
  });
  let scroll;
  const ref = {
    get filter() {
      return store.filter;
    },
    get filtered() {
      return filtered();
    }
  };
  props.ref?.(ref);
  const keybinds = createMemo(() => props.keybind?.filter(x => !x.disabled && x.keybind) ?? []);
  const left = createMemo(() => keybinds().filter(item => item.side !== "right"));
  const right = createMemo(() => keybinds().filter(item => item.side === "right"));
  return (() => {
    var _el$ = _$createElement("box"),
      _el$2 = _$createElement("box"),
      _el$3 = _$createElement("box"),
      _el$4 = _$createElement("text"),
      _el$5 = _$createElement("text"),
      _el$7 = _$createElement("box"),
      _el$8 = _$createElement("input");
    _$insertNode(_el$, _el$2);
    _$setProp(_el$, "gap", 1);
    _$setProp(_el$, "paddingBottom", 1);
    _$insertNode(_el$2, _el$3);
    _$insertNode(_el$2, _el$7);
    _$setProp(_el$2, "paddingLeft", 4);
    _$setProp(_el$2, "paddingRight", 4);
    _$insertNode(_el$3, _el$4);
    _$insertNode(_el$3, _el$5);
    _$setProp(_el$3, "flexDirection", "row");
    _$setProp(_el$3, "justifyContent", "space-between");
    _$insert(_el$4, () => props.title);
    _$insertNode(_el$5, _$createTextNode(`esc`));
    _$setProp(_el$5, "onMouseUp", () => dialog.clear());
    _$insertNode(_el$7, _el$8);
    _$setProp(_el$7, "paddingTop", 1);
    _$use(r => {
      input = r;
      input.traits = {
        status: "FILTER"
      };
      setTimeout(() => {
        if (!input) return;
        if (input.isDestroyed) return;
        input.focus();
      }, 1);
    }, _el$8);
    _$setProp(_el$8, "onInput", e => {
      batch(() => {
        setStore("filter", e);
        props.onFilter?.(e);
      });
    });
    _$insert(_el$, _$createComponent(Show, {
      get when() {
        return grouped().length > 0;
      },
      get fallback() {
        return (() => {
          var _el$11 = _$createElement("box"),
            _el$12 = _$createElement("text");
          _$insertNode(_el$11, _el$12);
          _$setProp(_el$11, "paddingLeft", 4);
          _$setProp(_el$11, "paddingRight", 4);
          _$setProp(_el$11, "paddingTop", 1);
          _$insertNode(_el$12, _$createTextNode(`No results found`));
          _$effect(_$p => _$setProp(_el$12, "fg", theme.textMuted, _$p));
          return _el$11;
        })();
      },
      get children() {
        var _el$9 = _$createElement("scrollbox");
        _$use(r => scroll = r, _el$9);
        _$setProp(_el$9, "paddingLeft", 1);
        _$setProp(_el$9, "paddingRight", 1);
        _$setProp(_el$9, "scrollbarOptions", {
          visible: false
        });
        _$insert(_el$9, _$createComponent(For, {
          get each() {
            return grouped();
          },
          children: ([category, options], index) => [_$createComponent(Show, {
            when: category,
            get children() {
              var _el$14 = _$createElement("box");
              _$setProp(_el$14, "paddingLeft", 3);
              _$insert(_el$14, _$createComponent(Show, {
                get when() {
                  return options[0]?.categoryView;
                },
                get fallback() {
                  return (() => {
                    var _el$15 = _$createElement("text");
                    _$insert(_el$15, category);
                    _$effect(_p$ => {
                      var _v$1 = theme.accent,
                        _v$10 = TextAttributes.BOLD;
                      _v$1 !== _p$.e && (_p$.e = _$setProp(_el$15, "fg", _v$1, _p$.e));
                      _v$10 !== _p$.t && (_p$.t = _$setProp(_el$15, "attributes", _v$10, _p$.t));
                      return _p$;
                    }, {
                      e: undefined,
                      t: undefined
                    });
                    return _el$15;
                  })();
                },
                get children() {
                  return options[0]?.categoryView;
                }
              }));
              _$effect(_$p => _$setProp(_el$14, "paddingTop", index() > 0 ? 1 : 0, _$p));
              return _el$14;
            }
          }), _$createComponent(For, {
            each: options,
            children: option => {
              const active = createMemo(() => isDeepEqual(option.value, selected()?.value));
              const current = createMemo(() => isDeepEqual(option.value, props.current));
              return (() => {
                var _el$16 = _$createElement("box");
                _$setProp(_el$16, "flexDirection", "row");
                _$setProp(_el$16, "position", "relative");
                _$setProp(_el$16, "onMouseMove", () => {
                  setStore("input", "mouse");
                });
                _$setProp(_el$16, "onMouseUp", () => {
                  option.onSelect?.(dialog);
                  props.onSelect?.(option);
                });
                _$setProp(_el$16, "onMouseOver", () => {
                  if (store.input !== "mouse") return;
                  const index = flat().findIndex(x => isDeepEqual(x.value, option.value));
                  if (index === -1) return;
                  moveTo(index);
                });
                _$setProp(_el$16, "onMouseDown", () => {
                  const index = flat().findIndex(x => isDeepEqual(x.value, option.value));
                  if (index === -1) return;
                  moveTo(index);
                });
                _$setProp(_el$16, "paddingRight", 3);
                _$setProp(_el$16, "gap", 1);
                _$insert(_el$16, _$createComponent(Show, {
                  get when() {
                    return _$memo(() => !!!current())() && option.margin;
                  },
                  get children() {
                    var _el$17 = _$createElement("box");
                    _$setProp(_el$17, "position", "absolute");
                    _$setProp(_el$17, "left", 1);
                    _$setProp(_el$17, "flexShrink", 0);
                    _$insert(_el$17, () => option.margin);
                    return _el$17;
                  }
                }), null);
                _$insert(_el$16, _$createComponent(Option, {
                  get title() {
                    return option.title;
                  },
                  get footer() {
                    return _$memo(() => !!flatten())() ? option.category ?? option.footer : option.footer;
                  },
                  get description() {
                    return _$memo(() => option.description !== category)() ? option.description : undefined;
                  },
                  get active() {
                    return active();
                  },
                  get current() {
                    return current();
                  },
                  get gutter() {
                    return option.gutter;
                  }
                }), null);
                _$effect(_p$ => {
                  var _v$11 = JSON.stringify(option.value),
                    _v$12 = active() ? option.bg ?? theme.primary : RGBA.fromInts(0, 0, 0, 0),
                    _v$13 = current() || option.gutter ? 1 : 3;
                  _v$11 !== _p$.e && (_p$.e = _$setProp(_el$16, "id", _v$11, _p$.e));
                  _v$12 !== _p$.t && (_p$.t = _$setProp(_el$16, "backgroundColor", _v$12, _p$.t));
                  _v$13 !== _p$.a && (_p$.a = _$setProp(_el$16, "paddingLeft", _v$13, _p$.a));
                  return _p$;
                }, {
                  e: undefined,
                  t: undefined,
                  a: undefined
                });
                return _el$16;
              })();
            }
          })]
        }));
        _$effect(_p$ => {
          var _v$ = scrollAcceleration(),
            _v$2 = height();
          _v$ !== _p$.e && (_p$.e = _$setProp(_el$9, "scrollAcceleration", _v$, _p$.e));
          _v$2 !== _p$.t && (_p$.t = _$setProp(_el$9, "maxHeight", _v$2, _p$.t));
          return _p$;
        }, {
          e: undefined,
          t: undefined
        });
        return _el$9;
      }
    }), null);
    _$insert(_el$, _$createComponent(Show, {
      get when() {
        return keybinds().length;
      },
      get fallback() {
        return (() => {
          var _el$18 = _$createElement("box");
          _$setProp(_el$18, "flexShrink", 0);
          return _el$18;
        })();
      },
      get children() {
        var _el$0 = _$createElement("box"),
          _el$1 = _$createElement("box"),
          _el$10 = _$createElement("box");
        _$insertNode(_el$0, _el$1);
        _$insertNode(_el$0, _el$10);
        _$setProp(_el$0, "paddingRight", 2);
        _$setProp(_el$0, "paddingLeft", 4);
        _$setProp(_el$0, "flexDirection", "row");
        _$setProp(_el$0, "justifyContent", "space-between");
        _$setProp(_el$0, "flexShrink", 0);
        _$setProp(_el$0, "paddingTop", 1);
        _$setProp(_el$1, "flexDirection", "row");
        _$setProp(_el$1, "gap", 2);
        _$insert(_el$1, _$createComponent(For, {
          get each() {
            return left();
          },
          children: item => (() => {
            var _el$19 = _$createElement("text"),
              _el$20 = _$createElement("span"),
              _el$21 = _$createElement("b"),
              _el$22 = _$createTextNode(` `),
              _el$23 = _$createElement("span");
            _$insertNode(_el$19, _el$20);
            _$insertNode(_el$19, _el$23);
            _$insertNode(_el$20, _el$21);
            _$insertNode(_el$20, _el$22);
            _$insert(_el$21, () => item.title);
            _$insert(_el$23, () => Keybind.toString(item.keybind));
            _$effect(_p$ => {
              var _v$14 = {
                  fg: theme.text
                },
                _v$15 = {
                  fg: theme.textMuted
                };
              _v$14 !== _p$.e && (_p$.e = _$setProp(_el$20, "style", _v$14, _p$.e));
              _v$15 !== _p$.t && (_p$.t = _$setProp(_el$23, "style", _v$15, _p$.t));
              return _p$;
            }, {
              e: undefined,
              t: undefined
            });
            return _el$19;
          })()
        }));
        _$setProp(_el$10, "flexDirection", "row");
        _$setProp(_el$10, "gap", 2);
        _$insert(_el$10, _$createComponent(For, {
          get each() {
            return right();
          },
          children: item => (() => {
            var _el$24 = _$createElement("text"),
              _el$25 = _$createElement("span"),
              _el$26 = _$createElement("b"),
              _el$27 = _$createTextNode(` `),
              _el$28 = _$createElement("span");
            _$insertNode(_el$24, _el$25);
            _$insertNode(_el$24, _el$28);
            _$insertNode(_el$25, _el$26);
            _$insertNode(_el$25, _el$27);
            _$insert(_el$26, () => item.title);
            _$insert(_el$28, () => Keybind.toString(item.keybind));
            _$effect(_p$ => {
              var _v$16 = {
                  fg: theme.text
                },
                _v$17 = {
                  fg: theme.textMuted
                };
              _v$16 !== _p$.e && (_p$.e = _$setProp(_el$25, "style", _v$16, _p$.e));
              _v$17 !== _p$.t && (_p$.t = _$setProp(_el$28, "style", _v$17, _p$.t));
              return _p$;
            }, {
              e: undefined,
              t: undefined
            });
            return _el$24;
          })()
        }));
        return _el$0;
      }
    }), null);
    _$effect(_p$ => {
      var _v$3 = theme.text,
        _v$4 = TextAttributes.BOLD,
        _v$5 = theme.textMuted,
        _v$6 = theme.backgroundPanel,
        _v$7 = theme.primary,
        _v$8 = theme.textMuted,
        _v$9 = props.placeholder ?? "Search",
        _v$0 = theme.textMuted;
      _v$3 !== _p$.e && (_p$.e = _$setProp(_el$4, "fg", _v$3, _p$.e));
      _v$4 !== _p$.t && (_p$.t = _$setProp(_el$4, "attributes", _v$4, _p$.t));
      _v$5 !== _p$.a && (_p$.a = _$setProp(_el$5, "fg", _v$5, _p$.a));
      _v$6 !== _p$.o && (_p$.o = _$setProp(_el$8, "focusedBackgroundColor", _v$6, _p$.o));
      _v$7 !== _p$.i && (_p$.i = _$setProp(_el$8, "cursorColor", _v$7, _p$.i));
      _v$8 !== _p$.n && (_p$.n = _$setProp(_el$8, "focusedTextColor", _v$8, _p$.n));
      _v$9 !== _p$.s && (_p$.s = _$setProp(_el$8, "placeholder", _v$9, _p$.s));
      _v$0 !== _p$.h && (_p$.h = _$setProp(_el$8, "placeholderColor", _v$0, _p$.h));
      return _p$;
    }, {
      e: undefined,
      t: undefined,
      a: undefined,
      o: undefined,
      i: undefined,
      n: undefined,
      s: undefined,
      h: undefined
    });
    return _el$;
  })();
}
function Option(props) {
  const {
    theme
  } = useTheme();
  const fg = selectedForeground(theme);
  return [_$createComponent(Show, {
    get when() {
      return props.current;
    },
    get children() {
      var _el$29 = _$createElement("text");
      _$insertNode(_el$29, _$createTextNode(`●`));
      _$setProp(_el$29, "flexShrink", 0);
      _$setProp(_el$29, "marginRight", 0);
      _$effect(_$p => _$setProp(_el$29, "fg", props.active ? fg : props.current ? theme.primary : theme.text, _$p));
      return _el$29;
    }
  }), _$createComponent(Show, {
    get when() {
      return _$memo(() => !!!props.current)() && props.gutter;
    },
    get children() {
      var _el$31 = _$createElement("box");
      _$setProp(_el$31, "flexShrink", 0);
      _$setProp(_el$31, "marginRight", 0);
      _$insert(_el$31, () => props.gutter?.());
      return _el$31;
    }
  }), (() => {
    var _el$32 = _$createElement("text");
    _$setProp(_el$32, "flexGrow", 1);
    _$setProp(_el$32, "overflow", "hidden");
    _$setProp(_el$32, "wrapMode", "none");
    _$setProp(_el$32, "paddingLeft", 3);
    _$insert(_el$32, () => Locale.truncate(props.title, 61), null);
    _$insert(_el$32, _$createComponent(Show, {
      get when() {
        return props.description;
      },
      get children() {
        var _el$33 = _$createElement("span"),
          _el$34 = _$createTextNode(` `);
        _$insertNode(_el$33, _el$34);
        _$insert(_el$33, () => props.description, null);
        _$effect(_$p => _$setProp(_el$33, "style", {
          fg: props.active ? fg : theme.textMuted
        }, _$p));
        return _el$33;
      }
    }), null);
    _$effect(_p$ => {
      var _v$18 = props.active ? fg : props.current ? theme.primary : theme.text,
        _v$19 = props.active ? TextAttributes.BOLD : undefined;
      _v$18 !== _p$.e && (_p$.e = _$setProp(_el$32, "fg", _v$18, _p$.e));
      _v$19 !== _p$.t && (_p$.t = _$setProp(_el$32, "attributes", _v$19, _p$.t));
      return _p$;
    }, {
      e: undefined,
      t: undefined
    });
    return _el$32;
  })(), _$createComponent(Show, {
    get when() {
      return props.footer;
    },
    get children() {
      var _el$35 = _$createElement("box"),
        _el$36 = _$createElement("text");
      _$insertNode(_el$35, _el$36);
      _$setProp(_el$35, "flexShrink", 0);
      _$insert(_el$36, () => props.footer);
      _$effect(_$p => _$setProp(_el$36, "fg", props.active ? fg : theme.textMuted, _$p));
      return _el$35;
    }
  })];
}