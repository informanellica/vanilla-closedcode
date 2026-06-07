import { template as _$template } from "solid-js/web";
import { delegateEvents as _$delegateEvents } from "solid-js/web";
import { setStyleProperty as _$setStyleProperty } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { use as _$use } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<svg viewBox="0 0 12 12"width=12 height=12 fill=currentColor xmlns=http://www.w3.org/2000/svg class=block><circle cx=6 cy=6 r=3 style=animation:var(--animate-pulse-scale);transform-origin:center;transform-box:fill-box>`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div><div data-action=session-todo-toggle class="pl-3 pr-2 py-2 d-flex align-items-center gap-2 overflow-visible"role=button tabindex=0><span class="text-body-emphasis cursor-default inline-flex items-baseline shrink-0 overflow-visible"style=--tool-motion-odometer-ms:600ms;--tool-motion-mask:18%;--tool-motion-mask-height:0px;--tool-motion-spring-ms:560ms;white-space:pre></span><div data-slot=session-todo-preview class="ml-1 min-w-0 overflow-hidden"style="flex:1 1 auto;max-width:100%"></div><div class=ml-auto></div></div><div data-slot=session-todo-list>`),
  _tmpl$3 = /*#__PURE__*/_$template(`<span>`),
  _tmpl$4 = /*#__PURE__*/_$template(`<div class=relative><div class="px-3 pb-11 d-flex flex-column gap-1.5 max-h-42 overflow-y-auto no-scrollbar"style=overflow-anchor:none></div><div class="pointer-events-none absolute top-0 left-0 right-0 h-4 transition-opacity duration-150"style="background:linear-gradient(to bottom, var(--background-base), transparent)">`);
import { AnimatedNumber } from "@/vendor/ui/components/animated-number.js";
import { Checkbox } from "@/vendor/ui/components/checkbox.js";
import { DockTray } from "@/vendor/ui/components/dock-surface.js";
import { IconButton } from "@/bs/icon-button.js";
import { useSpring } from "@/vendor/ui/components/motion-spring.js";
import { TextReveal } from "@/vendor/ui/components/text-reveal.js";
import { TextStrikethrough } from "@/vendor/ui/components/text-strikethrough.js";
import { createResizeObserver } from "@solid-primitives/resize-observer";
import { Index, createEffect, createMemo } from "solid-js";
import { createStore } from "solid-js/store";
import { useLanguage } from "@/context/language.js";
const doneToken = "\u0000done\u0000";
const totalToken = "\u0000total\u0000";
function dot(status) {
  if (status !== "in_progress") return undefined;
  return (() => {
    var _el$ = _tmpl$(),
      _el$2 = _el$.firstChild;
    return _el$;
  })();
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
  return _$createComponent(DockTray, {
    "data-component": "session-todo-dock",
    get style() {
      return {
        "overflow-x": "visible",
        "overflow-y": "hidden",
        "max-height": `${Math.max(78, full() - value() * (full() - 78))}px`
      };
    },
    get children() {
      var _el$3 = _tmpl$2(),
        _el$4 = _el$3.firstChild,
        _el$5 = _el$4.firstChild,
        _el$6 = _el$5.nextSibling,
        _el$7 = _el$6.nextSibling,
        _el$8 = _el$4.nextSibling;
      var _ref$ = contentRef;
      typeof _ref$ === "function" ? _$use(_ref$, _el$3) : contentRef = _el$3;
      _el$4.$$keydown = event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        toggle();
      };
      _el$4.$$click = toggle;
      _$insert(_el$5, _$createComponent(Index, {
        get each() {
          return progress();
        },
        children: item => item() === doneToken ? _$createComponent(AnimatedNumber, {
          get value() {
            return done();
          }
        }) : item() === totalToken ? _$createComponent(AnimatedNumber, {
          get value() {
            return total();
          }
        }) : (() => {
          var _el$9 = _tmpl$3();
          _$insert(_el$9, item);
          return _el$9;
        })()
      }));
      _$insert(_el$6, _$createComponent(TextReveal, {
        "class": "text-body cursor-default",
        get text() {
          return _$memo(() => !!store.collapsed)() ? preview() : undefined;
        },
        duration: 600,
        travel: 25,
        edge: 17,
        spring: "cubic-bezier(0.34, 1, 0.64, 1)",
        springSoft: "cubic-bezier(0.34, 1, 0.64, 1)",
        growOnly: true,
        truncate: true
      }));
      _$insert(_el$7, _$createComponent(IconButton, {
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
          return _$memo(() => !!store.collapsed)() ? props.expandLabel : props.collapseLabel;
        }
      }));
      _$insert(_el$8, _$createComponent(TodoList, {
        get todos() {
          return props.todos;
        }
      }));
      _$effect(_p$ => {
        var _v$ = label(),
          _v$2 = `${Math.max(0, Math.min(1, 1 - shut()))}`,
          _v$3 = store.collapsed || off(),
          _v$4 = !!(hide() > 0.1),
          _v$5 = off() ? "hidden" : "visible",
          _v$6 = `${Math.max(0, Math.min(1, 1 - hide()))}`;
        _v$ !== _p$.e && _$setAttribute(_el$5, "aria-label", _p$.e = _v$);
        _v$2 !== _p$.t && _$setStyleProperty(_el$5, "opacity", _p$.t = _v$2);
        _v$3 !== _p$.a && _$setAttribute(_el$8, "aria-hidden", _p$.a = _v$3);
        _v$4 !== _p$.o && _el$8.classList.toggle("pointer-events-none", _p$.o = _v$4);
        _v$5 !== _p$.i && _$setStyleProperty(_el$8, "visibility", _p$.i = _v$5);
        _v$6 !== _p$.n && _$setStyleProperty(_el$8, "opacity", _p$.n = _v$6);
        return _p$;
      }, {
        e: undefined,
        t: undefined,
        a: undefined,
        o: undefined,
        i: undefined,
        n: undefined
      });
      return _el$3;
    }
  });
}
function TodoList(props) {
  const [store, setStore] = createStore({
    stuck: false
  });
  return (() => {
    var _el$0 = _tmpl$4(),
      _el$1 = _el$0.firstChild,
      _el$10 = _el$1.nextSibling;
    _el$1.addEventListener("scroll", e => {
      setStore("stuck", e.currentTarget.scrollTop > 0);
    });
    _$insert(_el$1, _$createComponent(Index, {
      get each() {
        return props.todos;
      },
      children: todo => _$createComponent(Checkbox, {
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
          return _$createComponent(TextStrikethrough, {
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
    _$effect(_$p => _$setStyleProperty(_el$10, "opacity", store.stuck ? 1 : 0));
    return _el$0;
  })();
}
_$delegateEvents(["click", "keydown"]);