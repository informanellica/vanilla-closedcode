import { template as _$template } from "solid-js/web";
import { delegateEvents as _$delegateEvents } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div class="w-100 d-flex flex-column gap-1.5"><div class="text-body"></div><div>`),
  _tmpl$2 = /*#__PURE__*/_$template(`<form class="d-flex flex-column align-items-start gap-4">`),
  _tmpl$3 = /*#__PURE__*/_$template(`<div class="w-100 d-flex align-items-center gap-x-2"><div class="w-4 h-2 rounded-[1px] bg-input-base shadow-xs-border-base d-flex align-items-center justify-content-center"><div class="w-2.5 h-0.5 ml-0 bg-icon-strong-base d-none"data-slot=list-item-extra-icon></div></div><span></span><span class="fw-normal text-secondary">`),
  _tmpl$4 = /*#__PURE__*/_$template(`<div class="text-body">`),
  _tmpl$5 = /*#__PURE__*/_$template(`<div>`),
  _tmpl$6 = /*#__PURE__*/_$template(`<div class="w-100 d-flex align-items-center gap-x-2"><div class="w-4 h-2 rounded-[1px] bg-input-base shadow-xs-border-base d-flex align-items-center justify-content-center"><div class="w-2.5 h-0.5 ml-0 bg-icon-strong-base d-none"data-slot=list-item-extra-icon></div></div><span>`),
  _tmpl$7 = /*#__PURE__*/_$template(`<div class="d-flex flex-column gap-4"><div class="text-body"></div><div class="text-body"></div><div class="text-body">`),
  _tmpl$8 = /*#__PURE__*/_$template(`<div class="d-flex flex-column gap-6"><form class="d-flex flex-column align-items-start gap-4">`),
  _tmpl$9 = /*#__PURE__*/_$template(`<div class="d-flex flex-column gap-6"><div class="text-body"></div><form class="d-flex flex-column align-items-start gap-4">`),
  _tmpl$0 = /*#__PURE__*/_$template(`<div class="d-flex flex-column gap-6"><div class="text-body"></div><div class="text-body d-flex align-items-center gap-4"><span>`),
  _tmpl$1 = /*#__PURE__*/_$template(`<div class="text-body"><div class="d-flex align-items-center gap-x-2"><span>`),
  _tmpl$10 = /*#__PURE__*/_$template(`<div class="d-flex flex-column gap-6 px-2.5 pb-3"><div class="px-2.5 d-flex gap-4 align-items-center"><div class="fs-6 fw-medium text-body-emphasis"></div></div><div class="px-2.5 pb-10 d-flex flex-column gap-6"><div tabindex=0>`);
import { Button } from "@/bs/button.js";
import { useDialog } from "@/lib/dialog.js";
import { Dialog } from "@/bs/dialog.js";
import { Icon } from "@/bs/icon.js";
import { IconButton } from "@/bs/icon-button.js";
import { List } from "@/bs/list.js";
import { ProviderIcon } from "@/vendor/ui/components/provider-icon.js";
import { Spinner } from "@/bs/spinner.js";
import { TextField } from "@/bs/text-field.js";
import { showToast } from "@/lib/toast.js";
import { createEffect, createMemo, createResource, Match, onCleanup, onMount, Switch } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { Link } from "@/components/link.js";
import { useLanguage } from "@/context/language.js";
import { useProviders } from "@/hooks/use-providers.js";
import { useProvidersController } from "@/controllers/providers.js";
export function DialogConnectProvider(props) {
  const dialog = useDialog();
  const language = useLanguage();
  const providers = useProviders();
  const controller = useProvidersController();
  const all = () => {
    void import("./dialog-select-provider.js").then(x => {
      dialog.show(() => _$createComponent(x.DialogSelectProvider, {}));
    });
  };
  const alive = {
    value: true
  };
  const timer = {
    current: undefined
  };
  onCleanup(() => {
    alive.value = false;
    if (timer.current === undefined) return;
    clearTimeout(timer.current);
    timer.current = undefined;
  });
  const provider = createMemo(() => controller.findProvider(props.provider, providers.all()));
  const fallback = createMemo(() => [{
    type: "api",
    label: language.t("provider.connect.method.apiKey")
  }]);
  const [auth] = createResource(() => props.provider, () => controller.fetchAuthMethods(props.provider, {
    fallback,
    isAlive: () => alive.value
  }));
  const loading = createMemo(() => auth.loading && !controller.cachedAuth(props.provider));
  const methods = createMemo(() => auth.latest ?? controller.cachedAuth(props.provider) ?? fallback());
  const [store, setStore] = createStore({
    methodIndex: undefined,
    authorization: undefined,
    state: "pending",
    error: undefined
  });
  function dispatch(action) {
    setStore(produce(draft => {
      if (action.type === "method.select") {
        draft.methodIndex = action.index;
        draft.authorization = undefined;
        draft.state = undefined;
        draft.error = undefined;
        return;
      }
      if (action.type === "method.reset") {
        draft.methodIndex = undefined;
        draft.authorization = undefined;
        draft.state = undefined;
        draft.error = undefined;
        return;
      }
      if (action.type === "auth.prompt") {
        draft.state = "prompt";
        draft.error = undefined;
        return;
      }
      if (action.type === "auth.pending") {
        draft.state = "pending";
        draft.error = undefined;
        return;
      }
      if (action.type === "auth.complete") {
        draft.state = "complete";
        draft.authorization = action.authorization;
        draft.error = undefined;
        return;
      }
      draft.state = "error";
      draft.error = action.error;
    }));
  }
  const method = createMemo(() => store.methodIndex !== undefined ? methods().at(store.methodIndex) : undefined);
  const methodLabel = value => {
    if (!value) return "";
    if (value.type === "api") return language.t("provider.connect.method.apiKey");
    return value.label ?? "";
  };
  function formatError(value, fallback) {
    if (value && typeof value === "object" && "data" in value) {
      const data = value.data;
      if (typeof data?.message === "string" && data.message) return data.message;
    }
    if (value && typeof value === "object" && "error" in value) {
      const nested = formatError(value.error, "");
      if (nested) return nested;
    }
    if (value && typeof value === "object" && "message" in value) {
      const message = value.message;
      if (typeof message === "string" && message) return message;
    }
    if (value instanceof Error && value.message) return value.message;
    if (typeof value === "string" && value) return value;
    return fallback;
  }
  async function selectMethod(index, inputs) {
    if (timer.current !== undefined) {
      clearTimeout(timer.current);
      timer.current = undefined;
    }
    const method = methods()[index];
    dispatch({
      type: "method.select",
      index
    });
    if (method.type === "oauth") {
      if (method.prompts?.length && !inputs) {
        dispatch({
          type: "auth.prompt"
        });
        return;
      }
      dispatch({
        type: "auth.pending"
      });
      const start = Date.now();
      await controller.authorizeOAuth(props.provider, index, inputs).then(data => {
        if (!alive.value) return;
        const elapsed = Date.now() - start;
        const delay = 1000 - elapsed;
        if (delay > 0) {
          if (timer.current !== undefined) clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            timer.current = undefined;
            if (!alive.value) return;
            dispatch({
              type: "auth.complete",
              authorization: data
            });
          }, delay);
          return;
        }
        dispatch({
          type: "auth.complete",
          authorization: data
        });
      }).catch(e => {
        if (!alive.value) return;
        dispatch({
          type: "auth.error",
          error: formatError(e, language.t("common.requestFailed"))
        });
      });
    }
  }
  function OAuthPromptsView() {
    const [formStore, setFormStore] = createStore({
      value: {},
      index: 0
    });
    const prompts = createMemo(() => {
      const value = method();
      if (value?.type !== "oauth") return [];
      return value.prompts ?? [];
    });
    const matches = (prompt, value) => {
      if (!prompt.when) return true;
      const actual = value[prompt.when.key];
      if (actual === undefined) return false;
      return prompt.when.op === "eq" ? actual === prompt.when.value : actual !== prompt.when.value;
    };
    const current = createMemo(() => {
      const all = prompts();
      const index = all.findIndex((prompt, index) => index >= formStore.index && matches(prompt, formStore.value));
      if (index === -1) return;
      return {
        index,
        prompt: all[index]
      };
    });
    const valid = createMemo(() => {
      const item = current();
      if (!item || item.prompt.type !== "text") return false;
      const value = formStore.value[item.prompt.key] ?? "";
      return value.trim().length > 0;
    });
    async function next(index, value) {
      if (store.methodIndex === undefined) return;
      const next = prompts().findIndex((prompt, i) => i > index && matches(prompt, value));
      if (next !== -1) {
        setFormStore("index", next);
        return;
      }
      await selectMethod(store.methodIndex, value);
    }
    async function handleSubmit(e) {
      e.preventDefault();
      const item = current();
      if (!item || item.prompt.type !== "text") return;
      if (!valid()) return;
      await next(item.index, formStore.value);
    }
    const item = () => current();
    const text = createMemo(() => {
      const prompt = item()?.prompt;
      if (!prompt || prompt.type !== "text") return;
      return prompt;
    });
    const select = createMemo(() => {
      const prompt = item()?.prompt;
      if (!prompt || prompt.type !== "select") return;
      return prompt;
    });
    return (() => {
      var _el$ = _tmpl$2();
      _el$.addEventListener("submit", handleSubmit);
      _$insert(_el$, _$createComponent(Switch, {
        get children() {
          return [_$createComponent(Match, {
            get when() {
              return item()?.prompt.type === "select";
            },
            get children() {
              var _el$2 = _tmpl$(),
                _el$3 = _el$2.firstChild,
                _el$4 = _el$3.nextSibling;
              _$insert(_el$3, () => select()?.message);
              _$insert(_el$4, _$createComponent(List, {
                get items() {
                  return select()?.options ?? [];
                },
                key: x => x.value,
                get current() {
                  return select()?.options.find(x => x.value === formStore.value[select().key]);
                },
                onSelect: value => {
                  if (!value) return;
                  const prompt = select();
                  if (!prompt) return;
                  const nextValue = {
                    ...formStore.value,
                    [prompt.key]: value.value
                  };
                  setFormStore("value", prompt.key, value.value);
                  void next(item().index, nextValue);
                },
                children: option => (() => {
                  var _el$5 = _tmpl$3(),
                    _el$6 = _el$5.firstChild,
                    _el$7 = _el$6.nextSibling,
                    _el$8 = _el$7.nextSibling;
                  _$insert(_el$7, () => option.label);
                  _$insert(_el$8, () => option.hint);
                  return _el$5;
                })()
              }));
              return _el$2;
            }
          })];
        }
      }));
      return _el$;
    })();
  }
  let listRef;
  function handleKey(e) {
    if (e.key === "Enter" && e.target instanceof HTMLInputElement) {
      return;
    }
    if (e.key === "Escape") return;
    listRef?.onKeyDown(e);
  }
  let auto = false;
  createEffect(() => {
    if (auto) return;
    if (loading()) return;
    if (methods().length === 1) {
      auto = true;
      void selectMethod(0);
    }
  });
  function complete() {
    dialog.close();
    showToast({
      variant: "success",
      icon: "circle-check",
      title: language.t("provider.connect.toast.connected.title", {
        provider: provider().name
      }),
      description: language.t("provider.connect.toast.connected.description", {
        provider: provider().name
      })
    });
  }
  function goBack() {
    if (methods().length === 1) {
      all();
      return;
    }
    if (store.authorization) {
      dispatch({
        type: "method.reset"
      });
      return;
    }
    if (store.methodIndex !== undefined) {
      dispatch({
        type: "method.reset"
      });
      return;
    }
    all();
  }
  function MethodSelection() {
    return [(() => {
      var _el$9 = _tmpl$4();
      _$insert(_el$9, () => language.t("provider.connect.selectMethod", {
        provider: provider().name
      }));
      return _el$9;
    })(), (() => {
      var _el$0 = _tmpl$5();
      _$insert(_el$0, _$createComponent(List, {
        ref: ref => {
          listRef = ref;
        },
        items: methods,
        key: m => m?.label,
        onSelect: async (selected, index) => {
          if (!selected) return;
          void selectMethod(index);
        },
        children: i => (() => {
          var _el$1 = _tmpl$6(),
            _el$10 = _el$1.firstChild,
            _el$11 = _el$10.nextSibling;
          _$insert(_el$11, () => methodLabel(i));
          return _el$1;
        })()
      }));
      return _el$0;
    })()];
  }
  function ApiAuthView() {
    const [formStore, setFormStore] = createStore({
      value: "",
      error: undefined
    });
    async function handleSubmit(e) {
      e.preventDefault();
      const form = e.currentTarget;
      const formData = new FormData(form);
      const apiKey = formData.get("apiKey");
      if (!apiKey?.trim()) {
        setFormStore("error", language.t("provider.connect.apiKey.required"));
        return;
      }
      setFormStore("error", undefined);
      await controller.connect(props.provider, apiKey);
      complete();
    }
    return (() => {
      var _el$12 = _tmpl$8(),
        _el$18 = _el$12.firstChild;
      _$insert(_el$12, _$createComponent(Switch, {
        get children() {
          return [_$createComponent(Match, {
            when: true,
            get children() {
              var _el$17 = _tmpl$4();
              _$insert(_el$17, () => language.t("provider.connect.apiKey.description", {
                provider: provider().name
              }));
              return _el$17;
            }
          })];
        }
      }), _el$18);
      _el$18.addEventListener("submit", handleSubmit);
      _$insert(_el$18, _$createComponent(TextField, {
        autofocus: true,
        type: "text",
        get label() {
          return language.t("provider.connect.apiKey.label", {
            provider: provider().name
          });
        },
        get placeholder() {
          return language.t("provider.connect.apiKey.placeholder");
        },
        name: "apiKey",
        get value() {
          return formStore.value;
        },
        onChange: v => setFormStore("value", v),
        get validationState() {
          return formStore.error ? "invalid" : undefined;
        },
        get error() {
          return formStore.error;
        }
      }), null);
      _$insert(_el$18, _$createComponent(Button, {
        "class": "w-auto",
        type: "submit",
        size: "large",
        variant: "primary",
        get children() {
          return language.t("common.continue");
        }
      }), null);
      return _el$12;
    })();
  }
  function OAuthCodeView() {
    const [formStore, setFormStore] = createStore({
      value: "",
      error: undefined
    });
    async function handleSubmit(e) {
      e.preventDefault();
      const form = e.currentTarget;
      const formData = new FormData(form);
      const code = formData.get("code");
      if (!code?.trim()) {
        setFormStore("error", language.t("provider.connect.oauth.code.required"));
        return;
      }
      setFormStore("error", undefined);
      const result = await controller.completeOAuth(props.provider, store.methodIndex, code);
      if (result.ok) {
        complete();
        return;
      }
      setFormStore("error", formatError(result.error, language.t("provider.connect.oauth.code.invalid")));
    }
    return (() => {
      var _el$19 = _tmpl$9(),
        _el$20 = _el$19.firstChild,
        _el$21 = _el$20.nextSibling;
      _$insert(_el$20, () => language.t("provider.connect.oauth.code.visit.prefix"), null);
      _$insert(_el$20, _$createComponent(Link, {
        get href() {
          return store.authorization.url;
        },
        get children() {
          return language.t("provider.connect.oauth.code.visit.link");
        }
      }), null);
      _$insert(_el$20, () => language.t("provider.connect.oauth.code.visit.suffix", {
        provider: provider().name
      }), null);
      _el$21.addEventListener("submit", handleSubmit);
      _$insert(_el$21, _$createComponent(TextField, {
        autofocus: true,
        type: "text",
        get label() {
          return language.t("provider.connect.oauth.code.label", {
            method: method()?.label ?? ""
          });
        },
        get placeholder() {
          return language.t("provider.connect.oauth.code.placeholder");
        },
        name: "code",
        get value() {
          return formStore.value;
        },
        onChange: v => setFormStore("value", v),
        get validationState() {
          return formStore.error ? "invalid" : undefined;
        },
        get error() {
          return formStore.error;
        }
      }), null);
      _$insert(_el$21, _$createComponent(Button, {
        "class": "w-auto",
        type: "submit",
        size: "large",
        variant: "primary",
        get children() {
          return language.t("common.continue");
        }
      }), null);
      return _el$19;
    })();
  }
  function OAuthAutoView() {
    const code = createMemo(() => {
      const instructions = store.authorization?.instructions;
      if (instructions?.includes(":")) {
        return instructions.split(":")[1]?.trim();
      }
      return instructions;
    });
    onMount(() => {
      void (async () => {
        const result = await controller.completeOAuth(props.provider, store.methodIndex);
        if (!alive.value) return;
        if (!result.ok) {
          const message = formatError(result.error, language.t("common.requestFailed"));
          dispatch({
            type: "auth.error",
            error: message
          });
          return;
        }
        complete();
      })();
    });
    return (() => {
      var _el$22 = _tmpl$0(),
        _el$23 = _el$22.firstChild,
        _el$24 = _el$23.nextSibling,
        _el$25 = _el$24.firstChild;
      _$insert(_el$23, () => language.t("provider.connect.oauth.auto.visit.prefix"), null);
      _$insert(_el$23, _$createComponent(Link, {
        get href() {
          return store.authorization.url;
        },
        get children() {
          return language.t("provider.connect.oauth.auto.visit.link");
        }
      }), null);
      _$insert(_el$23, () => language.t("provider.connect.oauth.auto.visit.suffix", {
        provider: provider().name
      }), null);
      _$insert(_el$22, _$createComponent(TextField, {
        get label() {
          return language.t("provider.connect.oauth.auto.confirmationCode");
        },
        "class": "font-mono",
        get value() {
          return code();
        },
        readOnly: true,
        copyable: true
      }), _el$24);
      _$insert(_el$24, _$createComponent(Spinner, {}), _el$25);
      _$insert(_el$25, () => language.t("provider.connect.status.waiting"));
      return _el$22;
    })();
  }
  return _$createComponent(Dialog, {
    get title() {
      return _$createComponent(IconButton, {
        tabIndex: -1,
        icon: "arrow-left",
        variant: "ghost",
        onClick: goBack,
        get ["aria-label"]() {
          return language.t("common.goBack");
        }
      });
    },
    get children() {
      var _el$26 = _tmpl$10(),
        _el$27 = _el$26.firstChild,
        _el$28 = _el$27.firstChild,
        _el$29 = _el$27.nextSibling,
        _el$30 = _el$29.firstChild;
      _$insert(_el$27, _$createComponent(ProviderIcon, {
        get id() {
          return props.provider;
        },
        "class": "size-5 shrink-0 text-secondary"
      }), _el$28);
      _$insert(_el$28, () => language.t("provider.connect.title", {
        provider: provider().name
      }));
      _el$30.$$keydown = handleKey;
      _$insert(_el$30, _$createComponent(Switch, {
        get children() {
          return [_$createComponent(Match, {
            get when() {
              return loading();
            },
            get children() {
              var _el$31 = _tmpl$1(),
                _el$32 = _el$31.firstChild,
                _el$33 = _el$32.firstChild;
              _$insert(_el$32, _$createComponent(Spinner, {}), _el$33);
              _$insert(_el$33, () => language.t("provider.connect.status.inProgress"));
              return _el$31;
            }
          }), _$createComponent(Match, {
            get when() {
              return store.methodIndex === undefined;
            },
            get children() {
              return _$createComponent(MethodSelection, {});
            }
          }), _$createComponent(Match, {
            get when() {
              return store.state === "pending";
            },
            get children() {
              var _el$34 = _tmpl$1(),
                _el$35 = _el$34.firstChild,
                _el$36 = _el$35.firstChild;
              _$insert(_el$35, _$createComponent(Spinner, {}), _el$36);
              _$insert(_el$36, () => language.t("provider.connect.status.inProgress"));
              return _el$34;
            }
          }), _$createComponent(Match, {
            get when() {
              return store.state === "prompt";
            },
            get children() {
              return _$createComponent(OAuthPromptsView, {});
            }
          }), _$createComponent(Match, {
            get when() {
              return store.state === "error";
            },
            get children() {
              var _el$37 = _tmpl$1(),
                _el$38 = _el$37.firstChild,
                _el$39 = _el$38.firstChild;
              _$insert(_el$38, _$createComponent(Icon, {
                name: "circle-ban-sign",
                "class": "text-danger"
              }), _el$39);
              _$insert(_el$39, () => language.t("provider.connect.status.failed", {
                error: store.error ?? ""
              }));
              return _el$37;
            }
          }), _$createComponent(Match, {
            get when() {
              return method()?.type === "api";
            },
            get children() {
              return _$createComponent(ApiAuthView, {});
            }
          }), _$createComponent(Match, {
            get when() {
              return method()?.type === "oauth";
            },
            get children() {
              return _$createComponent(Switch, {
                get children() {
                  return [_$createComponent(Match, {
                    get when() {
                      return store.authorization?.method === "code";
                    },
                    get children() {
                      return _$createComponent(OAuthCodeView, {});
                    }
                  }), _$createComponent(Match, {
                    get when() {
                      return store.authorization?.method === "auto";
                    },
                    get children() {
                      return _$createComponent(OAuthAutoView, {});
                    }
                  })];
                }
              });
            }
          })];
        }
      }));
      _$effect(() => _el$30.autofocus = store.methodIndex === undefined ? true : undefined);
      return _el$26;
    }
  });
}
_$delegateEvents(["keydown"]);