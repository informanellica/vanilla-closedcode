import { template as _$template } from "solid-js/web";
import { delegateEvents as _$delegateEvents } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { use as _$use } from "solid-js/web";
import { classList as _$classList } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div data-slot=list-item-add>`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div data-slot=list-header>`),
  _tmpl$3 = /*#__PURE__*/_$template(`<span>`),
  _tmpl$4 = /*#__PURE__*/_$template(`<span data-slot=list-filter>&quot;<!>&quot;`),
  _tmpl$5 = /*#__PURE__*/_$template(`<div data-slot=list-search-wrapper><div data-slot=list-search><div data-slot=list-search-container>`),
  _tmpl$6 = /*#__PURE__*/_$template(`<div data-slot=list-group><div data-slot=list-items>`),
  _tmpl$7 = /*#__PURE__*/_$template(`<div data-component=list><div data-slot=list-scroll>`),
  _tmpl$8 = /*#__PURE__*/_$template(`<div data-slot=list-empty-state><div data-slot=list-message>`),
  _tmpl$9 = /*#__PURE__*/_$template(`<span data-slot=list-item-selected-icon>`),
  _tmpl$0 = /*#__PURE__*/_$template(`<button data-slot=list-item type=button>`),
  _tmpl$1 = /*#__PURE__*/_$template(`<span data-slot=list-item-active-icon>`),
  _tmpl$10 = /*#__PURE__*/_$template(`<span data-slot=list-item-divider>`);
