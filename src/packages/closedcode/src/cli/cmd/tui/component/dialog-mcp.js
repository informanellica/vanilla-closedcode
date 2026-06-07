import { createComponent as _$createComponent } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { effect as _$effect } from "@opentui/solid";
import { createTextNode as _$createTextNode } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { createMemo, createSignal } from "solid-js";
import { useLocal } from "@tui/context/local.js";
import { useSync } from "@tui/context/sync.js";
import { map, pipe, entries, sortBy } from "remeda";
import { DialogSelect } from "@tui/ui/dialog-select.js";
import { useTheme } from "../context/theme.js";
import { Keybind } from "@/util/keybind.js";
import { TextAttributes } from "@opentui/core";
import { useSDK } from "@tui/context/sdk.js";
function Status(props) {
  const {
    theme
  } = useTheme();
  if (props.loading) {
    return (() => {
      var _el$ = _$createElement("span");
      _$insertNode(_el$, _$createTextNode(`⋯ Loading`));
      _$effect(_$p => _$setProp(_el$, "style", {
        fg: theme.textMuted
      }, _$p));
      return _el$;
    })();
  }
  if (props.enabled) {
    return (() => {
      var _el$3 = _$createElement("span");
      _$insertNode(_el$3, _$createTextNode(`✓ Enabled`));
      _$effect(_$p => _$setProp(_el$3, "style", {
        fg: theme.success,
        attributes: TextAttributes.BOLD
      }, _$p));
      return _el$3;
    })();
  }
  return (() => {
    var _el$5 = _$createElement("span");
    _$insertNode(_el$5, _$createTextNode(`○ Disabled`));
    _$effect(_$p => _$setProp(_el$5, "style", {
      fg: theme.textMuted
    }, _$p));
    return _el$5;
  })();
}
export function DialogMcp() {
  const local = useLocal();
  const sync = useSync();
  const sdk = useSDK();
  const [, setRef] = createSignal();
  const [loading, setLoading] = createSignal(null);
  const options = createMemo(() => {
    // Track sync data and loading state to trigger re-render when they change
    const mcpData = sync.data.mcp;
    const loadingMcp = loading();
    return pipe(mcpData ?? {}, entries(), sortBy(([name]) => name), map(([name, status]) => ({
      value: name,
      title: name,
      description: status.status === "failed" ? "failed" : status.status,
      footer: _$createComponent(Status, {
        get enabled() {
          return local.mcp.isEnabled(name);
        },
        loading: loadingMcp === name
      }),
      category: undefined
    })));
  });
  const keybinds = createMemo(() => [{
    keybind: Keybind.parse("space")[0],
    title: "toggle",
    onTrigger: async option => {
      // Prevent toggling while an operation is already in progress
      if (loading() !== null) return;
      setLoading(option.value);
      try {
        await local.mcp.toggle(option.value);
        // Refresh MCP status from server
        const status = await sdk.client.mcp.status();
        if (status.data) {
          sync.set("mcp", status.data);
        } else {
          console.error("Failed to refresh MCP status: no data returned");
        }
      } catch (error) {
        console.error("Failed to toggle MCP:", error);
      } finally {
        setLoading(null);
      }
    }
  }]);
  return _$createComponent(DialogSelect, {
    ref: setRef,
    title: "MCPs",
    get options() {
      return options();
    },
    get keybind() {
      return keybinds();
    },
    onSelect: _option => {
      // Don't close on select, only on escape
    }
  });
}