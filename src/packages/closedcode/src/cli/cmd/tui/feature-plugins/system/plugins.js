import { createComponent as _$createComponent } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { memo as _$memo } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { effect as _$effect } from "@opentui/solid";
import { createTextNode as _$createTextNode } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { Keybind } from "#util/keybind.js";
import { useKeyboard, useTerminalDimensions } from "@opentui/solid";
import { fileURLToPath } from "url";
import { DialogSelect } from "#tui/ui/dialog-select.js";
import { Show, createEffect, createMemo, createSignal } from "solid-js";
const id = "internal:plugin-manager";
const key = Keybind.parse("space").at(0);
const add = Keybind.parse("shift+i").at(0);
const tab = Keybind.parse("tab").at(0);
function state(api, item) {
  if (!item.enabled) {
    return (() => {
      var _el$ = _$createElement("span");
      _$insertNode(_el$, _$createTextNode(`disabled`));
      _$effect(_$p => _$setProp(_el$, "style", {
        fg: api.theme.current.textMuted
      }, _$p));
      return _el$;
    })();
  }
  return (() => {
    var _el$3 = _$createElement("span");
    _$insert(_el$3, () => item.active ? "active" : "inactive");
    _$effect(_$p => _$setProp(_el$3, "style", {
      fg: item.active ? api.theme.current.success : api.theme.current.error
    }, _$p));
    return _el$3;
  })();
}
function source(spec) {
  if (!spec.startsWith("file://")) return;
  return fileURLToPath(spec);
}
function meta(item, width) {
  if (item.source === "internal") {
    if (width >= 120) return "Built-in plugin";
    return "Built-in";
  }
  const next = source(item.spec);
  if (next) return next;
  return item.spec;
}
function Install(props) {
  const [global, setGlobal] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  useKeyboard(evt => {
    if (evt.name !== "tab") return;
    evt.preventDefault();
    evt.stopPropagation();
    if (busy()) return;
    setGlobal(x => !x);
  });
  return _$createComponent(props.api.ui.DialogPrompt, {
    title: "Install plugin",
    placeholder: "npm package name",
    get busy() {
      return busy();
    },
    busyText: "Installing plugin...",
    description: () => (() => {
      var _el$4 = _$createElement("box"),
        _el$5 = _$createElement("text"),
        _el$7 = _$createElement("text");
      _$insertNode(_el$4, _el$5);
      _$insertNode(_el$4, _el$7);
      _$setProp(_el$4, "flexDirection", "row");
      _$setProp(_el$4, "gap", 1);
      _$insertNode(_el$5, _$createTextNode(`scope:`));
      _$insert(_el$7, () => global() ? "global" : "local");
      _$insert(_el$4, _$createComponent(Show, {
        get when() {
          return !busy();
        },
        get children() {
          var _el$8 = _$createElement("text"),
            _el$9 = _$createTextNode(`(`),
            _el$0 = _$createTextNode(` toggle)`);
          _$insertNode(_el$8, _el$9);
          _$insertNode(_el$8, _el$0);
          _$insert(_el$8, () => Keybind.toString(tab), _el$0);
          _$effect(_$p => _$setProp(_el$8, "fg", props.api.theme.current.textMuted, _$p));
          return _el$8;
        }
      }), null);
      _$effect(_p$ => {
        var _v$ = props.api.theme.current.textMuted,
          _v$2 = busy() ? props.api.theme.current.textMuted : props.api.theme.current.text;
        _v$ !== _p$.e && (_p$.e = _$setProp(_el$5, "fg", _v$, _p$.e));
        _v$2 !== _p$.t && (_p$.t = _$setProp(_el$7, "fg", _v$2, _p$.t));
        return _p$;
      }, {
        e: undefined,
        t: undefined
      });
      return _el$4;
    })(),
    onConfirm: raw => {
      if (busy()) return;
      const mod = raw.trim();
      if (!mod) {
        props.api.ui.toast({
          variant: "error",
          message: "Plugin package name is required"
        });
        return;
      }
      setBusy(true);
      void props.api.plugins.install(mod, {
        global: global()
      }).then(out => {
        if (!out.ok) {
          props.api.ui.toast({
            variant: "error",
            message: out.message
          });
          if (out.missing) {
            props.api.ui.toast({
              variant: "info",
              message: "Check npm registry/auth settings and try again."
            });
          }
          show(props.api);
          return;
        }
        props.api.ui.toast({
          variant: "success",
          message: `Installed ${mod} (${global() ? "global" : "local"}: ${out.dir})`
        });
        if (!out.tui) {
          props.api.ui.toast({
            variant: "info",
            message: "Package has no TUI target to load in this app."
          });
          show(props.api);
          return;
        }
        return props.api.plugins.add(mod).then(ok => {
          if (!ok) {
            props.api.ui.toast({
              variant: "warning",
              message: "Installed plugin, but runtime load failed. See console/logs; restart TUI to retry."
            });
            show(props.api);
            return;
          }
          props.api.ui.toast({
            variant: "success",
            message: `Loaded ${mod} in current session.`
          });
          show(props.api);
        });
      }).finally(() => {
        setBusy(false);
      });
    },
    onCancel: () => {
      show(props.api);
    }
  });
}
function row(api, item, width) {
  return {
    title: item.id,
    value: item.id,
    category: item.source === "internal" ? "Internal" : "External",
    description: meta(item, width),
    footer: state(api, item),
    disabled: item.id === id
  };
}
function showInstall(api) {
  api.ui.dialog.replace(() => _$createComponent(Install, {
    api: api
  }));
}
function View(props) {
  const size = useTerminalDimensions();
  const [list, setList] = createSignal(props.api.plugins.list());
  const [cur, setCur] = createSignal();
  const [lock, setLock] = createSignal(false);
  createEffect(() => {
    const width = size().width;
    if (width >= 128) {
      props.api.ui.dialog.setSize("xlarge");
      return;
    }
    if (width >= 96) {
      props.api.ui.dialog.setSize("large");
      return;
    }
    props.api.ui.dialog.setSize("medium");
  });
  const rows = createMemo(() => [...list()].sort((a, b) => {
    const x = a.source === "internal" ? 1 : 0;
    const y = b.source === "internal" ? 1 : 0;
    if (x !== y) return x - y;
    return a.id.localeCompare(b.id);
  }).map(item => row(props.api, item, size().width)));
  const flip = x => {
    if (lock()) return;
    const item = list().find(entry => entry.id === x);
    if (!item) return;
    setLock(true);
    const task = item.active ? props.api.plugins.deactivate(x) : props.api.plugins.activate(x);
    void task.then(ok => {
      if (!ok) {
        props.api.ui.toast({
          variant: "error",
          message: `Failed to update plugin ${item.id}`
        });
      }
      setList(props.api.plugins.list());
    }).finally(() => {
      setLock(false);
    });
  };
  return _$createComponent(DialogSelect, {
    title: "Plugins",
    get options() {
      return rows();
    },
    get current() {
      return cur();
    },
    onMove: item => setCur(item.value),
    get keybind() {
      return [{
        title: "toggle",
        keybind: key,
        disabled: lock(),
        onTrigger: item => {
          setCur(item.value);
          flip(item.value);
        }
      }, {
        title: "install",
        keybind: add,
        disabled: lock(),
        onTrigger: () => {
          showInstall(props.api);
        }
      }];
    },
    onSelect: item => {
      setCur(item.value);
      flip(item.value);
    }
  });
}
function show(api) {
  api.ui.dialog.replace(() => _$createComponent(View, {
    api: api
  }));
}
const tui = async api => {
  api.command.register(() => [{
    title: "Plugins",
    value: "plugins.list",
    keybind: "plugin_manager",
    category: "System",
    onSelect() {
      show(api);
    }
  }, {
    title: "Install plugin",
    value: "plugins.install",
    category: "System",
    onSelect() {
      showInstall(api);
    }
  }]);
};
const plugin = {
  id,
  tui
};
export default plugin;