import { useFilteredList } from "../hooks/index.js";
import { createEffect, For, on, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { makeEventListener } from "@solid-primitives/event-listener";
import { useI18n } from "../context/i18n.js";
import { Icon } from "./icon.js";
import { IconButton } from "./icon-button.js";
import { TextField } from "./text-field.js";
function findByKey(container, key) {
  const nodes = container.querySelectorAll('[data-slot="list-item"][data-key]');
  for (const node of nodes) {
    if (node.getAttribute("data-key") === key) return node;
  }
}
export function List(props) {
  const i18n = useI18n();
  let inputRef;
  const [store, setStore] = createStore({
    mouseActive: false,
    scrollRef: undefined,
    internalFilter: ""
  });
  const scrollRef = () => store.scrollRef;
  const setScrollRef = el => setStore("scrollRef", el);
  const internalFilter = () => store.internalFilter;
  const setInternalFilter = value => setStore("internalFilter", value);
  const scrollIntoView = (container, node, block) => {
    const containerRect = container.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    const top = nodeRect.top - containerRect.top + container.scrollTop;
    const bottom = top + nodeRect.height;
    const viewTop = container.scrollTop;
    const viewBottom = viewTop + container.clientHeight;
    const target = block === "center" ? top - container.clientHeight / 2 + nodeRect.height / 2 : top < viewTop ? top : bottom > viewBottom ? bottom - container.clientHeight : viewTop;
    const max = Math.max(0, container.scrollHeight - container.clientHeight);
    container.scrollTop = Math.max(0, Math.min(target, max));
  };
  const {
    filter,
    grouped,
    flat,
    active,
    setActive,
    onKeyDown,
    onInput,
    refetch
  } = useFilteredList(props);
  const searchProps = () => typeof props.search === "object" ? props.search : {};
  const searchAction = () => searchProps().action;
  const addProps = () => props.add;
  const showAdd = () => !!addProps();
  const moved = event => event.movementX !== 0 || event.movementY !== 0;
  const applyFilter = (value, options) => {
    const prev = filter();
    setInternalFilter(value);
    onInput(value);
    props.onFilter?.(value);
    if (!options?.ref) return;

    // Force a refetch even if the value is unchanged.
    // This is important for programmatic changes like Tab completion.
    if (prev === value) {
      void refetch();
      return;
    }
    queueMicrotask(() => refetch());
  };
  createEffect(() => {
    if (props.filter === undefined) return;
    if (props.filter === internalFilter()) return;
    setInternalFilter(props.filter);
    onInput(props.filter);
  });
  createEffect(on(filter, () => {
    scrollRef()?.scrollTo(0, 0);
  }, {
    defer: true
  }));
  createEffect(() => {
    const scroll = scrollRef();
    if (!scroll) return;
    if (!props.current) return;
    const key = props.key(props.current);
    requestAnimationFrame(() => {
      const element = findByKey(scroll, key);
      if (!element) return;
      scrollIntoView(scroll, element, "center");
    });
  });
  createEffect(() => {
    const all = flat();
    if (store.mouseActive || all.length === 0) return;
    const scroll = scrollRef();
    if (!scroll) return;
    if (active() === props.key(all[0])) {
      scroll.scrollTo(0, 0);
      return;
    }
    const key = active();
    if (!key) return;
    const element = findByKey(scroll, key);
    if (!element) return;
    scrollIntoView(scroll, element, "center");
  });
  createEffect(() => {
    const all = flat();
    const current = active();
    const item = all.find(x => props.key(x) === current);
    props.onMove?.(item);
  });
  const handleSelect = (item, index) => {
    props.onSelect?.(item, index);
  };
  const handleKey = e => {
    setStore("mouseActive", false);
    if (e.key === "Escape") return;
    const all = flat();
    const selected = all.find(x => props.key(x) === active());
    const index = selected ? all.indexOf(selected) : -1;
    props.onKeyEvent?.(e, selected);
    if (e.defaultPrevented) return;
    if (e.key === "Enter" && !e.isComposing) {
      e.preventDefault();
      if (selected) handleSelect(selected, index);
    } else if (props.search) {
      if (e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && (e.key === "n" || e.key === "p")) {
        onKeyDown(e);
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        onKeyDown(e);
      }
    } else {
      onKeyDown(e);
    }
  };
  props.ref?.({
    onKeyDown: handleKey,
    setScrollRef,
    setFilter: value => applyFilter(value, {
      ref: true
    })
  });
  const renderAdd = () => {
    const add = addProps();
    if (!add) return null;
    return (() => {
      var _el$ = _tmpl$();
      _$insert(_el$, () => add.render());
      _$effect(_$p => _$classList(_el$, {
        [add.class ?? ""]: !!add.class
      }, _$p));
      return _el$;
    })();
  };
  function GroupHeader(groupProps) {
    const [state, setState] = createStore({
      stuck: false,
      header: undefined
    });
    createEffect(() => {
      const scroll = scrollRef();
      const node = state.header;
      if (!scroll || !node) return;
      const handler = () => {
        const rect = node.getBoundingClientRect();
        const scrollRect = scroll.getBoundingClientRect();
        setState("stuck", rect.top <= scrollRect.top + 1 && scroll.scrollTop > 0);
      };
      makeEventListener(scroll, "scroll", handler, {
        passive: true
      });
      handler();
    });
    return (() => {
      var _el$2 = _tmpl$2();
      _$use(el => setState("header", el), _el$2);
      _$insert(_el$2, () => props.groupHeader?.(groupProps.group) ?? groupProps.group.category);
      _$effect(() => _$setAttribute(_el$2, "data-stuck", state.stuck));
      return _el$2;
    })();
  }
  const emptyMessage = () => {
    if (grouped.loading) return props.loadingMessage ?? i18n.t("ui.list.loading");
    if (props.emptyMessage) return props.emptyMessage;
    const query = filter();
    if (!query) return i18n.t("ui.list.empty");
    const suffix = i18n.t("ui.list.emptyWithFilter.suffix");
    return [(() => {
      var _el$3 = _tmpl$3();
      _$insert(_el$3, () => i18n.t("ui.list.emptyWithFilter.prefix"));
      return _el$3;
    })(), (() => {
      var _el$4 = _tmpl$4(),
        _el$5 = _el$4.firstChild,
        _el$7 = _el$5.nextSibling,
        _el$6 = _el$7.nextSibling;
      _$insert(_el$4, query, _el$7);
      return _el$4;
    })(), _$createComponent(Show, {
      when: suffix,
      get children() {
        var _el$8 = _tmpl$3();
        _$insert(_el$8, suffix);
        return _el$8;
      }
    })];
  };
  return (() => {
    var _el$9 = _tmpl$7(),
      _el$11 = _el$9.firstChild;
    _$insert(_el$9, _$createComponent(Show, {
      get when() {
        return !!props.search;
      },
      get children() {
        var _el$0 = _tmpl$5(),
          _el$1 = _el$0.firstChild,
          _el$10 = _el$1.firstChild;
        _el$1.$$pointerdown = event => {
          const container = event.currentTarget;
          if (!(container instanceof HTMLElement)) return;
          const node = container.querySelector("input, textarea");
          const input = node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement ? node : inputRef;
          input?.focus();

          // Prevent global listeners (e.g. dnd sensors) from cancelling focus.
          event.stopPropagation();
        };
        _$insert(_el$10, _$createComponent(Show, {
          get when() {
            return !searchProps().hideIcon;
          },
          get children() {
            return _$createComponent(Icon, {
              name: "magnifying-glass"
            });
          }
        }), null);
        _$insert(_el$10, _$createComponent(TextField, {
          get autofocus() {
            return searchProps().autofocus;
          },
          variant: "ghost",
          "data-slot": "list-search-input",
          type: "text",
          ref: el => {
            inputRef = el;
          },
          get value() {
            return internalFilter();
          },
          onChange: value => applyFilter(value),
          onKeyDown: handleKey,
          get placeholder() {
            return searchProps().placeholder;
          },
          spellcheck: false,
          autocorrect: "off",
          autocomplete: "off",
          autocapitalize: "off"
        }), null);
        _$insert(_el$1, _$createComponent(Show, {
          get when() {
            return internalFilter();
          },
          get children() {
            return _$createComponent(IconButton, {
              icon: "circle-x",
              variant: "ghost",
              onClick: () => {
                setInternalFilter("");
                queueMicrotask(() => inputRef?.focus());
              },
              get ["aria-label"]() {
                return i18n.t("ui.list.clearFilter");
              }
            });
          }
        }), null);
        _$insert(_el$0, searchAction, null);
        _$effect(_$p => _$classList(_el$1, {
          [searchProps().class ?? ""]: !!searchProps().class
        }, _$p));
        return _el$0;
      }
    }), _el$11);
    _$use(setScrollRef, _el$11);
    _$insert(_el$11, _$createComponent(Show, {
      get when() {
        return flat().length > 0 || showAdd();
      },
      get fallback() {
        return (() => {
          var _el$14 = _tmpl$8(),
            _el$15 = _el$14.firstChild;
          _$insert(_el$15, emptyMessage);
          return _el$14;
        })();
      },
      get children() {
        return [_$createComponent(For, {
          get each() {
            return grouped.latest;
          },
          children: (group, groupIndex) => {
            const isLastGroup = () => groupIndex() === grouped.latest.length - 1;
            return (() => {
              var _el$16 = _tmpl$6(),
                _el$17 = _el$16.firstChild;
              _$insert(_el$16, _$createComponent(Show, {
                get when() {
                  return group.category;
                },
                get children() {
                  return _$createComponent(GroupHeader, {
                    group: group
                  });
                }
              }), _el$17);
              _$insert(_el$17, _$createComponent(For, {
                get each() {
                  return group.items;
                },
                children: (item, i) => {
                  const node = (() => {
                    var _el$18 = _tmpl$0();
                    _el$18.addEventListener("mouseleave", () => {
                      if (!store.mouseActive) return;
                      setActive(null);
                    });
                    _el$18.$$mousemove = event => {
                      if (!moved(event)) return;
                      setStore("mouseActive", true);
                      setActive(props.key(item));
                    };
                    _el$18.$$keydown = handleKey;
                    _el$18.$$click = () => handleSelect(item, i());
                    _$insert(_el$18, () => props.children(item), null);
                    _$insert(_el$18, _$createComponent(Show, {
                      get when() {
                        return item === props.current;
                      },
                      get children() {
                        var _el$19 = _tmpl$9();
                        _$insert(_el$19, _$createComponent(Icon, {
                          name: "check-small"
                        }));
                        return _el$19;
                      }
                    }), null);
                    _$insert(_el$18, _$createComponent(Show, {
                      get when() {
                        return props.activeIcon;
                      },
                      children: icon => (() => {
                        var _el$20 = _tmpl$1();
                        _$insert(_el$20, _$createComponent(Icon, {
                          get name() {
                            return icon();
                          }
                        }));
                        return _el$20;
                      })()
                    }), null);
                    _$insert(_el$18, (() => {
                      var _c$ = _$memo(() => !!(props.divider && (i() !== group.items.length - 1 || showAdd() && isLastGroup())));
                      return () => _c$() && _tmpl$10();
                    })(), null);
                    _$effect(_p$ => {
                      var _v$ = props.key(item),
                        _v$2 = props.key(item) === active(),
                        _v$3 = item === props.current;
                      _v$ !== _p$.e && _$setAttribute(_el$18, "data-key", _p$.e = _v$);
                      _v$2 !== _p$.t && _$setAttribute(_el$18, "data-active", _p$.t = _v$2);
                      _v$3 !== _p$.a && _$setAttribute(_el$18, "data-selected", _p$.a = _v$3);
                      return _p$;
                    }, {
                      e: undefined,
                      t: undefined,
                      a: undefined
                    });
                    return _el$18;
                  })();
                  if (props.itemWrapper) return props.itemWrapper(item, node);
                  return node;
                }
              }), null);
              _$insert(_el$17, _$createComponent(Show, {
                get when() {
                  return _$memo(() => !!showAdd())() && isLastGroup();
                },
                get children() {
                  return renderAdd();
                }
              }), null);
              return _el$16;
            })();
          }
        }), _$createComponent(Show, {
          get when() {
            return _$memo(() => grouped.latest.length === 0)() && showAdd();
          },
          get children() {
            var _el$12 = _tmpl$6(),
              _el$13 = _el$12.firstChild;
            _$insert(_el$13, renderAdd);
            return _el$12;
          }
        })];
      }
    }));
    _$effect(_$p => _$classList(_el$9, {
      [props.class ?? ""]: !!props.class
    }, _$p));
    return _el$9;
  })();
}
_$delegateEvents(["pointerdown", "click", "keydown", "mousemove"]);