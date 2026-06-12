import { memo as _$memo } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { createComponent as _$createComponent } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { effect as _$effect } from "@opentui/solid";
import { createTextNode as _$createTextNode } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { createMemo, createSignal, onMount, Show } from "solid-js";
import { useSync } from "#tui/context/sync.js";
import { map, pipe, sortBy } from "remeda";
import { DialogSelect } from "#tui/ui/dialog-select.js";
import { useDialog } from "#tui/ui/dialog.js";
import { useSDK } from "../context/sdk.js";
import { DialogPrompt } from "../ui/dialog-prompt.js";
import { Link } from "../ui/link.js";
import { useTheme } from "../context/theme.js";
import { TextAttributes } from "@opentui/core";
import { DialogModel } from "./dialog-model.js";
import { useKeyboard } from "@opentui/solid";
import * as Clipboard from "#tui/util/clipboard.js";
import { useToast } from "../ui/toast.js";
import { isConsoleManagedProvider } from "#tui/util/provider-origin.js";
import { useConnected } from "./use-connected.js";
const PROVIDER_PRIORITY = {
  lmstudio: 0,
  ollama: 1
};
export function createDialogProviderOptions() {
  const sync = useSync();
  const dialog = useDialog();
  const sdk = useSDK();
  const toast = useToast();
  const {
    theme
  } = useTheme();
  const onboarded = useConnected();
  const options = createMemo(() => {
    return pipe(sync.data.provider_next.all, sortBy(x => PROVIDER_PRIORITY[x.id] ?? 99), map(provider => {
      const consoleManaged = isConsoleManagedProvider(sync.data.console_state.consoleManagedProviders, provider.id);
      const connected = sync.data.provider_next.connected.includes(provider.id);
      return {
        title: provider.name,
        value: provider.id,
        description: undefined,
        footer: consoleManaged ? sync.data.console_state.activeOrgName : undefined,
        category: provider.id in PROVIDER_PRIORITY ? "Popular" : "Other",
        gutter: connected && onboarded() ? () => (() => {
          var _el$ = _$createElement("text");
          _$insertNode(_el$, _$createTextNode(`✓`));
          _$effect(_$p => _$setProp(_el$, "fg", theme.success, _$p));
          return _el$;
        })() : undefined,
        async onSelect() {
          if (consoleManaged) return;
          const methods = sync.data.provider_auth[provider.id] ?? [{
            type: "api",
            label: "API key"
          }];
          let index = 0;
          if (methods.length > 1) {
            index = await new Promise(resolve => {
              dialog.replace(() => _$createComponent(DialogSelect, {
                title: "Select auth method",
                get options() {
                  return methods.map((x, index) => ({
                    title: x.label,
                    value: index
                  }));
                },
                onSelect: option => resolve(option.value)
              }), () => resolve(null));
            });
          }
          if (index == null) return;
          const method = methods[index];
          if (method.type === "oauth") {
            let inputs;
            if (method.prompts?.length) {
              const value = await PromptsMethod({
                dialog,
                prompts: method.prompts
              });
              if (!value) return;
              inputs = value;
            }
            const result = await sdk.client.provider.oauth.authorize({
              providerID: provider.id,
              method: index,
              inputs
            });
            if (result.error) {
              toast.show({
                variant: "error",
                message: JSON.stringify(result.error)
              });
              dialog.clear();
              return;
            }
            if (result.data?.method === "code") {
              dialog.replace(() => _$createComponent(CodeMethod, {
                get providerID() {
                  return provider.id;
                },
                get title() {
                  return method.label;
                },
                index: index,
                get authorization() {
                  return result.data;
                }
              }));
            }
            if (result.data?.method === "auto") {
              dialog.replace(() => _$createComponent(AutoMethod, {
                get providerID() {
                  return provider.id;
                },
                get title() {
                  return method.label;
                },
                index: index,
                get authorization() {
                  return result.data;
                }
              }));
            }
          }
          if (method.type === "api") {
            let metadata;
            if (method.prompts?.length) {
              const value = await PromptsMethod({
                dialog,
                prompts: method.prompts
              });
              if (!value) return;
              metadata = value;
            }
            return dialog.replace(() => _$createComponent(ApiMethod, {
              get providerID() {
                return provider.id;
              },
              get title() {
                return method.label;
              },
              metadata: metadata
            }));
          }
        }
      };
    }));
  });
  return options;
}
export function DialogProvider() {
  const options = createDialogProviderOptions();
  return _$createComponent(DialogSelect, {
    title: "Connect a provider",
    get options() {
      return options();
    }
  });
}
function AutoMethod(props) {
  const {
    theme
  } = useTheme();
  const sdk = useSDK();
  const dialog = useDialog();
  const sync = useSync();
  const toast = useToast();
  useKeyboard(evt => {
    if (evt.name === "c" && !evt.ctrl && !evt.meta) {
      const code = props.authorization.instructions.match(/[A-Z0-9]{4}-[A-Z0-9]{4,5}/)?.[0] ?? props.authorization.url;
      Clipboard.copy(code).then(() => toast.show({
        message: "Copied to clipboard",
        variant: "info"
      })).catch(toast.error);
    }
  });
  onMount(async () => {
    const result = await sdk.client.provider.oauth.callback({
      providerID: props.providerID,
      method: props.index
    });
    if (result.error) {
      dialog.clear();
      return;
    }
    await sdk.client.instance.dispose();
    await sync.bootstrap();
    dialog.replace(() => _$createComponent(DialogModel, {
      get providerID() {
        return props.providerID;
      }
    }));
  });
  return (() => {
    var _el$3 = _$createElement("box"),
      _el$4 = _$createElement("box"),
      _el$5 = _$createElement("text"),
      _el$6 = _$createElement("text"),
      _el$8 = _$createElement("box"),
      _el$9 = _$createElement("text"),
      _el$0 = _$createElement("text"),
      _el$10 = _$createElement("text"),
      _el$11 = _$createTextNode(`c `),
      _el$12 = _$createElement("span");
    _$insertNode(_el$3, _el$4);
    _$insertNode(_el$3, _el$8);
    _$insertNode(_el$3, _el$0);
    _$insertNode(_el$3, _el$10);
    _$setProp(_el$3, "paddingLeft", 2);
    _$setProp(_el$3, "paddingRight", 2);
    _$setProp(_el$3, "gap", 1);
    _$setProp(_el$3, "paddingBottom", 1);
    _$insertNode(_el$4, _el$5);
    _$insertNode(_el$4, _el$6);
    _$setProp(_el$4, "flexDirection", "row");
    _$setProp(_el$4, "justifyContent", "space-between");
    _$insert(_el$5, () => props.title);
    _$insertNode(_el$6, _$createTextNode(`esc`));
    _$setProp(_el$6, "onMouseUp", () => dialog.clear());
    _$insertNode(_el$8, _el$9);
    _$setProp(_el$8, "gap", 1);
    _$insert(_el$8, _$createComponent(Link, {
      get href() {
        return props.authorization.url;
      },
      get fg() {
        return theme.primary;
      }
    }), _el$9);
    _$insert(_el$9, () => props.authorization.instructions);
    _$insertNode(_el$0, _$createTextNode(`Waiting for authorization...`));
    _$insertNode(_el$10, _el$11);
    _$insertNode(_el$10, _el$12);
    _$insertNode(_el$12, _$createTextNode(`copy`));
    _$effect(_p$ => {
      var _v$ = TextAttributes.BOLD,
        _v$2 = theme.text,
        _v$3 = theme.textMuted,
        _v$4 = theme.textMuted,
        _v$5 = theme.textMuted,
        _v$6 = theme.text,
        _v$7 = {
          fg: theme.textMuted
        };
      _v$ !== _p$.e && (_p$.e = _$setProp(_el$5, "attributes", _v$, _p$.e));
      _v$2 !== _p$.t && (_p$.t = _$setProp(_el$5, "fg", _v$2, _p$.t));
      _v$3 !== _p$.a && (_p$.a = _$setProp(_el$6, "fg", _v$3, _p$.a));
      _v$4 !== _p$.o && (_p$.o = _$setProp(_el$9, "fg", _v$4, _p$.o));
      _v$5 !== _p$.i && (_p$.i = _$setProp(_el$0, "fg", _v$5, _p$.i));
      _v$6 !== _p$.n && (_p$.n = _$setProp(_el$10, "fg", _v$6, _p$.n));
      _v$7 !== _p$.s && (_p$.s = _$setProp(_el$12, "style", _v$7, _p$.s));
      return _p$;
    }, {
      e: undefined,
      t: undefined,
      a: undefined,
      o: undefined,
      i: undefined,
      n: undefined,
      s: undefined
    });
    return _el$3;
  })();
}
function CodeMethod(props) {
  const {
    theme
  } = useTheme();
  const sdk = useSDK();
  const sync = useSync();
  const dialog = useDialog();
  const [error, setError] = createSignal(false);
  return _$createComponent(DialogPrompt, {
    get title() {
      return props.title;
    },
    placeholder: "Authorization code",
    onConfirm: async value => {
      const {
        error
      } = await sdk.client.provider.oauth.callback({
        providerID: props.providerID,
        method: props.index,
        code: value
      });
      if (!error) {
        await sdk.client.instance.dispose();
        await sync.bootstrap();
        dialog.replace(() => _$createComponent(DialogModel, {
          get providerID() {
            return props.providerID;
          }
        }));
        return;
      }
      setError(true);
    },
    description: () => (() => {
      var _el$14 = _$createElement("box"),
        _el$15 = _$createElement("text");
      _$insertNode(_el$14, _el$15);
      _$setProp(_el$14, "gap", 1);
      _$insert(_el$15, () => props.authorization.instructions);
      _$insert(_el$14, _$createComponent(Link, {
        get href() {
          return props.authorization.url;
        },
        get fg() {
          return theme.primary;
        }
      }), null);
      _$insert(_el$14, _$createComponent(Show, {
        get when() {
          return error();
        },
        get children() {
          var _el$16 = _$createElement("text");
          _$insertNode(_el$16, _$createTextNode(`Invalid code`));
          _$effect(_$p => _$setProp(_el$16, "fg", theme.error, _$p));
          return _el$16;
        }
      }), null);
      _$effect(_$p => _$setProp(_el$15, "fg", theme.textMuted, _$p));
      return _el$14;
    })()
  });
}
function ApiMethod(props) {
  const dialog = useDialog();
  const sdk = useSDK();
  const sync = useSync();
  const {
    theme
  } = useTheme();
  return _$createComponent(DialogPrompt, {
    get title() {
      return props.title;
    },
    placeholder: "API key",
    get description() {
      return undefined;
    },
    onConfirm: async value => {
      if (!value) return;
      await sdk.client.auth.set({
        providerID: props.providerID,
        auth: {
          type: "api",
          key: value,
          ...(props.metadata ? {
            metadata: props.metadata
          } : {})
        }
      });
      await sdk.client.instance.dispose();
      await sync.bootstrap();
      dialog.replace(() => _$createComponent(DialogModel, {
        get providerID() {
          return props.providerID;
        }
      }));
    }
  });
}
async function PromptsMethod(props) {
  const inputs = {};
  for (const prompt of props.prompts) {
    if (prompt.when) {
      const value = inputs[prompt.when.key];
      if (value === undefined) continue;
      const matches = prompt.when.op === "eq" ? value === prompt.when.value : value !== prompt.when.value;
      if (!matches) continue;
    }
    if (prompt.type === "select") {
      const value = await new Promise(resolve => {
        props.dialog.replace(() => _$createComponent(DialogSelect, {
          get title() {
            return prompt.message;
          },
          get options() {
            return prompt.options.map(x => ({
              title: x.label,
              value: x.value,
              description: x.hint
            }));
          },
          onSelect: option => resolve(option.value)
        }), () => resolve(null));
      });
      if (value === null) return null;
      inputs[prompt.key] = value;
      continue;
    }
    const value = await new Promise(resolve => {
      props.dialog.replace(() => _$createComponent(DialogPrompt, {
        get title() {
          return prompt.message;
        },
        get placeholder() {
          return prompt.placeholder;
        },
        onConfirm: value => resolve(value)
      }), () => resolve(null));
    });
    if (value === null) return null;
    inputs[prompt.key] = value;
  }
  return inputs;
}