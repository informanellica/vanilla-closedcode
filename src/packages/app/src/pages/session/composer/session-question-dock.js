import { template as _$template } from "solid-js/web";
import { delegateEvents as _$delegateEvents } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { use as _$use } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { addEventListener as _$addEventListener } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<span data-slot=question-option-check aria-hidden=true><span data-slot=question-option-box>`),
  _tmpl$2 = /*#__PURE__*/_$template(`<span data-slot=question-option-radio-dot>`),
  _tmpl$3 = /*#__PURE__*/_$template(`<span data-slot=option-description>`),
  _tmpl$4 = /*#__PURE__*/_$template(`<button type=button data-slot=question-option><span data-slot=question-option-main><span data-slot=option-label>`),
  _tmpl$5 = /*#__PURE__*/_$template(`<div data-slot=question-text>`),
  _tmpl$6 = /*#__PURE__*/_$template(`<div data-slot=question-hint>`),
  _tmpl$7 = /*#__PURE__*/_$template(`<form data-slot=question-option data-custom=true><span data-slot=question-option-main><span data-slot=option-label></span><textarea data-slot=question-custom-input rows=1>`),
  _tmpl$8 = /*#__PURE__*/_$template(`<div data-slot=question-options>`),
  _tmpl$9 = /*#__PURE__*/_$template(`<div data-slot=question-header-title>`),
  _tmpl$0 = /*#__PURE__*/_$template(`<div data-slot=question-progress>`),
  _tmpl$1 = /*#__PURE__*/_$template(`<button type=button data-slot=question-progress-segment>`),
  _tmpl$10 = /*#__PURE__*/_$template(`<div data-slot=question-footer-actions>`),
  _tmpl$11 = /*#__PURE__*/_$template(`<button type=button data-slot=question-option data-custom=true><span data-slot=question-option-main><span data-slot=option-label></span><span data-slot=option-description>`);
import { For, Show, createMemo, onCleanup, onMount } from "solid-js";
import { createStore } from "solid-js/store";
import { useMutation } from "@tanstack/solid-query";
import { Button } from "@/bs/button.js";
import { DockPrompt } from "@/vendor/ui/components/dock-prompt.js";
import { Icon } from "@/bs/icon.js";
import { showToast } from "@/lib/toast.js";
import { useLanguage } from "@/context/language.js";
import { useComposerController } from "@/controllers/session-composer.js";
import { makeEventListener } from "@solid-primitives/event-listener";
import { createResizeObserver } from "@solid-primitives/resize-observer";
const cache = new Map();
function Mark(props) {
  return (() => {
    var _el$ = _tmpl$(),
      _el$2 = _el$.firstChild;
    _$addEventListener(_el$, "click", props.onClick, true);
    _$insert(_el$2, _$createComponent(Show, {
      get when() {
        return props.multi;
      },
      get fallback() {
        return _tmpl$2();
      },
      get children() {
        return _$createComponent(Icon, {
          name: "check-small",
          size: "small"
        });
      }
    }));
    _$effect(_p$ => {
      var _v$ = props.multi ? "checkbox" : "radio",
        _v$2 = props.picked;
      _v$ !== _p$.e && _$setAttribute(_el$2, "data-type", _p$.e = _v$);
      _v$2 !== _p$.t && _$setAttribute(_el$2, "data-picked", _p$.t = _v$2);
      return _p$;
    }, {
      e: undefined,
      t: undefined
    });
    return _el$;
  })();
}
function Option(props) {
  return (() => {
    var _el$4 = _tmpl$4(),
      _el$5 = _el$4.firstChild,
      _el$6 = _el$5.firstChild;
    _$addEventListener(_el$4, "click", props.onClick, true);
    _$addEventListener(_el$4, "focus", props.onFocus);
    var _ref$ = props.ref;
    typeof _ref$ === "function" ? _$use(_ref$, _el$4) : props.ref = _el$4;
    _$insert(_el$4, _$createComponent(Mark, {
      get multi() {
        return props.multi;
      },
      get picked() {
        return props.picked;
      }
    }), _el$5);
    _$insert(_el$6, () => props.label);
    _$insert(_el$5, _$createComponent(Show, {
      get when() {
        return props.description;
      },
      get children() {
        var _el$7 = _tmpl$3();
        _$insert(_el$7, () => props.description);
        return _el$7;
      }
    }), null);
    _$effect(_p$ => {
      var _v$3 = props.picked,
        _v$4 = props.multi ? "checkbox" : "radio",
        _v$5 = props.picked,
        _v$6 = props.disabled;
      _v$3 !== _p$.e && _$setAttribute(_el$4, "data-picked", _p$.e = _v$3);
      _v$4 !== _p$.t && _$setAttribute(_el$4, "role", _p$.t = _v$4);
      _v$5 !== _p$.a && _$setAttribute(_el$4, "aria-checked", _p$.a = _v$5);
      _v$6 !== _p$.o && (_el$4.disabled = _p$.o = _v$6);
      return _p$;
    }, {
      e: undefined,
      t: undefined,
      a: undefined,
      o: undefined
    });
    return _el$4;
  })();
}
export const SessionQuestionDock = props => {
  const composer = useComposerController();
  const language = useLanguage();
  const questions = createMemo(() => props.request.questions);
  const total = createMemo(() => questions().length);
  const cached = cache.get(props.request.id);
  const [store, setStore] = createStore({
    tab: cached?.tab ?? 0,
    answers: cached?.answers ?? [],
    custom: cached?.custom ?? [],
    customOn: cached?.customOn ?? [],
    editing: false,
    focus: 0
  });
  let root;
  let customRef;
  let optsRef = [];
  let replied = false;
  let focusFrame;
  const question = createMemo(() => questions()[store.tab]);
  const options = createMemo(() => question()?.options ?? []);
  const input = createMemo(() => store.custom[store.tab] ?? "");
  const on = createMemo(() => store.customOn[store.tab] === true);
  const multi = createMemo(() => question()?.multiple === true);
  const count = createMemo(() => options().length + 1);
  const summary = createMemo(() => {
    const n = Math.min(store.tab + 1, total());
    return language.t("session.question.progress", {
      current: n,
      total: total()
    });
  });
  const customLabel = () => language.t("ui.messagePart.option.typeOwnAnswer");
  const customPlaceholder = () => language.t("ui.question.custom.placeholder");
  const last = createMemo(() => store.tab >= total() - 1);
  const customUpdate = (value, selected = on()) => {
    const prev = input().trim();
    const next = value.trim();
    setStore("custom", store.tab, value);
    if (!selected) return;
    if (multi()) {
      setStore("answers", store.tab, (current = []) => {
        const removed = prev ? current.filter(item => item.trim() !== prev) : current;
        if (!next) return removed;
        if (removed.some(item => item.trim() === next)) return removed;
        return [...removed, next];
      });
      return;
    }
    setStore("answers", store.tab, next ? [next] : []);
  };
  const measure = () => {
    if (!root) return;
    const scroller = document.querySelector(".scroll-view__viewport");
    const head = scroller instanceof HTMLElement ? scroller.firstElementChild : undefined;
    const top = head instanceof HTMLElement && head.classList.contains("sticky") ? head.getBoundingClientRect().bottom : 0;
    if (!top) {
      root.style.removeProperty("--question-prompt-max-height");
      return;
    }
    const dock = root.closest('[data-component="session-prompt-dock"]');
    if (!(dock instanceof HTMLElement)) return;
    const dockBottom = dock.getBoundingClientRect().bottom;
    const below = Math.max(0, dockBottom - root.getBoundingClientRect().bottom);
    const gap = 8;
    const max = Math.max(240, Math.floor(dockBottom - top - gap - below));
    root.style.setProperty("--question-prompt-max-height", `${max}px`);
  };
  const clamp = i => Math.max(0, Math.min(count() - 1, i));
  const pickFocus = (tab = store.tab) => {
    const list = questions()[tab]?.options ?? [];
    if (store.customOn[tab] === true) return list.length;
    return Math.max(0, list.findIndex(item => store.answers[tab]?.includes(item.label) ?? false));
  };
  const focus = i => {
    const next = clamp(i);
    setStore("focus", next);
    if (store.editing) return;
    if (focusFrame !== undefined) cancelAnimationFrame(focusFrame);
    focusFrame = requestAnimationFrame(() => {
      focusFrame = undefined;
      const el = next === options().length ? customRef : optsRef[next];
      el?.focus();
    });
  };
  onMount(() => {
    let raf;
    const update = () => {
      if (raf !== undefined) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = undefined;
        measure();
      });
    };
    update();
    makeEventListener(window, "resize", update);
    const dock = root?.closest('[data-component="session-prompt-dock"]');
    const scroller = document.querySelector(".scroll-view__viewport");
    createResizeObserver([dock, scroller], update);
    onCleanup(() => {
      if (raf !== undefined) cancelAnimationFrame(raf);
    });
    focus(pickFocus());
  });
  onCleanup(() => {
    if (focusFrame !== undefined) cancelAnimationFrame(focusFrame);
    if (replied) return;
    cache.set(props.request.id, {
      tab: store.tab,
      answers: store.answers.map(a => a ? [...a] : []),
      custom: store.custom.map(s => s ?? ""),
      customOn: store.customOn.map(b => b ?? false)
    });
  });
  const fail = err => {
    const message = err instanceof Error ? err.message : String(err);
    showToast({
      title: language.t("common.requestFailed"),
      description: message
    });
  };
  const replyMutation = useMutation(() => ({
    mutationFn: answers => composer.replyQuestion({
      requestID: props.request.id,
      answers
    }),
    onMutate: () => {
      props.onSubmit();
    },
    onSuccess: () => {
      replied = true;
      cache.delete(props.request.id);
    },
    onError: fail
  }));
  const rejectMutation = useMutation(() => ({
    mutationFn: () => composer.rejectQuestion({
      requestID: props.request.id
    }),
    onMutate: () => {
      props.onSubmit();
    },
    onSuccess: () => {
      replied = true;
      cache.delete(props.request.id);
    },
    onError: fail
  }));
  const sending = createMemo(() => replyMutation.isPending || rejectMutation.isPending);
  const reply = async answers => {
    if (sending()) return;
    await replyMutation.mutateAsync(answers);
  };
  const reject = async () => {
    if (sending()) return;
    await rejectMutation.mutateAsync();
  };
  const submit = () => void reply(questions().map((_, i) => store.answers[i] ?? []));
  const answered = i => {
    if ((store.answers[i]?.length ?? 0) > 0) return true;
    return store.customOn[i] === true && (store.custom[i] ?? "").trim().length > 0;
  };
  const picked = answer => store.answers[store.tab]?.includes(answer) ?? false;
  const pick = (answer, custom = false) => {
    setStore("answers", store.tab, [answer]);
    if (custom) setStore("custom", store.tab, answer);
    if (!custom) setStore("customOn", store.tab, false);
    setStore("editing", false);
  };
  const toggle = answer => {
    setStore("answers", store.tab, (current = []) => {
      if (current.includes(answer)) return current.filter(item => item !== answer);
      return [...current, answer];
    });
  };
  const customToggle = () => {
    if (sending()) return;
    setStore("focus", options().length);
    if (!multi()) {
      setStore("customOn", store.tab, true);
      setStore("editing", true);
      customUpdate(input(), true);
      return;
    }
    const next = !on();
    setStore("customOn", store.tab, next);
    if (next) {
      setStore("editing", true);
      customUpdate(input(), true);
      return;
    }
    const value = input().trim();
    if (value) setStore("answers", store.tab, (current = []) => current.filter(item => item.trim() !== value));
    setStore("editing", false);
    focus(options().length);
  };
  const customOpen = () => {
    if (sending()) return;
    setStore("focus", options().length);
    if (!on()) setStore("customOn", store.tab, true);
    setStore("editing", true);
    customUpdate(input(), true);
  };
  const move = step => {
    if (store.editing || sending()) return;
    focus(store.focus + step);
  };
  const nav = event => {
    if (event.defaultPrevented) return;
    if (event.key === "Escape") {
      event.preventDefault();
      void reject();
      return;
    }
    const mod = (event.metaKey || event.ctrlKey) && !event.altKey;
    if (mod && event.key === "Enter") {
      if (event.repeat) return;
      event.preventDefault();
      next();
      return;
    }
    const target = event.target instanceof HTMLElement ? event.target.closest('[data-slot="question-options"]') : undefined;
    if (store.editing) return;
    if (!(target instanceof HTMLElement)) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      move(1);
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      move(-1);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      focus(0);
      return;
    }
    if (event.key !== "End") return;
    event.preventDefault();
    focus(count() - 1);
  };
  const selectOption = optIndex => {
    if (sending()) return;
    if (optIndex === options().length) {
      customOpen();
      return;
    }
    const opt = options()[optIndex];
    if (!opt) return;
    if (multi()) {
      setStore("editing", false);
      toggle(opt.label);
      return;
    }
    pick(opt.label);
  };
  const commitCustom = () => {
    setStore("editing", false);
    customUpdate(input());
    focus(options().length);
  };
  const resizeInput = el => {
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  };
  const focusCustom = el => {
    setTimeout(() => {
      el.focus();
      resizeInput(el);
    }, 0);
  };
  const toggleCustomMark = event => {
    event.preventDefault();
    event.stopPropagation();
    customToggle();
  };
  const next = () => {
    if (sending()) return;
    if (store.editing) commitCustom();
    if (store.tab >= total() - 1) {
      submit();
      return;
    }
    const tab = store.tab + 1;
    setStore("tab", tab);
    setStore("editing", false);
    focus(pickFocus(tab));
  };
  const back = () => {
    if (sending()) return;
    if (store.tab <= 0) return;
    const tab = store.tab - 1;
    setStore("tab", tab);
    setStore("editing", false);
    focus(pickFocus(tab));
  };
  const jump = tab => {
    if (sending()) return;
    setStore("tab", tab);
    setStore("editing", false);
    focus(pickFocus(tab));
  };
  return _$createComponent(DockPrompt, {
    kind: "question",
    ref: el => root = el,
    onKeyDown: nav,
    get header() {
      return [(() => {
        var _el$13 = _tmpl$9();
        _$insert(_el$13, summary);
        return _el$13;
      })(), (() => {
        var _el$14 = _tmpl$0();
        _$insert(_el$14, _$createComponent(For, {
          get each() {
            return questions();
          },
          children: (_, i) => (() => {
            var _el$15 = _tmpl$1();
            _el$15.$$click = () => jump(i());
            _$effect(_p$ => {
              var _v$10 = i() === store.tab,
                _v$11 = answered(i()),
                _v$12 = sending(),
                _v$13 = `${language.t("ui.tool.questions")} ${i() + 1}`;
              _v$10 !== _p$.e && _$setAttribute(_el$15, "data-active", _p$.e = _v$10);
              _v$11 !== _p$.t && _$setAttribute(_el$15, "data-answered", _p$.t = _v$11);
              _v$12 !== _p$.a && (_el$15.disabled = _p$.a = _v$12);
              _v$13 !== _p$.o && _$setAttribute(_el$15, "aria-label", _p$.o = _v$13);
              return _p$;
            }, {
              e: undefined,
              t: undefined,
              a: undefined,
              o: undefined
            });
            return _el$15;
          })()
        }));
        return _el$14;
      })()];
    },
    get footer() {
      return [_$createComponent(Button, {
        variant: "ghost",
        size: "large",
        get disabled() {
          return sending();
        },
        onClick: reject,
        "aria-keyshortcuts": "Escape",
        get children() {
          return language.t("ui.common.dismiss");
        }
      }), (() => {
        var _el$16 = _tmpl$10();
        _$insert(_el$16, _$createComponent(Show, {
          get when() {
            return store.tab > 0;
          },
          get children() {
            return _$createComponent(Button, {
              variant: "secondary",
              size: "large",
              get disabled() {
                return sending();
              },
              onClick: back,
              get children() {
                return language.t("ui.common.back");
              }
            });
          }
        }), null);
        _$insert(_el$16, _$createComponent(Button, {
          get variant() {
            return last() ? "primary" : "secondary";
          },
          size: "large",
          get disabled() {
            return sending();
          },
          onClick: next,
          "aria-keyshortcuts": "Meta+Enter Control+Enter",
          get children() {
            return _$memo(() => !!last())() ? language.t("ui.common.submit") : language.t("ui.common.next");
          }
        }), null);
        return _el$16;
      })()];
    },
    get children() {
      return [(() => {
        var _el$8 = _tmpl$5();
        _$insert(_el$8, () => question()?.question);
        return _el$8;
      })(), _$createComponent(Show, {
        get when() {
          return multi();
        },
        get fallback() {
          return (() => {
            var _el$17 = _tmpl$6();
            _$insert(_el$17, () => language.t("ui.question.singleHint"));
            return _el$17;
          })();
        },
        get children() {
          var _el$9 = _tmpl$6();
          _$insert(_el$9, () => language.t("ui.question.multiHint"));
          return _el$9;
        }
      }), (() => {
        var _el$0 = _tmpl$8();
        _$insert(_el$0, _$createComponent(For, {
          get each() {
            return options();
          },
          children: (opt, i) => _$createComponent(Option, {
            get multi() {
              return multi();
            },
            get picked() {
              return picked(opt.label);
            },
            get label() {
              return opt.label;
            },
            get description() {
              return opt.description;
            },
            get disabled() {
              return sending();
            },
            ref: el => optsRef[i()] = el,
            onFocus: () => setStore("focus", i()),
            onClick: () => selectOption(i())
          })
        }), null);
        _$insert(_el$0, _$createComponent(Show, {
          get when() {
            return store.editing;
          },
          get fallback() {
            return (() => {
              var _el$18 = _tmpl$11(),
                _el$19 = _el$18.firstChild,
                _el$20 = _el$19.firstChild,
                _el$21 = _el$20.nextSibling;
              _el$18.$$click = customOpen;
              _el$18.addEventListener("focus", () => setStore("focus", options().length));
              var _ref$2 = customRef;
              typeof _ref$2 === "function" ? _$use(_ref$2, _el$18) : customRef = _el$18;
              _$insert(_el$18, _$createComponent(Mark, {
                get multi() {
                  return multi();
                },
                get picked() {
                  return on();
                },
                onClick: toggleCustomMark
              }), _el$19);
              _$insert(_el$20, customLabel);
              _$insert(_el$21, () => input() || customPlaceholder());
              _$effect(_p$ => {
                var _v$14 = on(),
                  _v$15 = multi() ? "checkbox" : "radio",
                  _v$16 = on(),
                  _v$17 = sending();
                _v$14 !== _p$.e && _$setAttribute(_el$18, "data-picked", _p$.e = _v$14);
                _v$15 !== _p$.t && _$setAttribute(_el$18, "role", _p$.t = _v$15);
                _v$16 !== _p$.a && _$setAttribute(_el$18, "aria-checked", _p$.a = _v$16);
                _v$17 !== _p$.o && (_el$18.disabled = _p$.o = _v$17);
                return _p$;
              }, {
                e: undefined,
                t: undefined,
                a: undefined,
                o: undefined
              });
              return _el$18;
            })();
          },
          get children() {
            var _el$1 = _tmpl$7(),
              _el$10 = _el$1.firstChild,
              _el$11 = _el$10.firstChild,
              _el$12 = _el$11.nextSibling;
            _el$1.addEventListener("submit", e => {
              e.preventDefault();
              commitCustom();
            });
            _el$1.$$mousedown = e => {
              if (sending()) {
                e.preventDefault();
                return;
              }
              if (e.target instanceof HTMLTextAreaElement) return;
              const input = e.currentTarget.querySelector('[data-slot="question-custom-input"]');
              if (input instanceof HTMLTextAreaElement) input.focus();
            };
            _$insert(_el$1, _$createComponent(Mark, {
              get multi() {
                return multi();
              },
              get picked() {
                return on();
              },
              onClick: toggleCustomMark
            }), _el$10);
            _$insert(_el$11, customLabel);
            _el$12.$$input = e => {
              customUpdate(e.currentTarget.value);
              resizeInput(e.currentTarget);
            };
            _el$12.$$keydown = e => {
              if (e.key === "Escape") {
                e.preventDefault();
                setStore("editing", false);
                focus(options().length);
                return;
              }
              if ((e.metaKey || e.ctrlKey) && !e.altKey) return;
              if (e.key !== "Enter" || e.shiftKey) return;
              e.preventDefault();
              commitCustom();
            };
            _$use(focusCustom, _el$12);
            _$effect(_p$ => {
              var _v$7 = on(),
                _v$8 = multi() ? "checkbox" : "radio",
                _v$9 = on(),
                _v$0 = customPlaceholder(),
                _v$1 = sending();
              _v$7 !== _p$.e && _$setAttribute(_el$1, "data-picked", _p$.e = _v$7);
              _v$8 !== _p$.t && _$setAttribute(_el$1, "role", _p$.t = _v$8);
              _v$9 !== _p$.a && _$setAttribute(_el$1, "aria-checked", _p$.a = _v$9);
              _v$0 !== _p$.o && _$setAttribute(_el$12, "placeholder", _p$.o = _v$0);
              _v$1 !== _p$.i && (_el$12.disabled = _p$.i = _v$1);
              return _p$;
            }, {
              e: undefined,
              t: undefined,
              a: undefined,
              o: undefined,
              i: undefined
            });
            _$effect(() => _el$12.value = input());
            return _el$1;
          }
        }), null);
        return _el$0;
      })()];
    }
  });
};
_$delegateEvents(["click", "mousedown", "keydown", "input"]);