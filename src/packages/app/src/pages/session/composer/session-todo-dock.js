import { AnimatedNumber } from "@/vendor/ui/components/animated-number.js";
import { Checkbox } from "@/vendor/ui/components/checkbox.js";
import { DockTray } from "@/vendor/ui/components/dock-surface.js";
import { IconButton } from "@/bs/icon-button.js";
import { useSpring } from "@/vendor/ui/components/motion-spring.js";
import { TextReveal } from "@/vendor/ui/components/text-reveal.js";
import { TextStrikethrough } from "@/vendor/ui/components/text-strikethrough.js";
import { createResizeObserver } from "@/lib/primitives/resize-observer.js";
import { Index, createComponent, createEffect, createMemo, createRenderEffect } from "solid-js";
import { createStore } from "solid-js/store";
import { useLanguage } from "@/context/language.js";
const doneToken = "\u0000done\u0000";
const totalToken = "\u0000total\u0000";

// Build a detached element from compact HTML (static markup only — dynamic
// text always flows through textContent / component props, never string
// interpolation).
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  return wrapper.firstElementChild;
}

// Resolve Solid-style children to DOM nodes: unwrap zero-arg accessors,
// flatten arrays, keep Nodes, stringify the rest.
function resolveNodes(value) {
  if (value == null || value === true || value === false) return [];
  if (typeof value === "function" && !value.length) return resolveNodes(value());
  if (Array.isArray(value)) return value.flatMap(resolveNodes);
  if (value instanceof Node) return [value];
  return [document.createTextNode(String(value))];
}

// Live insertion for <Index> results into a parent that has no other
// children. Nodes already in position are left untouched — mirroring the
// compiled insert()'s array reconciliation — so an Index memo re-emitting the
// same nodes never restarts in-flight CSS transitions or disturbs the
// scrolled list.
function liveInsert(parent, accessor) {
  let current = [];
  createRenderEffect(() => {
    const nodes = resolveNodes(accessor());
    const stale = new Set(current);
    for (const node of nodes) stale.delete(node);
    for (const node of stale) node.remove();
    let ref = null;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i];
      if (node.parentNode !== parent || node.nextSibling !== ref) {
        parent.insertBefore(node, ref);
      }
      ref = node;
    }
    current = nodes;
  });
}

