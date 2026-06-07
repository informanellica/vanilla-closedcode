import { template as _$template } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div class="d-flex flex-column h-full overflow-y-auto no-scrollbar px-4 pb-10 sm:px-10 sm:pb-10"><div class="sticky top-0 z-10 bg-[linear-gradient(to_bottom,var(--surface-stronger-non-alpha)_calc(100%_-_24px),transparent)]"><div class="d-flex flex-column gap-1 pt-6 pb-8 max-w-[720px]"><h2 class="fs-6 fw-medium text-body-emphasis"></h2><span class="small fw-normal text-secondary"></span></div></div><div class="d-flex flex-column gap-4 max-w-[720px]">`),
  _tmplList$ = /*#__PURE__*/_$template(`<div class="d-flex flex-column gap-1 bg-body-tertiary rounded-3 p-2">`),
  _tmplRow$ = /*#__PURE__*/_$template(`<div class="group d-flex align-items-center gap-3 py-2.5 px-3 rounded-2 cursor-pointer">`),
  _tmplRight$ = /*#__PURE__*/_$template(`<div class="d-flex align-items-center gap-1 shrink-0">`),
  _tmplForm$ = /*#__PURE__*/_$template(`<div class="d-flex flex-column gap-3 p-3 rounded-3 bg-body-tertiary">`),
  _tmplBtns$ = /*#__PURE__*/_$template(`<div class="d-flex align-items-center gap-2">`),
  _tmplErr$ = /*#__PURE__*/_$template(`<span class="small fw-normal text-danger">`),
  _tmplEmpty$ = /*#__PURE__*/_$template(`<div class="fw-normal text-secondary py-3">`);
import { Button } from "@/bs/button.js";
import { Icon } from "@/bs/icon.js";
import { IconButton } from "@/bs/icon-button.js";
import { TextField } from "@/bs/text-field.js";
import { createEffect, For, onCleanup, Show } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { useLanguage } from "@/context/language.js";
import { normalizeServerUrl, ServerConnection, useServer } from "@/context/server.js";
import { useCheckServerHealth } from "@/utils/server-health.js";
import { ServerHealthIndicator, ServerRow } from "@/components/server/server-row.js";
const HEALTH_POLL_INTERVAL_MS = 10_000;
const emptyForm = () => ({
  open: false,
  mode: "add",
  id: undefined,
  url: "",
  name: "",
  error: "",
  busy: false
});
export const SettingsServer = () => {
  const language = useLanguage();
  const server = useServer();
  const checkServerHealth = useCheckServerHealth();
  const [state, setState] = createStore({
    status: {},
    form: emptyForm()
  });
  async function refreshHealth() {
    const list = server.list;
    const results = {};
    await Promise.all(list.map(async conn => {
      if (conn.type !== "http") return;
      results[ServerConnection.key(conn)] = await checkServerHealth(conn.http);
    }));
    setState("status", reconcile(results));
  }
  createEffect(() => {
    server.list;
    void refreshHealth();
    const id = setInterval(() => void refreshHealth(), HEALTH_POLL_INTERVAL_MS);
    onCleanup(() => clearInterval(id));
  });
  const switchTo = conn => {
    const key = ServerConnection.key(conn);
    if (key === server.key) return;
    if (state.status[key]?.healthy === false) return;
    server.setActive(key);
  };
  const openAdd = () => setState("form", {
    ...emptyForm(),
    open: true,
    mode: "add"
  });
  const openEdit = conn => {
    if (conn.type !== "http") return;
    setState("form", {
      open: true,
      mode: "edit",
      id: conn.http.url,
      url: conn.http.url,
      name: conn.displayName ?? "",
      error: "",
      busy: false
    });
  };
  const cancelForm = () => setState("form", emptyForm());
  const removeServer = conn => {
    server.remove(ServerConnection.key(conn));
    void refreshHealth();
  };
  async function submitForm() {
    if (state.form.busy) return;
    const normalized = normalizeServerUrl(state.form.url);
    if (!normalized) {
      setState("form", "error", language.t("dialog.server.add.error"));
      return;
    }
    const name = state.form.name.trim() || undefined;
    const conn = {
      type: "http",
      http: {
        url: normalized
      }
    };
    if (name) conn.displayName = name;
    setState("form", {
      busy: true,
      error: ""
    });
    const result = await checkServerHealth(conn.http);
    if (!result.healthy) {
      setState("form", {
        busy: false,
        error: language.t("dialog.server.add.error")
      });
      return;
    }
    if (state.form.mode === "edit" && state.form.id && state.form.id !== normalized) {
      const original = server.list.find(x => x.type === "http" && x.http.url === state.form.id);
      const active = server.key;
      const added = server.add(conn);
      if (original) {
        const origKey = ServerConnection.key(original);
        if (added && active === origKey) server.setActive(ServerConnection.key(added));
        server.remove(origKey);
      }
    } else {
      server.add(conn);
    }
    cancelForm();
    void refreshHealth();
  }
  return (() => {
    var _el$ = _tmpl$(),
      _el$2 = _el$.firstChild,
      _el$3 = _el$2.firstChild,
      _el$4 = _el$3.firstChild,
      _el$5 = _el$4.nextSibling,
      _el$6 = _el$2.nextSibling;
    _$insert(_el$4, () => language.t("settings.server.title"));
    _$insert(_el$5, () => language.t("dialog.server.description"));
    _$insert(_el$6, _$createComponent(Show, {
      get when() {
        return server.list.length > 0;
      },
      get fallback() {
        return (() => {
          var _e = _tmplEmpty$();
          _$insert(_e, () => language.t("settings.server.disconnected"));
          return _e;
        })();
      },
      get children() {
        var _list = _tmplList$();
        _$insert(_list, _$createComponent(For, {
          get each() {
            return server.list;
          },
          children: conn => {
            const key = ServerConnection.key(conn);
            var _row = _tmplRow$();
            _row.addEventListener("click", () => switchTo(conn));
            _$insert(_row, _$createComponent(ServerHealthIndicator, {
              get health() {
                return state.status[key];
              }
            }), null);
            _$insert(_row, _$createComponent(ServerRow, {
              conn: conn,
              get status() {
                return state.status[key];
              },
              showCredentials: true,
              "class": "d-flex align-items-center gap-2 min-w-0 flex-1",
              nameClass: "fw-medium text-body-emphasis truncate",
              versionClass: "small fw-normal text-secondary truncate"
            }), null);
            var _right = _tmplRight$();
            _$insert(_right, _$createComponent(Show, {
              get when() {
                return server.key === key;
              },
              get children() {
                return _$createComponent(Icon, {
                  name: "check",
                  "class": "text-secondary shrink-0"
                });
              }
            }), null);
            // Edit / delete only apply to user-added http servers. The built-in
            // local server (type !== "http") is not editable/removable, so don't
            // render dead controls for it (the pencil otherwise silently no-ops).
            _$insert(_right, _$createComponent(Show, {
              get when() {
                return conn.type === "http";
              },
              get children() {
                return [_$createComponent(IconButton, {
                  icon: "pencil-line",
                  variant: "ghost",
                  get ["aria-label"]() {
                    return language.t("dialog.server.menu.edit");
                  },
                  onClick: e => {
                    e?.stopPropagation?.();
                    openEdit(conn);
                  }
                }), _$createComponent(IconButton, {
                  icon: "circle-x",
                  variant: "ghost",
                  get ["aria-label"]() {
                    return language.t("dialog.server.menu.delete");
                  },
                  onClick: e => {
                    e?.stopPropagation?.();
                    removeServer(conn);
                  }
                })];
              }
            }), null);
            _$insert(_row, _right, null);
            return _row;
          }
        }));
        return _list;
      }
    }), null);
    _$insert(_el$6, _$createComponent(Show, {
      get when() {
        return state.form.open;
      },
      get fallback() {
        return _$createComponent(Button, {
          variant: "secondary",
          "class": "self-start h-8 px-3 py-1.5",
          onClick: openAdd,
          get children() {
            return [_$createComponent(Icon, {
              name: "plus-small"
            }), _$createComponent(Show, {
              when: true,
              get children() {
                return language.t("dialog.server.add.button");
              }
            })];
          }
        });
      },
      get children() {
        var _form = _tmplForm$();
        _$insert(_form, _$createComponent(TextField, {
          type: "text",
          get value() {
            return state.form.url;
          },
          onChange: v => setState("form", {
            url: v,
            error: ""
          }),
          get placeholder() {
            return language.t("dialog.server.add.placeholder");
          },
          spellcheck: false,
          autocorrect: "off",
          autocomplete: "off",
          autocapitalize: "off"
        }), null);
        _$insert(_form, _$createComponent(TextField, {
          type: "text",
          get value() {
            return state.form.name;
          },
          onChange: v => setState("form", {
            name: v
          }),
          get placeholder() {
            return language.t("dialog.server.add.namePlaceholder");
          },
          spellcheck: false,
          autocorrect: "off",
          autocomplete: "off",
          autocapitalize: "off"
        }), null);
        _$insert(_form, _$createComponent(Show, {
          get when() {
            return state.form.error;
          },
          get children() {
            var _e = _tmplErr$();
            _$insert(_e, () => state.form.error);
            return _e;
          }
        }), null);
        var _btns = _tmplBtns$();
        _$insert(_btns, _$createComponent(Button, {
          variant: "primary",
          get disabled() {
            return state.form.busy;
          },
          onClick: submitForm,
          get children() {
            return state.form.busy ? language.t("dialog.server.add.checking") : state.form.mode === "edit" ? language.t("common.save") : language.t("dialog.server.add.button");
          }
        }), null);
        _$insert(_btns, _$createComponent(Button, {
          variant: "secondary",
          onClick: cancelForm,
          get children() {
            return language.t("common.cancel");
          }
        }), null);
        _$insert(_form, _btns, null);
        return _form;
      }
    }), null);
    return _el$;
  })();
};
