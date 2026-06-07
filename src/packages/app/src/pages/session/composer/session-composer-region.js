import { template as _$template } from "solid-js/web";
import { delegateEvents as _$delegateEvents } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { classList as _$classList } from "solid-js/web";
import { setStyleProperty as _$setStyleProperty } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { use as _$use } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div class=overflow-hidden><div>`),
  _tmpl$2 = /*#__PURE__*/_$template(`<button type=button class="text-body transition-colors">`),
  _tmpl$3 = /*#__PURE__*/_$template(`<div class="w-full rounded-[12px] border bg-body p-3 fs-6 fw-normal text-secondary"><span> `),
  _tmpl$4 = /*#__PURE__*/_$template(`<div>`),
  _tmpl$5 = /*#__PURE__*/_$template(`<div data-component=session-prompt-dock class="shrink-0 w-full pb-3 flex flex-col justify-center items-center bg-body pointer-events-none"><div>`),
  _tmpl$6 = /*#__PURE__*/_$template(`<div class="w-full min-h-32 md:min-h-40 rounded-2 border bg-body px-4 py-3 text-secondary whitespace-pre-wrap pointer-events-none">`),
  _tmpl$7 = /*#__PURE__*/_$template(`<div class=pb-2>`);
import { Show, createEffect, createMemo, onCleanup } from "solid-js";
import { createStore } from "solid-js/store";
import { useNavigate } from "@solidjs/router";
import { useSpring } from "@/vendor/ui/components/motion-spring.js";
import { PromptInput } from "@/components/prompt-input.js";
import { useLanguage } from "@/context/language.js";
import { usePrompt } from "@/context/prompt.js";
import { useSync } from "@/context/sync.js";
import { getSessionHandoff, setSessionHandoff } from "@/pages/session/handoff.js";
import { useSessionKey } from "@/pages/session/session-layout.js";
import { SessionPermissionDock } from "@/pages/session/composer/session-permission-dock.js";
import { SessionQuestionDock } from "@/pages/session/composer/session-question-dock.js";
import { SessionFollowupDock } from "@/pages/session/composer/session-followup-dock.js";
import { SessionRevertDock } from "@/pages/session/composer/session-revert-dock.js";
import { SessionTodoDock } from "@/pages/session/composer/session-todo-dock.js";
import { createResizeObserver } from "@solid-primitives/resize-observer";
export function SessionComposerRegion(props) {
  const navigate = useNavigate();
  const prompt = usePrompt();
  const language = useLanguage();
  const route = useSessionKey();
  const sync = useSync();
  const handoffPrompt = createMemo(() => getSessionHandoff(route.sessionKey())?.prompt);
  const info = createMemo(() => route.params.id ? sync.session.get(route.params.id) : undefined);
  const parentID = createMemo(() => info()?.parentID);
  const child = createMemo(() => !!parentID());
  const showComposer = createMemo(() => !props.state.blocked() || child());
  const previewPrompt = () => prompt.current().map(part => {
    if (part.type === "file") return `[file:${part.path}]`;
    if (part.type === "agent") return `@${part.name}`;
    if (part.type === "image") return `[image:${part.filename}]`;
    return part.content;
  }).join("").trim();
  createEffect(() => {
    if (!prompt.ready()) return;
    setSessionHandoff(route.sessionKey(), {
      prompt: previewPrompt()
    });
  });
  const [store, setStore] = createStore({
    ready: false,
    height: 320,
    body: undefined
  });
  let timer;
  let frame;
  const clear = () => {
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timer = undefined;
    }
    if (frame !== undefined) {
      cancelAnimationFrame(frame);
      frame = undefined;
    }
  };
  createEffect(() => {
    route.sessionKey();
    const ready = props.ready;
    const delay = 140;
    clear();
    setStore("ready", false);
    if (!ready) return;
    frame = requestAnimationFrame(() => {
      frame = undefined;
      timer = window.setTimeout(() => {
        setStore("ready", true);
        timer = undefined;
      }, delay);
    });
  });
  onCleanup(clear);
  const open = createMemo(() => store.ready && props.state.dock() && !props.state.closing());
  const progress = useSpring(() => open() ? 1 : 0, {
    visualDuration: 0.3,
    bounce: 0
  });
  const value = createMemo(() => Math.max(0, Math.min(1, progress())));
  const dock = createMemo(() => store.ready && props.state.dock() || value() > 0.001);
  const rolled = createMemo(() => props.revert?.items.length ? props.revert : undefined);
  const lift = createMemo(() => rolled() ? 18 : 36 * value());
  const full = createMemo(() => Math.max(78, store.height));
  const openParent = () => {
    const id = parentID();
    if (!id) return;
    navigate(`/${route.params.dir}/session/${id}`);
  };
  createEffect(() => {
    const el = store.body;
    if (!el) return;
    const update = () => setStore("height", el.getBoundingClientRect().height);
    createResizeObserver(store.body, update);
    update();
  });
  return (() => {
    var _el$ = _tmpl$5(),
      _el$2 = _el$.firstChild;
    var _ref$ = props.setPromptDockRef;
    typeof _ref$ === "function" ? _$use(_ref$, _el$) : props.setPromptDockRef = _el$;
    _$insert(_el$2, _$createComponent(Show, {
      get when() {
        return props.state.questionRequest();
      },
      keyed: true,
      children: request => (() => {
        var _el$0 = _tmpl$4();
        _$insert(_el$0, _$createComponent(SessionQuestionDock, {
          request: request,
          get onSubmit() {
            return props.onResponseSubmit;
          }
        }));
        return _el$0;
      })()
    }), null);
    _$insert(_el$2, _$createComponent(Show, {
      get when() {
        return props.state.permissionRequest();
      },
      keyed: true,
      children: request => (() => {
        var _el$1 = _tmpl$4();
        _$insert(_el$1, _$createComponent(SessionPermissionDock, {
          request: request,
          get responding() {
            return props.state.permissionResponding();
          },
          onDecide: response => {
            props.onResponseSubmit();
            props.state.decide(response);
          }
        }));
        return _el$1;
      })()
    }), null);
    _$insert(_el$2, _$createComponent(Show, {
      get when() {
        return showComposer();
      },
      get children() {
        return _$createComponent(Show, {
          get when() {
            return prompt.ready();
          },
          get fallback() {
            return [_$createComponent(Show, {
              get when() {
                return rolled();
              },
              keyed: true,
              children: revert => (() => {
                var _el$11 = _tmpl$7();
                _$insert(_el$11, _$createComponent(SessionRevertDock, {
                  get items() {
                    return revert.items;
                  },
                  get restoring() {
                    return revert.restoring;
                  },
                  get disabled() {
                    return revert.disabled;
                  },
                  get onRestore() {
                    return revert.onRestore;
                  }
                }));
                return _el$11;
              })()
            }), (() => {
              var _el$10 = _tmpl$6();
              _$insert(_el$10, () => handoffPrompt() || language.t("prompt.loading"));
              return _el$10;
            })()];
          },
          get children() {
            return [_$createComponent(Show, {
              get when() {
                return dock();
              },
              get children() {
                var _el$3 = _tmpl$(),
                  _el$4 = _el$3.firstChild;
                _$use(el => setStore("body", el), _el$4);
                _$insert(_el$4, _$createComponent(SessionTodoDock, {
                  get sessionID() {
                    return route.params.id;
                  },
                  get todos() {
                    return props.state.todos();
                  },
                  get collapseLabel() {
                    return language.t("session.todo.collapse");
                  },
                  get expandLabel() {
                    return language.t("session.todo.expand");
                  },
                  get dockProgress() {
                    return value();
                  }
                }));
                _$effect(_p$ => {
                  var _v$ = !!(value() < 0.98),
                    _v$2 = `${full() * value()}px`;
                  _v$ !== _p$.e && _el$3.classList.toggle("pointer-events-none", _p$.e = _v$);
                  _v$2 !== _p$.t && _$setStyleProperty(_el$3, "max-height", _p$.t = _v$2);
                  return _p$;
                }, {
                  e: undefined,
                  t: undefined
                });
                return _el$3;
              }
            }), _$createComponent(Show, {
              get when() {
                return rolled();
              },
              keyed: true,
              children: revert => (() => {
                var _el$12 = _tmpl$4();
                _$insert(_el$12, _$createComponent(SessionRevertDock, {
                  get items() {
                    return revert.items;
                  },
                  get restoring() {
                    return revert.restoring;
                  },
                  get disabled() {
                    return revert.disabled;
                  },
                  get onRestore() {
                    return revert.onRestore;
                  }
                }));
                _$effect(_$p => _$setStyleProperty(_el$12, "margin-top", `${-36 * value()}px`));
                return _el$12;
              })()
            }), (() => {
              var _el$5 = _tmpl$4();
              _$classList(_el$5, {
                "relative z-10": true
              });
              _$insert(_el$5, _$createComponent(Show, {
                get when() {
                  return props.followup?.items.length;
                },
                get children() {
                  return _$createComponent(SessionFollowupDock, {
                    get items() {
                      return props.followup.items;
                    },
                    get sending() {
                      return props.followup.sending;
                    },
                    get onSend() {
                      return props.followup.onSend;
                    },
                    get onEdit() {
                      return props.followup.onEdit;
                    }
                  });
                }
              }), null);
              _$insert(_el$5, _$createComponent(Show, {
                get when() {
                  return child();
                },
                get fallback() {
                  return _$createComponent(Show, {
                    get when() {
                      return !props.state.blocked();
                    },
                    get children() {
                      return _$createComponent(PromptInput, {
                        ref(r$) {
                          var _ref$3 = props.inputRef;
                          typeof _ref$3 === "function" ? _ref$3(r$) : props.inputRef = r$;
                        },
                        get newSessionWorktree() {
                          return props.newSessionWorktree;
                        },
                        get onNewSessionWorktreeReset() {
                          return props.onNewSessionWorktreeReset;
                        },
                        get edit() {
                          return props.followup?.edit;
                        },
                        get onEditLoaded() {
                          return props.followup?.onEditLoaded;
                        },
                        get shouldQueue() {
                          return props.followup?.queue;
                        },
                        get onQueue() {
                          return props.followup?.onQueue;
                        },
                        get onAbort() {
                          return props.followup?.onAbort;
                        },
                        get onSubmit() {
                          return props.onSubmit;
                        }
                      });
                    }
                  });
                },
                get children() {
                  var _el$6 = _tmpl$3(),
                    _el$7 = _el$6.firstChild,
                    _el$8 = _el$7.firstChild;
                  var _ref$2 = props.inputRef;
                  typeof _ref$2 === "function" ? _$use(_ref$2, _el$6) : props.inputRef = _el$6;
                  _$insert(_el$7, () => language.t("session.child.promptDisabled"), _el$8);
                  _$insert(_el$6, _$createComponent(Show, {
                    get when() {
                      return parentID();
                    },
                    get children() {
                      var _el$9 = _tmpl$2();
                      _el$9.$$click = openParent;
                      _$insert(_el$9, () => language.t("session.child.backToParent"));
                      return _el$9;
                    }
                  }), null);
                  return _el$6;
                }
              }), null);
              _$effect(_$p => _$setStyleProperty(_el$5, "margin-top", `${-lift()}px`));
              return _el$5;
            })()];
          }
        });
      }
    }), null);
    _$effect(_$p => _$classList(_el$2, {
      "w-full px-3 pointer-events-auto": true,
      "md:max-w-200 md:mx-auto 2xl:max-w-[1000px]": props.centered
    }, _$p));
    return _el$;
  })();
}
_$delegateEvents(["click"]);