import { template as _$template } from "solid-js/web";
import { delegateEvents as _$delegateEvents } from "solid-js/web";
import { setStyleProperty as _$setStyleProperty } from "solid-js/web";
import { classList as _$classList } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { use as _$use } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div class="h-full d-flex align-items-center justify-content-center">`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div class="d-flex flex-column h-full"><div class="flex-1 min-h-0 position-relative">`),
  _tmpl$3 = /*#__PURE__*/_$template(`<div id=terminal-panel role=region class="position-relative w-100 shrink-0 overflow-hidden bg-body"><div class="position-absolute inset-x-0 top-0 d-flex flex-column"><div class="d-none md:block">`),
  _tmpl$4 = /*#__PURE__*/_$template(`<div class="d-flex flex-column h-full pointer-events-none"><div class="h-10 d-flex align-items-center gap-2 px-2 border-b border bg-body overflow-hidden"><div class=flex-1></div><div class="text-secondary pr-2"></div></div><div class="flex-1 d-flex align-items-center justify-content-center text-secondary">`),
  _tmpl$5 = /*#__PURE__*/_$template(`<div class="px-2 py-1 rounded-2 bg-body-tertiary fw-normal text-secondary truncate max-w-40">`),
  _tmpl$6 = /*#__PURE__*/_$template(`<div class="position-absolute inset-0">`),
  _tmpl$7 = /*#__PURE__*/_$template(`<div class="position-relative p-1 h-10 d-flex align-items-center bg-body fw-normal">`);
