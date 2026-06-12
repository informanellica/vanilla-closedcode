import { insert as _solidInsert } from "solid-js/web";
import { For, Show, createComponent, createEffect, createMemo, createRenderEffect, on, onCleanup, onMount } from "solid-js";
import { createStore } from "solid-js/store";
import { makeEventListener } from "@/lib/primitives/event-listener.js";
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

// Build a detached element from compact HTML (no inter-element whitespace,
// matching the compiled Solid templates). Built fresh per call: no cloneNode.
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  return wrapper.firstElementChild;
}
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

  // Loading fallback (_tmpl$4): ghost tab bar from the previous visit's
  // handoff labels plus the localized loading message. Built lazily by the
  // Show fallback getter, so the effects below live under that branch and
  // are disposed when the terminal context becomes ready.
  const buildFallback = () => {
    const fb = template(`<div class="d-flex flex-column h-full pointer-events-none"><div class="h-10 d-flex align-items-center gap-2 px-2 border-b border bg-body overflow-hidden"><div class="flex-1"></div><div class="text-secondary pr-2"></div></div><div class="flex-1 d-flex align-items-center justify-content-center text-secondary"></div></div>`);
    const bar = fb.firstChild;
    const spacer = bar.firstChild;
    const counter = spacer.nextSibling;
    const message = bar.nextSibling;
    // Replaces For over handoff(): labels are plain strings keyed only by
    // params.dir, so a full rebuild before the spacer is equivalent.
    let ghosts = [];
    createRenderEffect(() => {
      const next = handoff().map(title => {
        const ghost = template(`<div class="px-2 py-1 rounded-2 bg-body-tertiary fw-normal text-secondary truncate max-w-40"></div>`);
        ghost.textContent = title;
        return ghost;
      });
      for (const el of ghosts) el.remove();
      ghosts = next;
      for (const el of next) bar.insertBefore(el, spacer);
    });
    createRenderEffect(() => {
      counter.textContent = language.t("common.loading") + language.t("common.loading.ellipsis");
    });
    createRenderEffect(() => {
      message.textContent = language.t("terminal.loading");
    });
    return fb;
  };

  // "New terminal" tab-bar cell (_tmpl$).
  const buildNewTabButton = () => {
    const cell = template(`<div class="h-full d-flex align-items-center justify-content-center"></div>`);
    cell.appendChild(createComponent(TooltipKeybind, {
      get title() {
        return language.t("command.terminal.new");
      },
      get keybind() {
        return command.keybind("terminal.new");
      },
      "class": "d-flex align-items-center",
      get children() {
        return createComponent(IconButton, {
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
    return cell;
  };

  // Tab strip + active terminal body (_tmpl$2).
  const buildTerminalArea = () => {
    const area = template(`<div class="d-flex flex-column h-full"><div class="flex-1 min-h-0 position-relative"></div></div>`);
    const body = area.firstChild;
    // Tabs (bs/tabs.js) returns a concrete element; place it above the body.
    area.insertBefore(createComponent(Tabs, {
      variant: "alt",
      get value() {
        return terminal.active();
      },
      onChange: id => terminal.open(id),
      "class": "!h-auto !flex-none",
      get children() {
        return createComponent(Tabs.List, {
          "class": "h-10 border-b border",
          get children() {
            return [createComponent(SortableProvider, {
              get ids() {
                return ids();
              },
              get children() {
                // Runtime For keeps tab nodes stable across reorders, which
                // solid-dnd's sortable transforms rely on.
                return createComponent(For, {
                  get each() {
                    return all();
                  },
                  children: pty => createComponent(SortableTerminalTab, {
                    terminal: pty,
                    onClose: close
                  })
                });
              }
            }), buildNewTabButton()];
          }
        });
      }
    }), body);
    // Keyed Show: remount the wrapper (and Terminal) per active id; the inner
    // non-keyed Show keeps it mounted while the pty still exists, feeding the
    // live pty accessor through the props getter. insert() reconciles so the
    // terminal node is never re-attached without an actual branch change.
    _solidInsert(body, createComponent(Show, {
      get when() {
        return terminal.active();
      },
      keyed: true,
      children: id => {
        const ops = terminal.bind();
        return createComponent(Show, {
          get when() {
            return all().find(pty => pty.id === id);
          },
          children: pty => {
            const wrapper = template(`<div class="position-absolute inset-0"></div>`);
            wrapper.id = `terminal-wrapper-${id}`;
            wrapper.appendChild(createComponent(Terminal, {
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
            return wrapper;
          }
        });
      }
    }));
    return area;
  };

  // Ready branch: solid-dnd providers wrapping the terminal area and the
  // drag overlay (a floating copy of the dragged tab's label, _tmpl$7).
  const buildReady = () => createComponent(DragDropProvider, {
    onDragStart: handleTerminalDragStart,
    onDragEnd: handleTerminalDragEnd,
    onDragOver: handleTerminalDragOver,
    collisionDetector: closestCenter,
    get children() {
      return [createComponent(DragDropSensors, {}), createComponent(ConstrainDragYAxis, {}), buildTerminalArea(), createComponent(DragOverlay, {
        get children() {
          return createComponent(Show, {
            get when() {
              return store.activeDraggable;
            },
            keyed: true,
            children: id => createComponent(Show, {
              get when() {
                return all().find(pty => pty.id === id);
              },
              children: t => {
                const label = template(`<div class="position-relative p-1 h-10 d-flex align-items-center bg-body fw-normal"></div>`);
                // terminalTabLabel returns a translated string; keep it live
                // across title/locale changes while dragging.
                createRenderEffect(() => {
                  label.textContent = terminalTabLabel({
                    title: t().title,
                    titleNumber: t().titleNumber,
                    t: language.t
                  });
                });
                return label;
              }
            })
          });
        }
      })];
    }
  });

  // Static skeleton (_tmpl$3): panel root > absolute column > resize-handle
  // host (hidden below md).
  const rootEl = template(`<div id="terminal-panel" role="region" class="position-relative w-100 shrink-0 overflow-hidden bg-body"><div class="position-absolute inset-x-0 top-0 d-flex flex-column"><div class="d-none md:block"></div></div></div>`);
  const column = rootEl.firstChild;
  const handleWrap = column.firstChild;
  // Ref binding: the local `root` is only ever undefined or an element.
  root = rootEl;
  // Compiled delegated $$pointerdown -> direct listener (pointerdown always
  // precedes the handle's own mousedown handling, so ordering is unchanged).
  handleWrap.addEventListener("pointerdown", () => size.start());
  handleWrap.appendChild(createComponent(ResizeHandle, {
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
  // Ready/loading switch appended after the resize-handle host. insert() with
  // a null marker keeps append semantics and reconciles the provider output
  // (sensors/overlay markers + the area element) without remounting it.
  _solidInsert(column, createComponent(Show, {
    get when() {
      return terminal.ready();
    },
    get fallback() {
      return buildFallback();
    },
    get children() {
      return buildReady();
    }
  }), null);
  // Change-guarded reactive attributes/classes/styles, mirroring the compiled
  // effect() block.
  const animationClasses = ["transition-[height]", "duration-200", "ease-[cubic-bezier(0.22,1,0.36,1)]", "will-change-[height]", "motion-reduce:transition-none"];
  let prevLabel;
  let prevHidden;
  let prevInert;
  let prevBorder;
  let prevAnimate;
  let prevRootHeight;
  let prevPointer;
  let prevColumnHeight;
  createRenderEffect(() => {
    const label = language.t("terminal.title");
    const hidden = !opened();
    const border = opened();
    const animate = !size.active();
    const rootHeight = opened() ? `${pane()}px` : "0px";
    const columnHeight = `${pane()}px`;
    if (label !== prevLabel) rootEl.setAttribute("aria-label", prevLabel = label);
    if (hidden !== prevHidden) rootEl.setAttribute("aria-hidden", prevHidden = hidden);
    if (hidden !== prevInert) rootEl.inert = prevInert = hidden;
    if (border !== prevBorder) {
      prevBorder = border;
      rootEl.classList.toggle("border-t", border);
      rootEl.classList.toggle("border", border);
    }
    if (animate !== prevAnimate) {
      prevAnimate = animate;
      for (const cls of animationClasses) rootEl.classList.toggle(cls, animate);
    }
    if (rootHeight !== prevRootHeight) rootEl.style.setProperty("height", prevRootHeight = rootHeight);
    if (hidden !== prevPointer) column.classList.toggle("pointer-events-none", prevPointer = hidden);
    if (columnHeight !== prevColumnHeight) column.style.setProperty("height", prevColumnHeight = columnHeight);
  });
  return rootEl;
}
