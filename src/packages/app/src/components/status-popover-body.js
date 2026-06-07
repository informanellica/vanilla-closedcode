import { template as _$template } from "solid-js/web";
import { delegateEvents as _$delegateEvents } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { classList as _$classList } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<code class="bg-body-tertiary px-1.5 py-0.5 rounded-1 text-body">`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div class="d-flex flex-column px-2 pb-2"><div class="d-flex flex-column p-3 bg-body rounded-1 min-h-14">`),
  _tmpl$3 = /*#__PURE__*/_$template(`<div class="d-flex align-items-center gap-1 w-[360px] rounded-3 shadow-[var(--shadow-lg-border-base)]">`),
  _tmpl$4 = /*#__PURE__*/_$template(`<div class=flex-1>`),
  _tmpl$5 = /*#__PURE__*/_$template(`<button type=button class="d-flex align-items-center gap-2 w-100 h-8 pl-3 pr-1.5 py-1.5 rounded-2 transition-colors text-left">`),
  _tmpl$6 = /*#__PURE__*/_$template(`<span class="small fw-normal text-body bg-body-tertiary px-1.5 py-0.5 rounded-2">`),
  _tmpl$7 = /*#__PURE__*/_$template(`<div class="fw-normal text-body text-center my-auto">`),
  _tmpl$8 = /*#__PURE__*/_$template(`<button type=button class="d-flex align-items-center gap-2 w-100 h-8 pl-3 pr-2 py-1 rounded-2 transition-colors text-left"><div></div><span class="fw-normal text-body truncate flex-1"></span><div>`),
  _tmpl$9 = /*#__PURE__*/_$template(`<div class="d-flex align-items-center gap-2 w-100 px-2 py-1"><div></div><span class="fw-normal text-body truncate">`),
  _tmpl$0 = /*#__PURE__*/_$template(`<div class="d-flex align-items-center gap-2 w-100 px-2 py-1"><div class="size-1.5 rounded-circle shrink-0 bg-success"></div><span class="fw-normal text-body truncate">`);