import { For, Show, createEffect, createMemo, on, onCleanup, onMount } from "solid-js";
import { createStore } from "solid-js/store";
import { makeEventListener } from "@solid-primitives/event-listener";
import { Tabs } from "@/bs/tabs.js";
import { ResizeHandle } from "@/vendor/ui/components/resize-handle.js";
import { IconButton } from "@/bs/icon-button.js";
import { TooltipKeybind } from "@/bs/tooltip.js";
import { DragDropProvider, DragDropSensors, DragOverlay, SortableProvider, closestCenter } from "@thisbeyond/solid-dnd";
import { ConstrainDragYAxis, getDraggableId } from "@/utils/solid-dnd.js";
import { SortableTerminalTab } from "@/components/session/index.js";
import { Terminal } from "@/components/terminal.js";
import { useCommand } from "@/context/command.js";
import { useLanguage } from "@/context/language.js";
import { useLayout } from "@/context/layout.js";
import { useTerminal } from "@/context/terminal.js";
import { terminalTabLabel } from "@/pages/session/terminal-label.js";
import { createSizing, focusTerminalById } from "@/pages/session/helpers.js";
import { getTerminalHandoff, setTerminalHandoff } from "@/pages/session/handoff.js";
import { useSessionLayout } from "@/pages/session/session-layout.js";
export function TerminalPanel() {
  const delays = [120, 240];
  const layout = useLayout();
  const terminal = useTerminal();
  const language = useLanguage();
  const command = useCommand();
  const {
    params,
    view
  } = useSessionLayout();
  const opened = createMemo(() => view().terminal.opened());
  const size = createSizing();
  const height = createMemo(() => layout.terminal.height());
  const close = () => view().terminal.close();
  let root;
  const [store, setStore] = createStore({
    autoCreated: false,
    activeDraggable: undefined,
    view: typeof window === "undefined" ? 1000 : window.visualViewport?.height ?? window.innerHeight
  });
  const max = () => store.view * 0.6;
  const pane = () => Math.min(height(), max());
  onMount(() => {
    if (typeof window === "undefined") return;
    const sync = () => setStore("view", window.visualViewport?.height ?? window.innerHeight);
    const port = window.visualViewport;
    sync();
    makeEventListener(window, "resize", sync);
    if (port) makeEventListener(port, "resize", sync);
  });
  createEffect(() => {
    if (!opened()) {
      setStore("autoCreated", false);
      return;
    }
    if (!terminal.ready() || terminal.all().length !== 0 || store.autoCreated) return;
    terminal.new();
    setStore("autoCreated", true);
  });
  createEffect(on(() => terminal.all().length, (count, prevCount) => {
    if (prevCount === undefined || prevCount <= 0 || count !== 0) return;
    if (!opened()) return;
    close();
  }));
  const focus = id => {
    focusTerminalById(id);
    const frame = requestAnimationFrame(() => {
      if (!opened()) return;
      if (terminal.active() !== id) return;
      focusTerminalById(id);
    });
    const timers = delays.map(ms => window.setTimeout(() => {
      if (!opened()) return;
      if (terminal.active() !== id) return;
      focusTerminalById(id);
    }, ms));
    return () => {
      cancelAnimationFrame(frame);
      for (const timer of timers) clearTimeout(timer);
    };
  };
  createEffect(on(() => [opened(), terminal.active()], ([next, id]) => {
    if (!next || !id) return;
    const stop = focus(id);
    onCleanup(stop);
  }));
  createEffect(() => {
    if (opened()) return;
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return;
    if (!root?.contains(active)) return;
    active.blur();
  });
  createEffect(() => {
    const dir = params.dir;
    if (!dir) return;
    if (!terminal.ready()) return;
    language.locale();
    setTerminalHandoff(dir, terminal.all().map(pty => terminalTabLabel({
      title: pty.title,
      titleNumber: pty.titleNumber,
      t: language.t
    })));
  });
  const handoff = createMemo(() => {
    const dir = params.dir;
    if (!dir) return [];
    return getTerminalHandoff(dir) ?? [];
  });
  const all = terminal.all;
  const ids = createMemo(() => all().map(pty => pty.id));
  const handleTerminalDragStart = event => {
    const id = getDraggableId(event);
    if (!id) return;
    setStore("activeDraggable", id);
  };
  const handleTerminalDragOver = event => {
    const {
      draggable,
      droppable
    } = event;
    if (!draggable || !droppable) return;
    const terminals = terminal.all();
    const fromIndex = terminals.findIndex(t => t.id === draggable.id.toString());
    const toIndex = terminals.findIndex(t => t.id === droppable.id.toString());
    if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
      terminal.move(draggable.id.toString(), toIndex);
    }
  };
  const handleTerminalDragEnd = () => {
    setStore("activeDraggable", undefined);
    const activeId = terminal.active();
    if (!activeId) return;
    requestAnimationFrame(() => {
      if (terminal.active() !== activeId) return;
      focusTerminalById(activeId);
    });
  };
  return (() => {
    var _el$ = _tmpl$3(),
      _el$2 = _el$.firstChild,
      _el$3 = _el$2.firstChild;
    var _ref$ = root;
    typeof _ref$ === "function" ? _$use(_ref$, _el$) : root = _el$;
    _el$3.$$pointerdown = () => size.start();
    _$insert(_el$3, _$createComponent(ResizeHandle, {
      direction: "vertical",
      get size() {
        return pane();
      },
      min: 100,
      get max() {
        return max();
      },
      collapseThreshold: 50,
      onResize: next => {
        size.touch();
        layout.terminal.resize(next);
      },
      onCollapse: close
    }));
    _$insert(_el$2, _$createComponent(Show, {
      get when() {
        return terminal.ready();
      },
      get fallback() {
        return (() => {
          var _el$7 = _tmpl$4(),
            _el$8 = _el$7.firstChild,
            _el$9 = _el$8.firstChild,
            _el$0 = _el$9.nextSibling,
            _el$1 = _el$8.nextSibling;
          _$insert(_el$8, _$createComponent(For, {
            get each() {
              return handoff();
            },
            children: title => (() => {
              var _el$10 = _tmpl$5();
              _$insert(_el$10, title);
              return _el$10;
            })()
          }), _el$9);
          _$insert(_el$0, () => language.t("common.loading"), null);
          _$insert(_el$0, () => language.t("common.loading.ellipsis"), null);
          _$insert(_el$1, () => language.t("terminal.loading"));
          return _el$7;
        })();
      },
      get children() {
        return _$createComponent(DragDropProvider, {
          onDragStart: handleTerminalDragStart,
          onDragEnd: handleTerminalDragEnd,
          onDragOver: handleTerminalDragOver,
          collisionDetector: closestCenter,
          get children() {
            return [_$createComponent(DragDropSensors, {}), _$createComponent(ConstrainDragYAxis, {}), (() => {
              var _el$4 = _tmpl$2(),
                _el$6 = _el$4.firstChild;
              _$insert(_el$4, _$createComponent(Tabs, {
                variant: "alt",
                get value() {
                  return terminal.active();
                },
                onChange: id => terminal.open(id),
                "class": "!h-auto !flex-none",
                get children() {
                  return _$createComponent(Tabs.List, {
                    "class": "h-10 border-b border",
                    get children() {
                      return [_$createComponent(SortableProvider, {
                        get ids() {
                          return ids();
                        },
                        get children() {
                          return _$createComponent(For, {
                            get each() {
                              return all();
                            },
                            children: pty => _$createComponent(SortableTerminalTab, {
                              terminal: pty,
                              onClose: close
                            })
                          });
                        }
                      }), (() => {
                        var _el$5 = _tmpl$();
                        _$insert(_el$5, _$createComponent(TooltipKeybind, {
                          get title() {
                            return language.t("command.terminal.new");
                          },
                          get keybind() {
                            return command.keybind("terminal.new");
                          },
                          "class": "d-flex align-items-center",
                          get children() {
                            return _$createComponent(IconButton, {
                              icon: "plus-small",
                              variant: "ghost",
                              iconSize: "large",
                              get onClick() {
                                return terminal.new;
                              },
                              get ["aria-label"]() {
                                return language.t("command.terminal.new");
                              }
                            });
                          }
                        }));
                        return _el$5;
                      })()];
                    }
                  });
                }
              }), _el$6);
              _$insert(_el$6, _$createComponent(Show, {
                get when() {
                  return terminal.active();
                },
                keyed: true,
                children: id => {
                  const ops = terminal.bind();
                  return _$createComponent(Show, {
                    get when() {
                      return all().find(pty => pty.id === id);
                    },
                    children: pty => (() => {
                      var _el$11 = _tmpl$6();
                      _$setAttribute(_el$11, "id", `terminal-wrapper-${id}`);
                      _$insert(_el$11, _$createComponent(Terminal, {
                        get pty() {
                          return pty();
                        },
                        get autoFocus() {
                          return opened();
                        },
                        onConnect: () => ops.trim(id),
                        get onCleanup() {
                          return ops.update;
                        },
                        onConnectError: () => ops.clone(id)
                      }));
                      return _el$11;
                    })()
                  });
                }
              }));
              return _el$4;
            })(), _$createComponent(DragOverlay, {
              get children() {
                return _$createComponent(Show, {
                  get when() {
                    return store.activeDraggable;
                  },
                  keyed: true,
                  children: id => _$createComponent(Show, {
                    get when() {
                      return all().find(pty => pty.id === id);
                    },
                    children: t => (() => {
                      var _el$12 = _tmpl$7();
                      _$insert(_el$12, () => terminalTabLabel({
                        title: t().title,
                        titleNumber: t().titleNumber,
                        t: language.t
                      }));
                      return _el$12;
                    })()
                  })
                });
              }
            })];
          }
        });
      }
    }), null);
    _$effect(_p$ => {
      var _v$ = language.t("terminal.title"),
        _v$2 = !opened(),
        _v$3 = !opened(),
        _v$4 = {
          "border-t border": opened(),
          "transition-[height] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[height] motion-reduce:transition-none": !size.active()
        },
        _v$5 = opened() ? `${pane()}px` : "0px",
        _v$6 = !opened(),
        _v$7 = `${pane()}px`;
      _v$ !== _p$.e && _$setAttribute(_el$, "aria-label", _p$.e = _v$);
      _v$2 !== _p$.t && _$setAttribute(_el$, "aria-hidden", _p$.t = _v$2);
      _v$3 !== _p$.a && (_el$.inert = _p$.a = _v$3);
      _p$.o = _$classList(_el$, _v$4, _p$.o);
      _v$5 !== _p$.i && _$setStyleProperty(_el$, "height", _p$.i = _v$5);
      _v$6 !== _p$.n && _el$2.classList.toggle("pointer-events-none", _p$.n = _v$6);
      _v$7 !== _p$.s && _$setStyleProperty(_el$2, "height", _p$.s = _v$7);
      return _p$;
    }, {
      e: undefined,
      t: undefined,
      a: undefined,
      o: undefined,
      i: undefined,
      n: undefined,
      s: undefined
    });
    return _el$;
  })();
}
_$delegateEvents(["pointerdown"]);