// Pulsing in-progress marker (compiled _tmpl$).
function dot(status) {
  if (status !== "in_progress") return undefined;
  return template(`<svg viewBox="0 0 12 12" width="12" height="12" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="block"><circle cx="6" cy="6" r="3" style="animation:var(--animate-pulse-scale);transform-origin:center;transform-box:fill-box"></circle></svg>`);
}
export function SessionTodoDock(props) {
  const language = useLanguage();
  const [store, setStore] = createStore({
    collapsed: false,
    height: 320
  });
  const toggle = () => setStore("collapsed", value => !value);
  const total = createMemo(() => props.todos.length);
  const done = createMemo(() => props.todos.filter(todo => todo.status === "completed").length);
  const label = createMemo(() => language.t("session.todo.progress", {
    done: done(),
    total: total()
  }));
  const progress = createMemo(() => language.t("session.todo.progress", {
    done: doneToken,
    total: totalToken
  }).split(/(\u0000done\u0000|\u0000total\u0000)/));
  const active = createMemo(() => props.todos.find(todo => todo.status === "in_progress") ?? props.todos.find(todo => todo.status === "pending") ?? props.todos.filter(todo => todo.status === "completed").at(-1) ?? props.todos[0]);
  const preview = createMemo(() => active()?.content ?? "");
  const collapse = useSpring(() => store.collapsed ? 1 : 0, {
    visualDuration: 0.3,
    bounce: 0
  });
  const dock = createMemo(() => Math.max(0, Math.min(1, props.dockProgress)));
  const shut = createMemo(() => 1 - dock());
  const value = createMemo(() => Math.max(0, Math.min(1, collapse())));
  const hide = createMemo(() => Math.max(value(), shut()));
  const off = createMemo(() => hide() > 0.98);
  const turn = createMemo(() => Math.max(0, Math.min(1, value())));
  const full = createMemo(() => Math.max(78, store.height));
  let contentRef;
  createEffect(() => {
    const el = contentRef;
    if (!el) return;
    const update = () => {
      setStore("height", el.getBoundingClientRect().height);
    };
    update();
    createResizeObserver(el, update);
  });
  return createComponent(DockTray, {
    "data-component": "session-todo-dock",
    get style() {
      return {
        "overflow-x": "visible",
        "overflow-y": "hidden",
        "max-height": `${Math.max(78, full() - value() * (full() - 78))}px`
      };
    },
    get children() {
      // Static skeleton mirroring the compiled _tmpl$2:
      //   <div> (root, ref target)
      //     <div data-action=session-todo-toggle> (header row)
      //       <span> (progress label)  <div data-slot=session-todo-preview>
      //       <div class=ml-auto> (toggle button)
      //     <div data-slot=session-todo-list>
      const root = template(
        `<div>` +
          `<div data-action="session-todo-toggle" class="pl-3 pr-2 py-2 d-flex align-items-center gap-2 overflow-visible" role="button" tabindex="0">` +
            `<span class="text-body-emphasis cursor-default inline-flex items-baseline shrink-0 overflow-visible" style="--tool-motion-odometer-ms:600ms;--tool-motion-mask:18%;--tool-motion-mask-height:0px;--tool-motion-spring-ms:560ms;white-space:pre"></span>` +
            `<div data-slot="session-todo-preview" class="ml-1 min-w-0 overflow-hidden" style="flex:1 1 auto;max-width:100%"></div>` +
            `<div class="ml-auto"></div>` +
          `</div>` +
          `<div data-slot="session-todo-list"></div>` +
        `</div>`
      );
      const header = root.firstChild;
      const labelEl = header.firstChild;
      const previewEl = labelEl.nextSibling;
      const actionsEl = previewEl.nextSibling;
      const listEl = header.nextSibling;
      contentRef = root; // ref binding (replaces the compiled use:ref)
      // Compiled used delegated $$click/$$keydown on the header row; direct
      // listeners keep the same outcome (the inner IconButton stops
      // propagation before these fire).
      header.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        toggle();
      });
      header.addEventListener("click", toggle);
      // Progress label parts. The Index children callback is evaluated once
      // per index (as compiled): counters stay AnimatedNumber instances with
      // live value getters; plain parts keep a live text effect.
      liveInsert(labelEl, createComponent(Index, {
        get each() {
          return progress();
        },
        children: item => item() === doneToken ? createComponent(AnimatedNumber, {
          get value() {
            return done();
          }
        }) : item() === totalToken ? createComponent(AnimatedNumber, {
          get value() {
            return total();
          }
        }) : (() => {
          const part = document.createElement("span");
          createRenderEffect(() => {
            part.textContent = item();
          });
          return part;
        })()
      }));
      previewEl.appendChild(createComponent(TextReveal, {
        "class": "text-body cursor-default",
        get text() {
          return store.collapsed ? preview() : undefined;
        },
        duration: 600,
        travel: 25,
        edge: 17,
        spring: "cubic-bezier(0.34, 1, 0.64, 1)",
        springSoft: "cubic-bezier(0.34, 1, 0.64, 1)",
        growOnly: true,
        truncate: true
      }));
      actionsEl.appendChild(createComponent(IconButton, {
        "data-action": "session-todo-toggle-button",
        get ["data-collapsed"]() {
          return store.collapsed ? "true" : "false";
        },
        icon: "chevron-down",
        size: "normal",
        variant: "ghost",
        get style() {
          return {
            transform: `rotate(${turn() * 180}deg)`
          };
        },
        onMouseDown: event => {
          event.preventDefault();
          event.stopPropagation();
        },
        onClick: event => {
          event.stopPropagation();
          toggle();
        },
        get ["aria-label"]() {
          return store.collapsed ? props.expandLabel : props.collapseLabel;
        }
      }));
      listEl.appendChild(createComponent(TodoList, {
        get todos() {
          return props.todos;
        }
      }));
      // Change-guarded dynamic attributes / styles, like the compiled
      // effect(): an unchanged value never re-touches the DOM.
      let prevLabel;
      let prevLabelOpacity;
      let prevListHidden;
      let prevListPointer;
      let prevListVisibility;
      let prevListOpacity;
      createRenderEffect(() => {
        const nextLabel = label();
        const nextLabelOpacity = `${Math.max(0, Math.min(1, 1 - shut()))}`;
        const nextListHidden = store.collapsed || off();
        const nextListPointer = !!(hide() > 0.1);
        const nextListVisibility = off() ? "hidden" : "visible";
        const nextListOpacity = `${Math.max(0, Math.min(1, 1 - hide()))}`;
        if (nextLabel !== prevLabel) labelEl.setAttribute("aria-label", prevLabel = nextLabel);
        if (nextLabelOpacity !== prevLabelOpacity) labelEl.style.setProperty("opacity", prevLabelOpacity = nextLabelOpacity);
        if (nextListHidden !== prevListHidden) listEl.setAttribute("aria-hidden", prevListHidden = nextListHidden);
        if (nextListPointer !== prevListPointer) listEl.classList.toggle("pointer-events-none", prevListPointer = nextListPointer);
        if (nextListVisibility !== prevListVisibility) listEl.style.setProperty("visibility", prevListVisibility = nextListVisibility);
        if (nextListOpacity !== prevListOpacity) listEl.style.setProperty("opacity", prevListOpacity = nextListOpacity);
      });
      return root;
    }
  });
}
function TodoList(props) {
  const [store, setStore] = createStore({
    stuck: false
  });
  // Static skeleton mirroring the compiled _tmpl$4: scrollable column + top
  // scroll-shadow overlay.
  const root = template(
    `<div class="relative">` +
      `<div class="px-3 pb-11 d-flex flex-column gap-1.5 max-h-42 overflow-y-auto no-scrollbar" style="overflow-anchor:none"></div>` +
      `<div class="pointer-events-none absolute top-0 left-0 right-0 h-4 transition-opacity duration-150" style="background:linear-gradient(to bottom, var(--background-base), transparent)"></div>` +
    `</div>`
  );
  const scroller = root.firstChild;
  const shadow = scroller.nextSibling;
  scroller.addEventListener("scroll", e => {
    setStore("stuck", e.currentTarget.scrollTop > 0);
  });
  liveInsert(scroller, createComponent(Index, {
    get each() {
      return props.todos;
    },
    children: todo => createComponent(Checkbox, {
      readOnly: true,
      get checked() {
        return todo().status === "completed";
      },
      get indeterminate() {
        return todo().status === "in_progress";
      },
      get ["data-in-progress"]() {
        return todo().status === "in_progress" ? "" : undefined;
      },
      get ["data-state"]() {
        return todo().status;
      },
      get icon() {
        return dot(todo().status);
      },
      get style() {
        return {
          "--checkbox-align": "flex-start",
          "--checkbox-offset": "1px",
          transition: "opacity 220ms var(--tool-motion-ease, cubic-bezier(0.22, 1, 0.36, 1))",
          opacity: todo().status === "pending" ? "0.94" : "1"
        };
      },
      get children() {
        return createComponent(TextStrikethrough, {
          get active() {
            return todo().status === "completed" || todo().status === "cancelled";
          },
          get text() {
            return todo().content;
          },
          "class": "min-w-0 break-words",
          get style() {
            return {
              "line-height": "var(--line-height-normal)",
              transition: "color 220ms var(--tool-motion-ease, cubic-bezier(0.22, 1, 0.36, 1)), opacity 220ms var(--tool-motion-ease, cubic-bezier(0.22, 1, 0.36, 1))",
              color: todo().status === "completed" || todo().status === "cancelled" ? "var(--text-weak)" : "var(--text-strong)",
              opacity: todo().status === "pending" ? "0.92" : "1"
            };
          }
        });
      }
    })
  }));
  createRenderEffect(() => {
    shadow.style.setProperty("opacity", store.stuck ? 1 : 0);
  });
  return root;
}