import { Button } from "@/bs/button.js";
import { useDialog } from "@/lib/dialog.js";
import { Icon } from "@/bs/icon.js";
import { Switch } from "@/bs/switch.js";
import { Tabs } from "@/bs/tabs.js";
import { showToast } from "@/lib/toast.js";
import { useNavigate } from "@solidjs/router";
import { createEffect, createMemo, For, onCleanup, Show } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { ServerHealthIndicator, ServerRow } from "@/components/server/server-row.js";
import { useLanguage } from "@/context/language.js";
import { usePlatform } from "@/context/platform.js";
import { normalizeServerUrl, ServerConnection, useServer } from "@/context/server.js";
import { useSync } from "@/context/sync.js";
import { useCheckServerHealth } from "@/utils/server-health.js";
import { useMcpController } from "@/controllers/mcp.js";
const pollMs = 10_000;
const pluginEmptyMessage = (value, file) => {
  const parts = value.split(file);
  if (parts.length === 1) return value;
  return [_$memo(() => parts[0]), (() => {
    var _el$ = _tmpl$();
    _$insert(_el$, file);
    return _el$;
  })(), _$memo(() => parts.slice(1).join(file))];
};
const listServersByHealth = (list, active, status) => {
  if (!list.length) return list;
  const order = new Map(list.map((url, index) => [url, index]));
  const rank = value => {
    if (value?.healthy === true) return 0;
    if (value?.healthy === false) return 2;
    return 1;
  };
  return list.slice().sort((a, b) => {
    if (ServerConnection.key(a) === active) return -1;
    if (ServerConnection.key(b) === active) return 1;
    const diff = rank(status[ServerConnection.key(a)]) - rank(status[ServerConnection.key(b)]);
    if (diff !== 0) return diff;
    return (order.get(a) ?? 0) - (order.get(b) ?? 0);
  });
};
const useServerHealth = (servers, enabled) => {
  const checkServerHealth = useCheckServerHealth();
  const [status, setStatus] = createStore({});
  createEffect(() => {
    if (!enabled()) {
      setStatus(reconcile({}));
      return;
    }
    const list = servers();
    let dead = false;
    const refresh = async () => {
      const results = {};
      await Promise.all(list.map(async conn => {
        results[ServerConnection.key(conn)] = await checkServerHealth(conn.http);
      }));
      if (dead) return;
      setStatus(reconcile(results));
    };
    void refresh();
    const id = setInterval(() => void refresh(), pollMs);
    onCleanup(() => {
      dead = true;
      clearInterval(id);
    });
  });
  return status;
};
const useDefaultServerKey = get => {
  const [state, setState] = createStore({
    url: undefined,
    tick: 0
  });
  createEffect(() => {
    state.tick;
    let dead = false;
    const result = get?.();
    if (!result) {
      setState("url", undefined);
      onCleanup(() => {
        dead = true;
      });
      return;
    }
    if (result instanceof Promise) {
      void result.then(next => {
        if (dead) return;
        setState("url", next ? normalizeServerUrl(next) : undefined);
      });
      onCleanup(() => {
        dead = true;
      });
      return;
    }
    setState("url", normalizeServerUrl(result));
    onCleanup(() => {
      dead = true;
    });
  });
  return {
    key: () => {
      const u = state.url;
      if (!u) return;
      return ServerConnection.key({
        type: "http",
        http: {
          url: u
        }
      });
    },
    refresh: () => setState("tick", value => value + 1)
  };
};
export function StatusPopoverBody(props) {
  const sync = useSync();
  const server = useServer();
  const platform = usePlatform();
  const dialog = useDialog();
  const language = useLanguage();
  const navigate = useNavigate();
  const fail = err => {
    showToast({
      variant: "error",
      title: language.t("common.requestFailed"),
      description: err instanceof Error ? err.message : String(err)
    });
  };
  createEffect(() => {
    if (!props.shown()) return;
  });
  let dialogRun = 0;
  let dialogDead = false;
  onCleanup(() => {
    dialogDead = true;
    dialogRun += 1;
  });
  const servers = createMemo(() => {
    const current = server.current;
    const list = server.list;
    if (!current) return list;
    if (list.every(item => ServerConnection.key(item) !== ServerConnection.key(current))) return [current, ...list];
    return [current, ...list.filter(item => ServerConnection.key(item) !== ServerConnection.key(current))];
  });
  const health = useServerHealth(servers, props.shown);
  const sortedServers = createMemo(() => listServersByHealth(servers(), server.key, health));
  const mcp = useMcpController({ onError: fail });
  const defaultServer = useDefaultServerKey(platform.getDefaultServer);
  const mcpNames = createMemo(() => Object.keys(sync.data?.mcp ?? {}).sort((a, b) => a.localeCompare(b)));
  const mcpStatus = mcp.statusOf;
  const mcpConnected = createMemo(() => mcpNames().filter(name => mcpStatus(name) === "connected").length);
  const lspItems = createMemo(() => sync.data?.lsp ?? []);
  const lspCount = createMemo(() => lspItems().length);
  const plugins = createMemo(() => (sync.data?.config.plugin ?? []).map(item => typeof item === "string" ? item : item[0]));
  const pluginCount = createMemo(() => plugins().length);
  const pluginEmpty = createMemo(() => pluginEmptyMessage(language.t("dialog.plugins.empty"), "closedcode.json"));
  return (() => {
    var _el$2 = _tmpl$3();
    _$insert(_el$2, _$createComponent(Tabs, {
      get ["aria-label"]() {
        return language.t("status.popover.ariaLabel");
      },
      "class": "tabs bg-body rounded-3 overflow-hidden",
      "data-component": "tabs",
      "data-active": "servers",
      defaultValue: "servers",
      variant: "alt",
      get children() {
        return [_$createComponent(Tabs.List, {
          "data-slot": "tablist",
          "class": "bg-transparent border-b-0 px-4 pt-2 pb-0 gap-4 h-10",
          get children() {
            return [_$createComponent(Tabs.Trigger, {
              value: "servers",
              "data-slot": "tab",
              "class": "small fw-normal",
              get children() {
                return [_$memo(() => _$memo(() => sortedServers().length > 0)() ? `${sortedServers().length} ` : ""), _$memo(() => language.t("status.popover.tab.servers"))];
              }
            }), _$createComponent(Tabs.Trigger, {
              value: "mcp",
              "data-slot": "tab",
              "class": "small fw-normal",
              get children() {
                return [_$memo(() => _$memo(() => mcpConnected() > 0)() ? `${mcpConnected()} ` : ""), _$memo(() => language.t("status.popover.tab.mcp"))];
              }
            }), _$createComponent(Tabs.Trigger, {
              value: "lsp",
              "data-slot": "tab",
              "class": "small fw-normal",
              get children() {
                return [_$memo(() => _$memo(() => lspCount() > 0)() ? `${lspCount()} ` : ""), _$memo(() => language.t("status.popover.tab.lsp"))];
              }
            }), _$createComponent(Tabs.Trigger, {
              value: "plugins",
              "data-slot": "tab",
              "class": "small fw-normal",
              get children() {
                return [_$memo(() => _$memo(() => pluginCount() > 0)() ? `${pluginCount()} ` : ""), _$memo(() => language.t("status.popover.tab.plugins"))];
              }
            })];
          }
        }), _$createComponent(Tabs.Content, {
          value: "servers",
          get children() {
            var _el$3 = _tmpl$2(),
              _el$4 = _el$3.firstChild;
            _$insert(_el$4, _$createComponent(For, {
              get each() {
                return sortedServers();
              },
              children: s => {
                const key = ServerConnection.key(s);
                const blocked = () => health[key]?.healthy === false;
                return (() => {
                  var _el$1 = _tmpl$5();
                  _el$1.$$click = () => {
                    if (blocked()) return;
                    navigate("/");
                    queueMicrotask(() => server.setActive(key));
                  };
                  _$insert(_el$1, _$createComponent(ServerHealthIndicator, {
                    get health() {
                      return health[key];
                    }
                  }), null);
                  _$insert(_el$1, _$createComponent(ServerRow, {
                    conn: s,
                    get dimmed() {
                      return blocked();
                    },
                    get status() {
                      return health[key];
                    },
                    "class": "flex items-center gap-2 w-full min-w-0",
                    nameClass: "fw-normal text-body truncate",
                    versionClass: "small fw-normal text-secondary truncate",
                    get badge() {
                      return _$createComponent(Show, {
                        get when() {
                          return key === defaultServer.key();
                        },
                        get children() {
                          var _el$11 = _tmpl$6();
                          _$insert(_el$11, () => language.t("common.default"));
                          return _el$11;
                        }
                      });
                    },
                    get children() {
                      return [_tmpl$4(), _$createComponent(Show, {
                        get when() {
                          return _$memo(() => !!server.current)() && key === ServerConnection.key(server.current);
                        },
                        get children() {
                          return _$createComponent(Icon, {
                            name: "check",
                            size: "small",
                            "class": "text-secondary shrink-0"
                          });
                        }
                      })];
                    }
                  }), null);
                  _$effect(_p$ => {
                    var _v$ = {
                        "cursor-not-allowed": blocked()
                      },
                      _v$2 = blocked();
                    _p$.e = _$classList(_el$1, _v$, _p$.e);
                    _v$2 !== _p$.t && _$setAttribute(_el$1, "aria-disabled", _p$.t = _v$2);
                    return _p$;
                  }, {
                    e: undefined,
                    t: undefined
                  });
                  return _el$1;
                })();
              }
            }), null);
            _$insert(_el$4, _$createComponent(Button, {
              variant: "secondary",
              "class": "mt-3 self-start h-8 px-3 py-1.5",
              onClick: () => {
                const run = ++dialogRun;
                void import("./dialog-select-server.js").then(x => {
                  if (dialogDead || dialogRun !== run) return;
                  dialog.show(() => _$createComponent(x.DialogSelectServer, {}), defaultServer.refresh);
                });
              },
              get children() {
                return language.t("status.popover.action.manageServers");
              }
            }), null);
            return _el$3;
          }
        }), _$createComponent(Tabs.Content, {
          value: "mcp",
          get children() {
            var _el$5 = _tmpl$2(),
              _el$6 = _el$5.firstChild;
            _$insert(_el$6, _$createComponent(Show, {
              get when() {
                return mcpNames().length > 0;
              },
              get fallback() {
                return (() => {
                  var _el$12 = _tmpl$7();
                  _$insert(_el$12, () => language.t("dialog.mcp.empty"));
                  return _el$12;
                })();
              },
              get children() {
                return _$createComponent(For, {
                  get each() {
                    return mcpNames();
                  },
                  children: name => {
                    const status = () => mcpStatus(name);
                    const enabled = () => status() === "connected";
                    return (() => {
                      var _el$13 = _tmpl$8(),
                        _el$14 = _el$13.firstChild,
                        _el$15 = _el$14.nextSibling,
                        _el$16 = _el$15.nextSibling;
                      _el$13.$$click = () => {
                        mcp.toggle(name);
                      };
                      _$insert(_el$15, name);
                      _el$16.$$click = event => event.stopPropagation();
                      _$insert(_el$16, _$createComponent(Switch, {
                        get checked() {
                          return enabled();
                        },
                        get disabled() {
                          return _$memo(() => !!mcp.isPending)() && mcp.pendingName === name;
                        },
                        onChange: () => {
                          mcp.toggle(name);
                        }
                      }));
                      _$effect(_p$ => {
                        var _v$3 = mcp.isPending && mcp.pendingName === name,
                          _v$4 = {
                            "size-1.5 rounded-circle shrink-0": true,
                            "bg-success": status() === "connected",
                            "bg-danger": status() === "failed",
                            "bg-secondary": status() === "disabled",
                            "bg-warning": status() === "needs_auth" || status() === "needs_client_registration"
                          };
                        _v$3 !== _p$.e && (_el$13.disabled = _p$.e = _v$3);
                        _p$.t = _$classList(_el$14, _v$4, _p$.t);
                        return _p$;
                      }, {
                        e: undefined,
                        t: undefined
                      });
                      return _el$13;
                    })();
                  }
                });
              }
            }));
            return _el$5;
          }
        }), _$createComponent(Tabs.Content, {
          value: "lsp",
          get children() {
            var _el$7 = _tmpl$2(),
              _el$8 = _el$7.firstChild;
            _$insert(_el$8, _$createComponent(Show, {
              get when() {
                return lspItems().length > 0;
              },
              get fallback() {
                return (() => {
                  var _el$17 = _tmpl$7();
                  _$insert(_el$17, () => language.t("dialog.lsp.empty"));
                  return _el$17;
                })();
              },
              get children() {
                return _$createComponent(For, {
                  get each() {
                    return lspItems();
                  },
                  children: item => (() => {
                    var _el$18 = _tmpl$9(),
                      _el$19 = _el$18.firstChild,
                      _el$20 = _el$19.nextSibling;
                    _$insert(_el$20, () => item.name || item.id);
                    _$effect(_$p => _$classList(_el$19, {
                      "size-1.5 rounded-circle shrink-0": true,
                      "bg-success": item.status === "connected",
                      "bg-danger": item.status === "error"
                    }, _$p));
                    return _el$18;
                  })()
                });
              }
            }));
            return _el$7;
          }
        }), _$createComponent(Tabs.Content, {
          value: "plugins",
          get children() {
            var _el$9 = _tmpl$2(),
              _el$0 = _el$9.firstChild;
            _$insert(_el$0, _$createComponent(Show, {
              get when() {
                return plugins().length > 0;
              },
              get fallback() {
                return (() => {
                  var _el$21 = _tmpl$7();
                  _$insert(_el$21, pluginEmpty);
                  return _el$21;
                })();
              },
              get children() {
                return _$createComponent(For, {
                  get each() {
                    return plugins();
                  },
                  children: plugin => (() => {
                    var _el$22 = _tmpl$0(),
                      _el$23 = _el$22.firstChild,
                      _el$24 = _el$23.nextSibling;
                    _$insert(_el$24, plugin);
                    return _el$22;
                  })()
                });
              }
            }));
            return _el$9;
          }
        })];
      }
    }));
    return _el$2;
  })();
}
_$delegateEvents(["click"]);