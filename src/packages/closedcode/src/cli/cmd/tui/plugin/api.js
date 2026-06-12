import { mergeProps as _$mergeProps } from "@opentui/solid";
import { createComponent as _$createComponent } from "@opentui/solid";
import { Dialog as DialogUI } from "#tui/ui/dialog.js";
import { createPluginKeybind } from "../context/plugin-keybinds.js";
import { DialogAlert } from "../ui/dialog-alert.js";
import { DialogConfirm } from "../ui/dialog-confirm.js";
import { DialogPrompt } from "../ui/dialog-prompt.js";
import { DialogSelect } from "../ui/dialog-select.js";
import { Prompt } from "../component/prompt/index.js";
import { Slot as HostSlot } from "./slots.js";
import { InstallationVersion } from "core/installation/version";
function routeRegister(routes, list, bump) {
  const key = Symbol();
  for (const item of list) {
    const prev = routes.get(item.name) ?? [];
    prev.push({
      key,
      render: item.render
    });
    routes.set(item.name, prev);
  }
  bump();
  return () => {
    for (const item of list) {
      const prev = routes.get(item.name);
      if (!prev) continue;
      const next = prev.filter(x => x.key !== key);
      if (!next.length) {
        routes.delete(item.name);
        continue;
      }
      routes.set(item.name, next);
    }
    bump();
  };
}
function routeNavigate(route, name, params) {
  if (name === "home") {
    route.navigate({
      type: "home"
    });
    return;
  }
  if (name === "session") {
    const sessionID = params?.sessionID;
    if (typeof sessionID !== "string") return;
    route.navigate({
      type: "session",
      sessionID
    });
    return;
  }
  route.navigate({
    type: "plugin",
    id: name,
    data: params
  });
}
function routeCurrent(route) {
  if (route.data.type === "home") return {
    name: "home"
  };
  if (route.data.type === "session") {
    return {
      name: "session",
      params: {
        sessionID: route.data.sessionID,
        prompt: route.data.prompt
      }
    };
  }
  return {
    name: route.data.id,
    params: route.data.data
  };
}
function mapOption(item) {
  return {
    ...item,
    onSelect: () => item.onSelect?.()
  };
}
function pickOption(item) {
  return {
    title: item.title,
    value: item.value,
    description: item.description,
    footer: item.footer,
    category: item.category,
    disabled: item.disabled
  };
}
function mapOptionCb(cb) {
  if (!cb) return;
  return item => cb(pickOption(item));
}
function stateApi(sync) {
  return {
    get ready() {
      return sync.ready;
    },
    get config() {
      return sync.data.config;
    },
    get provider() {
      return sync.data.provider;
    },
    get path() {
      return sync.path;
    },
    get vcs() {
      if (!sync.data.vcs) return;
      return {
        branch: sync.data.vcs.branch
      };
    },
    session: {
      count() {
        return sync.data.session.length;
      },
      diff(sessionID) {
        return sync.data.session_diff[sessionID] ?? [];
      },
      todo(sessionID) {
        return sync.data.todo[sessionID] ?? [];
      },
      messages(sessionID) {
        return sync.data.message[sessionID] ?? [];
      },
      status(sessionID) {
        return sync.data.session_status[sessionID];
      },
      permission(sessionID) {
        return sync.data.permission[sessionID] ?? [];
      },
      question(sessionID) {
        return sync.data.question[sessionID] ?? [];
      }
    },
    part(messageID) {
      return sync.data.part[messageID] ?? [];
    },
    lsp() {
      return sync.data.lsp.map(item => ({
        id: item.id,
        root: item.root,
        status: item.status
      }));
    },
    mcp() {
      return Object.entries(sync.data.mcp).sort(([a], [b]) => a.localeCompare(b)).map(([name, item]) => ({
        name,
        status: item.status,
        error: item.status === "failed" ? item.error : undefined
      }));
    }
  };
}
function appApi() {
  return {
    get version() {
      return InstallationVersion;
    }
  };
}
export function createTuiApi(input) {
  const lifecycle = {
    signal: new AbortController().signal,
    onDispose() {
      return () => {};
    }
  };
  return {
    app: appApi(),
    command: {
      register(cb) {
        return input.command.register(() => cb());
      },
      trigger(value) {
        input.command.trigger(value);
      },
      show() {
        input.command.show();
      }
    },
    route: {
      register(list) {
        return routeRegister(input.routes, list, input.bump);
      },
      navigate(name, params) {
        routeNavigate(input.route, name, params);
      },
      get current() {
        return routeCurrent(input.route);
      }
    },
    ui: {
      Dialog(props) {
        return _$createComponent(DialogUI, {
          get size() {
            return props.size;
          },
          get onClose() {
            return props.onClose;
          },
          get children() {
            return props.children;
          }
        });
      },
      DialogAlert(props) {
        return _$createComponent(DialogAlert, props);
      },
      DialogConfirm(props) {
        return _$createComponent(DialogConfirm, props);
      },
      DialogPrompt(props) {
        return _$createComponent(DialogPrompt, _$mergeProps(props, {
          get description() {
            return props.description;
          }
        }));
      },
      DialogSelect(props) {
        return _$createComponent(DialogSelect, {
          get title() {
            return props.title;
          },
          get placeholder() {
            return props.placeholder;
          },
          get options() {
            return props.options.map(mapOption);
          },
          get flat() {
            return props.flat;
          },
          get onMove() {
            return mapOptionCb(props.onMove);
          },
          get onFilter() {
            return props.onFilter;
          },
          get onSelect() {
            return mapOptionCb(props.onSelect);
          },
          get skipFilter() {
            return props.skipFilter;
          },
          get current() {
            return props.current;
          }
        });
      },
      Slot(props) {
        return _$createComponent(HostSlot, props);
      },
      Prompt(props) {
        return _$createComponent(Prompt, {
          get sessionID() {
            return props.sessionID;
          },
          get workspaceID() {
            return props.workspaceID;
          },
          get visible() {
            return props.visible;
          },
          get disabled() {
            return props.disabled;
          },
          get onSubmit() {
            return props.onSubmit;
          },
          ref(r$) {
            var _ref$ = props.ref;
            typeof _ref$ === "function" ? _ref$(r$) : props.ref = r$;
          },
          get hint() {
            return props.hint;
          },
          get right() {
            return props.right;
          },
          get showPlaceholder() {
            return props.showPlaceholder;
          },
          get placeholders() {
            return props.placeholders;
          }
        });
      },
      toast(inputToast) {
        input.toast.show({
          title: inputToast.title,
          message: inputToast.message,
          variant: inputToast.variant ?? "info",
          duration: inputToast.duration
        });
      },
      dialog: {
        replace(render, onClose) {
          input.dialog.replace(render, onClose);
        },
        clear() {
          input.dialog.clear();
        },
        setSize(size) {
          input.dialog.setSize(size);
        },
        get size() {
          return input.dialog.size;
        },
        get depth() {
          return input.dialog.stack.length;
        },
        get open() {
          return input.dialog.stack.length > 0;
        }
      }
    },
    keybind: {
      match(key, evt) {
        return input.keybind.match(key, evt);
      },
      print(key) {
        return input.keybind.print(key);
      },
      create(defaults, overrides) {
        return createPluginKeybind(input.keybind, defaults, overrides);
      }
    },
    get tuiConfig() {
      return input.tuiConfig;
    },
    kv: {
      get(key, fallback) {
        return input.kv.get(key, fallback);
      },
      set(key, value) {
        input.kv.set(key, value);
      },
      get ready() {
        return input.kv.ready;
      }
    },
    state: stateApi(input.sync),
    get client() {
      return input.sdk.client;
    },
    event: input.event,
    renderer: input.renderer,
    slots: {
      register() {
        throw new Error("slots.register is only available in plugin context");
      }
    },
    plugins: {
      list() {
        return [];
      },
      async activate() {
        return false;
      },
      async deactivate() {
        return false;
      },
      async add() {
        return false;
      },
      async install() {
        return {
          ok: false,
          message: "plugins.install is only available in plugin context"
        };
      }
    },
    lifecycle,
    theme: {
      get current() {
        return input.theme.theme;
      },
      get selected() {
        return input.theme.selected;
      },
      has(name) {
        return input.theme.has(name);
      },
      set(name) {
        return input.theme.set(name);
      },
      async install(_jsonPath) {
        throw new Error("theme.install is only available in plugin context");
      },
      mode() {
        return input.theme.mode();
      },
      get ready() {
        return input.theme.ready;
      }
    }
  };
}