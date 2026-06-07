import { effect as _$effect } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { mergeProps as _$mergeProps } from "@opentui/solid";
import { createComponent as _$createComponent } from "@opentui/solid";
import { memo as _$memo } from "@opentui/solid";
import { render, TimeToFirstDraw, useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/solid";
import * as Clipboard from "@tui/util/clipboard.js";
import * as Selection from "@tui/util/selection.js";
import { createCliRenderer, MouseButton } from "@opentui/core";
import { RouteProvider, useRoute } from "@tui/context/route.js";
import { Switch, Match, createEffect, createMemo, ErrorBoundary, createSignal, onMount, batch, Show, on } from "solid-js";
import { win32DisableProcessedInput, win32InstallCtrlCGuard } from "./win32.js";
import { Flag } from "core/flag/flag";
import semver from "semver";
import { DialogProvider, useDialog } from "@tui/ui/dialog.js";
import { DialogProvider as DialogProviderList } from "@tui/component/dialog-provider.js";
import { ErrorComponent } from "@tui/component/error-component.js";
import { PluginRouteMissing } from "@tui/component/plugin-route-missing.js";
import { ProjectProvider } from "@tui/context/project.js";
import { EditorContextProvider } from "@tui/context/editor.js";
import { useEvent } from "@tui/context/event.js";
import { SDKProvider, useSDK } from "@tui/context/sdk.js";
import { StartupLoading } from "@tui/component/startup-loading.js";
import { SyncProvider, useSync } from "@tui/context/sync.js";
import { SyncProviderV2 } from "@tui/context/sync-v2.js";
import { LocalProvider, useLocal } from "@tui/context/local.js";
import { DialogModel } from "@tui/component/dialog-model.js";
import { useConnected } from "@tui/component/use-connected.js";
import { DialogMcp } from "@tui/component/dialog-mcp.js";
import { DialogStatus } from "@tui/component/dialog-status.js";
import { DialogThemeList } from "@tui/component/dialog-theme-list.js";
import { DialogHelp } from "./ui/dialog-help.js";
import { CommandProvider, useCommandDialog } from "@tui/component/dialog-command.js";
import { DialogAgent } from "@tui/component/dialog-agent.js";
import { DialogSessionList } from "@tui/component/dialog-session-list.js";
import { DialogConsoleOrg } from "@tui/component/dialog-console-org.js";
import { KeybindProvider, useKeybind } from "@tui/context/keybind.js";
import { ThemeProvider, useTheme } from "@tui/context/theme.js";
import { Home } from "@tui/routes/home.js";
import { Session } from "@tui/routes/session/index.js";
import { PromptHistoryProvider } from "./component/prompt/history.js";
import { FrecencyProvider } from "./component/prompt/frecency.js";
import { PromptStashProvider } from "./component/prompt/stash.js";
import { DialogAlert } from "./ui/dialog-alert.js";
import { DialogConfirm } from "./ui/dialog-confirm.js";
import { ToastProvider, useToast } from "./ui/toast.js";
import { ExitProvider, useExit } from "./context/exit.js";
import { Session as SessionApi } from "@/session/session.js";
import { TuiEvent } from "./event.js";
import { KVProvider, useKV } from "./context/kv.js";
import { Provider } from "@/provider/provider.js";
import { ArgsProvider, useArgs } from "./context/args.js";
import open from "open";
import { PromptRefProvider, usePromptRef } from "./context/prompt.js";
import { TuiConfigProvider, useTuiConfig } from "./context/tui-config.js";
import { createTuiApi } from "@/cli/cmd/tui/plugin/api.js";
import { TuiPluginRuntime } from "@/cli/cmd/tui/plugin/runtime.js";
import { FormatError, FormatUnknownError } from "@/cli/error.js";
import { DialogVariant } from "./component/dialog-variant.js";
function rendererConfig(_config) {
  const mouseEnabled = !Flag.CLOSEDCODE_DISABLE_MOUSE && (_config.mouse ?? true);
  return {
    externalOutputMode: "passthrough",
    targetFps: 60,
    gatherStats: false,
    exitOnCtrlC: false,
    useKittyKeyboard: {},
    autoFocus: false,
    openConsoleOnError: false,
    useMouse: mouseEnabled,
    consoleOptions: {
      keyBindings: [{
        name: "y",
        ctrl: true,
        action: "copy-selection"
      }],
      onCopySelection: text => {
        Clipboard.copy(text).catch(error => {
          console.error(`Failed to copy console selection to clipboard: ${error}`);
        });
      }
    }
  };
}
function errorMessage(error) {
  const formatted = FormatError(error);
  if (formatted !== undefined) return formatted;
  if (typeof error === "object" && error !== null && "data" in error && typeof error.data === "object" && error.data !== null && "message" in error.data && typeof error.data.message === "string") {
    return error.data.message;
  }
  return FormatUnknownError(error);
}
export function tui(input) {
  // promise to prevent immediate exit
  // oxlint-disable-next-line no-async-promise-executor -- intentional: async executor used for sequential setup before resolve
  return new Promise(async resolve => {
    const unguard = win32InstallCtrlCGuard();
    win32DisableProcessedInput();
    const onExit = async () => {
      unguard?.();
      resolve();
    };
    const onBeforeExit = async () => {
      await TuiPluginRuntime.dispose();
    };
    const renderer = await createCliRenderer(rendererConfig(input.config));
    // Prewarm palette before ThemeProvider mounts so `system` theme avoids a first-paint fallback flash.
    void renderer.getPalette({
      size: 16
    }).catch(() => undefined);
    const mode = (await renderer.waitForThemeMode(1000)) ?? "dark";
    await render(() => {
      return _$createComponent(ErrorBoundary, {
        fallback: (error, reset) => _$createComponent(ErrorComponent, {
          error: error,
          reset: reset,
          onBeforeExit: onBeforeExit,
          onExit: onExit,
          mode: mode
        }),
        get children() {
          return _$createComponent(ArgsProvider, _$mergeProps(() => input.args, {
            get children() {
              return _$createComponent(ExitProvider, {
                onBeforeExit: onBeforeExit,
                onExit: onExit,
                get children() {
                  return _$createComponent(KVProvider, {
                    get children() {
                      return _$createComponent(ToastProvider, {
                        get children() {
                          return _$createComponent(RouteProvider, {
                            get initialRoute() {
                              return input.args.continue ? {
                                type: "session",
                                sessionID: "dummy"
                              } : undefined;
                            },
                            get children() {
                              return _$createComponent(TuiConfigProvider, {
                                get config() {
                                  return input.config;
                                },
                                get children() {
                                  return _$createComponent(SDKProvider, {
                                    get url() {
                                      return input.url;
                                    },
                                    get directory() {
                                      return input.directory;
                                    },
                                    get fetch() {
                                      return input.fetch;
                                    },
                                    get headers() {
                                      return input.headers;
                                    },
                                    get events() {
                                      return input.events;
                                    },
                                    get children() {
                                      return _$createComponent(ProjectProvider, {
                                        get children() {
                                          return _$createComponent(SyncProvider, {
                                            get children() {
                                              return _$createComponent(SyncProviderV2, {
                                                get children() {
                                                  return _$createComponent(ThemeProvider, {
                                                    mode: mode,
                                                    get children() {
                                                      return _$createComponent(LocalProvider, {
                                                        get children() {
                                                          return _$createComponent(KeybindProvider, {
                                                            get children() {
                                                              return _$createComponent(PromptStashProvider, {
                                                                get children() {
                                                                  return _$createComponent(DialogProvider, {
                                                                    get children() {
                                                                      return _$createComponent(CommandProvider, {
                                                                        get children() {
                                                                          return _$createComponent(FrecencyProvider, {
                                                                            get children() {
                                                                              return _$createComponent(PromptHistoryProvider, {
                                                                                get children() {
                                                                                  return _$createComponent(PromptRefProvider, {
                                                                                    get children() {
                                                                                      return _$createComponent(EditorContextProvider, {
                                                                                        get children() {
                                                                                          return _$createComponent(App, {
                                                                                            get onSnapshot() {
                                                                                              return input.onSnapshot;
                                                                                            }
                                                                                          });
                                                                                        }
                                                                                      });
                                                                                    }
                                                                                  });
                                                                                }
                                                                              });
                                                                            }
                                                                          });
                                                                        }
                                                                      });
                                                                    }
                                                                  });
                                                                }
                                                              });
                                                            }
                                                          });
                                                        }
                                                      });
                                                    }
                                                  });
                                                }
                                              });
                                            }
                                          });
                                        }
                                      });
                                    }
                                  });
                                }
                              });
                            }
                          });
                        }
                      });
                    }
                  });
                }
              });
            }
          }));
        }
      });
    }, renderer);
  });
}
function App(props) {
  const tuiConfig = useTuiConfig();
  const route = useRoute();
  const dimensions = useTerminalDimensions();
  const renderer = useRenderer();
  const dialog = useDialog();
  const local = useLocal();
  const kv = useKV();
  const command = useCommandDialog();
  const keybind = useKeybind();
  const event = useEvent();
  const sdk = useSDK();
  const toast = useToast();
  const themeState = useTheme();
  const {
    theme,
    mode,
    setMode,
    locked,
    lock,
    unlock
  } = themeState;
  const sync = useSync();
  const exit = useExit();
  const promptRef = usePromptRef();
  const routes = new Map();
  const [routeRev, setRouteRev] = createSignal(0);
  const routeView = name => {
    routeRev();
    return routes.get(name)?.at(-1)?.render;
  };
  const api = createTuiApi({
    command,
    tuiConfig,
    dialog,
    keybind,
    kv,
    route,
    routes,
    bump: () => setRouteRev(x => x + 1),
    event,
    sdk,
    sync,
    theme: themeState,
    toast,
    renderer
  });
  const [ready, setReady] = createSignal(false);
  TuiPluginRuntime.init({
    api,
    config: tuiConfig
  }).catch(error => {
    console.error("Failed to load TUI plugins", error);
  }).finally(() => {
    setReady(true);
  });
  useKeyboard(evt => {
    if (!Flag.CLOSEDCODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT) return;
    const sel = renderer.getSelection();
    if (!sel) return;

    // Windows Terminal-like behavior:
    // - Ctrl+C copies and dismisses selection
    // - Esc dismisses selection
    // - Most other key input dismisses selection and is passed through
    if (evt.ctrl && evt.name === "c") {
      if (!Selection.copy(renderer, toast)) {
        renderer.clearSelection();
        return;
      }
      evt.preventDefault();
      evt.stopPropagation();
      return;
    }
    if (evt.name === "escape") {
      renderer.clearSelection();
      evt.preventDefault();
      evt.stopPropagation();
      return;
    }
    const focus = renderer.currentFocusedRenderable;
    if (focus?.hasSelection() && sel.selectedRenderables.includes(focus)) {
      return;
    }
    renderer.clearSelection();
  });

  // Wire up console copy-to-clipboard via opentui's onCopySelection callback
  renderer.console.onCopySelection = async text => {
    if (!text || text.length === 0) return;
    await Clipboard.copy(text).then(() => toast.show({
      message: "Copied to clipboard",
      variant: "info"
    })).catch(toast.error);
    renderer.clearSelection();
  };
  const [terminalTitleEnabled, setTerminalTitleEnabled] = createSignal(kv.get("terminal_title_enabled", true));
  const [pasteSummaryEnabled, setPasteSummaryEnabled] = createSignal(kv.get("paste_summary_enabled", !sync.data.config.experimental?.disable_paste_summary));

  // Update terminal window title based on current route and session
  createEffect(() => {
    if (!terminalTitleEnabled() || Flag.CLOSEDCODE_DISABLE_TERMINAL_TITLE) return;
    if (route.data.type === "home") {
      renderer.setTerminalTitle("ClosedCode");
      return;
    }
    if (route.data.type === "session") {
      const session = sync.session.get(route.data.sessionID);
      if (!session || SessionApi.isDefaultTitle(session.title)) {
        renderer.setTerminalTitle("ClosedCode");
        return;
      }
      const title = session.title.length > 40 ? session.title.slice(0, 37) + "..." : session.title;
      renderer.setTerminalTitle(`OC | ${title}`);
      return;
    }
    if (route.data.type === "plugin") {
      renderer.setTerminalTitle(`OC | ${route.data.id}`);
    }
  });
  const args = useArgs();
  onMount(() => {
    batch(() => {
      if (args.agent) local.agent.set(args.agent);
      if (args.model) {
        const {
          providerID,
          modelID
        } = Provider.parseModel(args.model);
        if (!providerID || !modelID) return toast.show({
          variant: "warning",
          message: `Invalid model format: ${args.model}`,
          duration: 3000
        });
        local.model.set({
          providerID,
          modelID
        }, {
          recent: true
        });
      }
      if (args.sessionID && !args.fork) {
        route.navigate({
          type: "session",
          sessionID: args.sessionID
        });
      }
    });
  });
  let continued = false;
  createEffect(() => {
    // When using -c, session list is loaded in blocking phase, so we can navigate at "partial"
    if (continued || sync.status === "loading" || !args.continue) return;
    const match = sync.data.session.toSorted((a, b) => b.time.updated - a.time.updated).find(x => x.parentID === undefined)?.id;
    if (match) {
      continued = true;
      if (args.fork) {
        void sdk.client.session.fork({
          sessionID: match
        }).then(result => {
          if (result.data?.id) {
            route.navigate({
              type: "session",
              sessionID: result.data.id
            });
          } else {
            toast.show({
              message: "Failed to fork session",
              variant: "error"
            });
          }
        });
      } else {
        route.navigate({
          type: "session",
          sessionID: match
        });
      }
    }
  });

  // Handle --session with --fork: wait for sync to be fully complete before forking
  // (session list loads in non-blocking phase for --session, so we must wait for "complete"
  // to avoid a race where reconcile overwrites the newly forked session)
  let forked = false;
  createEffect(() => {
    if (forked || sync.status !== "complete" || !args.sessionID || !args.fork) return;
    forked = true;
    void sdk.client.session.fork({
      sessionID: args.sessionID
    }).then(result => {
      if (result.data?.id) {
        route.navigate({
          type: "session",
          sessionID: result.data.id
        });
      } else {
        toast.show({
          message: "Failed to fork session",
          variant: "error"
        });
      }
    });
  });
  createEffect(on(() => sync.status === "complete" && sync.data.provider.length === 0, (isEmpty, wasEmpty) => {
    // only trigger when we transition into an empty-provider state
    if (!isEmpty || wasEmpty) return;
    dialog.replace(() => _$createComponent(DialogProviderList, {}));
  }));
  const connected = useConnected();
  command.register(() => [{
    title: "Switch session",
    value: "session.list",
    keybind: "session_list",
    category: "Session",
    suggested: sync.data.session.length > 0,
    slash: {
      name: "sessions",
      aliases: ["resume", "continue"]
    },
    onSelect: () => {
      dialog.replace(() => _$createComponent(DialogSessionList, {}));
    }
  }, {
    title: "New session",
    suggested: route.data.type === "session",
    value: "session.new",
    keybind: "session_new",
    category: "Session",
    slash: {
      name: "new",
      aliases: ["clear"]
    },
    onSelect: () => {
      route.navigate({
        type: "home"
      });
      dialog.clear();
    }
  }, {
    title: "Switch model",
    value: "model.list",
    keybind: "model_list",
    suggested: true,
    category: "Agent",
    slash: {
      name: "models"
    },
    onSelect: () => {
      dialog.replace(() => _$createComponent(DialogModel, {}));
    }
  }, {
    title: "Model cycle",
    value: "model.cycle_recent",
    keybind: "model_cycle_recent",
    category: "Agent",
    hidden: true,
    onSelect: () => {
      local.model.cycle(1);
    }
  }, {
    title: "Model cycle reverse",
    value: "model.cycle_recent_reverse",
    keybind: "model_cycle_recent_reverse",
    category: "Agent",
    hidden: true,
    onSelect: () => {
      local.model.cycle(-1);
    }
  }, {
    title: "Favorite cycle",
    value: "model.cycle_favorite",
    keybind: "model_cycle_favorite",
    category: "Agent",
    hidden: true,
    onSelect: () => {
      local.model.cycleFavorite(1);
    }
  }, {
    title: "Favorite cycle reverse",
    value: "model.cycle_favorite_reverse",
    keybind: "model_cycle_favorite_reverse",
    category: "Agent",
    hidden: true,
    onSelect: () => {
      local.model.cycleFavorite(-1);
    }
  }, {
    title: "Switch agent",
    value: "agent.list",
    keybind: "agent_list",
    category: "Agent",
    slash: {
      name: "agents"
    },
    onSelect: () => {
      dialog.replace(() => _$createComponent(DialogAgent, {}));
    }
  }, {
    title: "Toggle MCPs",
    value: "mcp.list",
    category: "Agent",
    slash: {
      name: "mcps"
    },
    onSelect: () => {
      dialog.replace(() => _$createComponent(DialogMcp, {}));
    }
  }, {
    title: "Agent cycle",
    value: "agent.cycle",
    keybind: "agent_cycle",
    category: "Agent",
    hidden: true,
    onSelect: () => {
      local.agent.move(1);
    }
  }, {
    title: "Variant cycle",
    value: "variant.cycle",
    keybind: "variant_cycle",
    category: "Agent",
    onSelect: () => {
      local.model.variant.cycle();
    }
  }, {
    title: "Switch model variant",
    value: "variant.list",
    keybind: "variant_list",
    category: "Agent",
    hidden: local.model.variant.list().length === 0,
    slash: {
      name: "variants"
    },
    onSelect: () => {
      dialog.replace(() => _$createComponent(DialogVariant, {}));
    }
  }, {
    title: "Agent cycle reverse",
    value: "agent.cycle.reverse",
    keybind: "agent_cycle_reverse",
    category: "Agent",
    hidden: true,
    onSelect: () => {
      local.agent.move(-1);
    }
  }, {
    title: "Connect provider",
    value: "provider.connect",
    suggested: !connected(),
    slash: {
      name: "connect"
    },
    onSelect: () => {
      dialog.replace(() => _$createComponent(DialogProviderList, {}));
    },
    category: "Provider"
  }, ...(sync.data.console_state.switchableOrgCount > 1 ? [{
    title: "Switch org",
    value: "console.org.switch",
    suggested: Boolean(sync.data.console_state.activeOrgName),
    slash: {
      name: "org",
      aliases: ["orgs", "switch-org"]
    },
    onSelect: () => {
      dialog.replace(() => _$createComponent(DialogConsoleOrg, {}));
    },
    category: "Provider"
  }] : []), {
    title: "View status",
    keybind: "status_view",
    value: "closedcode.status",
    slash: {
      name: "status"
    },
    onSelect: () => {
      dialog.replace(() => _$createComponent(DialogStatus, {}));
    },
    category: "System"
  }, {
    title: "Switch theme",
    value: "theme.switch",
    keybind: "theme_list",
    slash: {
      name: "themes"
    },
    onSelect: () => {
      dialog.replace(() => _$createComponent(DialogThemeList, {}));
    },
    category: "System"
  }, {
    title: mode() === "dark" ? "Switch to light mode" : "Switch to dark mode",
    value: "theme.switch_mode",
    onSelect: dialog => {
      setMode(mode() === "dark" ? "light" : "dark");
      dialog.clear();
    },
    category: "System"
  }, {
    title: locked() ? "Unlock theme mode" : "Lock theme mode",
    value: "theme.mode.lock",
    onSelect: dialog => {
      if (locked()) unlock();else lock();
      dialog.clear();
    },
    category: "System"
  }, {
    title: "Help",
    value: "help.show",
    slash: {
      name: "help"
    },
    onSelect: () => {
      dialog.replace(() => _$createComponent(DialogHelp, {}));
    },
    category: "System"
  }, {
    title: "Open docs",
    value: "docs.open",
    onSelect: () => {
      open("https://github.com/informanellica/vanilla-closedcode").catch(() => {});
      dialog.clear();
    },
    category: "System"
  }, {
    title: "Exit the app",
    value: "app.exit",
    slash: {
      name: "exit",
      aliases: ["quit", "q"]
    },
    onSelect: () => exit(),
    category: "System"
  }, {
    title: "Toggle debug panel",
    category: "System",
    value: "app.debug",
    onSelect: dialog => {
      renderer.toggleDebugOverlay();
      dialog.clear();
    }
  }, {
    title: "Toggle console",
    category: "System",
    value: "app.console",
    onSelect: dialog => {
      renderer.console.toggle();
      dialog.clear();
    }
  }, {
    title: "Write heap snapshot",
    category: "System",
    value: "app.heap_snapshot",
    onSelect: async dialog => {
      const files = await props.onSnapshot?.();
      toast.show({
        variant: "info",
        message: `Heap snapshot written to ${files?.join(", ")}`,
        duration: 5000
      });
      dialog.clear();
    }
  }, {
    title: "Suspend terminal",
    value: "terminal.suspend",
    keybind: "terminal_suspend",
    category: "System",
    hidden: true,
    enabled: tuiConfig.keybinds?.terminal_suspend !== "none",
    onSelect: () => {
      process.once("SIGCONT", () => {
        renderer.resume();
      });
      renderer.suspend();
      // pid=0 means send the signal to all processes in the process group
      process.kill(0, "SIGTSTP");
    }
  }, {
    title: terminalTitleEnabled() ? "Disable terminal title" : "Enable terminal title",
    value: "terminal.title.toggle",
    keybind: "terminal_title_toggle",
    category: "System",
    onSelect: dialog => {
      setTerminalTitleEnabled(prev => {
        const next = !prev;
        kv.set("terminal_title_enabled", next);
        if (!next) renderer.setTerminalTitle("");
        return next;
      });
      dialog.clear();
    }
  }, {
    title: kv.get("animations_enabled", true) ? "Disable animations" : "Enable animations",
    value: "app.toggle.animations",
    category: "System",
    onSelect: dialog => {
      kv.set("animations_enabled", !kv.get("animations_enabled", true));
      dialog.clear();
    }
  }, {
    title: kv.get("file_context_enabled", true) ? "Disable file context" : "Enable file context",
    value: "app.toggle.file_context",
    category: "System",
    onSelect: dialog => {
      kv.set("file_context_enabled", !kv.get("file_context_enabled", true));
      dialog.clear();
    }
  }, {
    title: pasteSummaryEnabled() ? "Disable paste summary" : "Enable paste summary",
    value: "app.toggle.paste_summary",
    category: "System",
    onSelect: dialog => {
      setPasteSummaryEnabled(prev => {
        const next = !prev;
        kv.set("paste_summary_enabled", next);
        return next;
      });
      dialog.clear();
    }
  }, {
    title: kv.get("session_directory_filter_enabled", true) ? "Disable session directory filtering" : "Enable session directory filtering",
    value: "app.toggle.session_directory_filter",
    category: "System",
    onSelect: async dialog => {
      kv.set("session_directory_filter_enabled", !kv.get("session_directory_filter_enabled", true));
      await sync.session.refresh();
      dialog.clear();
    }
  }, {
    title: kv.get("diff_wrap_mode", "word") === "word" ? "Disable diff wrapping" : "Enable diff wrapping",
    value: "app.toggle.diffwrap",
    category: "System",
    onSelect: dialog => {
      const current = kv.get("diff_wrap_mode", "word");
      kv.set("diff_wrap_mode", current === "word" ? "none" : "word");
      dialog.clear();
    }
  }]);
  event.on(TuiEvent.CommandExecute.type, evt => {
    command.trigger(evt.properties.command);
  });
  event.on(TuiEvent.ToastShow.type, evt => {
    toast.show({
      title: evt.properties.title,
      message: evt.properties.message,
      variant: evt.properties.variant,
      duration: evt.properties.duration
    });
  });
  event.on(TuiEvent.SessionSelect.type, evt => {
    route.navigate({
      type: "session",
      sessionID: evt.properties.sessionID
    });
  });
  event.on("session.deleted", evt => {
    if (route.data.type === "session" && route.data.sessionID === evt.properties.info.id) {
      route.navigate({
        type: "home"
      });
      toast.show({
        variant: "info",
        message: "The current session was deleted"
      });
    }
  });
  event.on("session.error", evt => {
    const error = evt.properties.error;
    if (error && typeof error === "object" && error.name === "MessageAbortedError") return;
    const message = errorMessage(error);
    toast.show({
      variant: "error",
      message,
      duration: 5000
    });
  });
  event.on("installation.update-available", async evt => {
    const version = evt.properties.version;
    const skipped = kv.get("skipped_version");
    if (skipped && !semver.gt(version, skipped)) return;
    const choice = await DialogConfirm.show(dialog, `Update Available`, `A new release v${version} is available. Would you like to update now?`, "skip");
    if (choice === false) {
      kv.set("skipped_version", version);
      return;
    }
    if (choice !== true) return;
    toast.show({
      variant: "info",
      message: `Updating to v${version}...`,
      duration: 30000
    });
    const result = await sdk.client.global.upgrade({
      target: version
    });
    if (result.error || !result.data?.success) {
      toast.show({
        variant: "error",
        title: "Update Failed",
        message: "Update failed",
        duration: 10000
      });
      return;
    }
    await DialogAlert.show(dialog, "Update Complete", `Successfully updated to ClosedCode v${result.data.version}. Please restart the application.`);
    void exit();
  });
  const plugin = createMemo(() => {
    if (!ready()) return;
    if (route.data.type !== "plugin") return;
    const render = routeView(route.data.id);
    if (!render) return _$createComponent(PluginRouteMissing, {
      get id() {
        return route.data.id;
      },
      onHome: () => route.navigate({
        type: "home"
      })
    });
    return render({
      params: route.data.data
    });
  });
  return (() => {
    var _el$ = _$createElement("box");
    _$setProp(_el$, "onMouseDown", evt => {
      if (!Flag.CLOSEDCODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT) return;
      if (evt.button !== MouseButton.RIGHT) return;
      if (!Selection.copy(renderer, toast)) return;
      evt.preventDefault();
      evt.stopPropagation();
    });
    _$insert(_el$, _$createComponent(Show, {
      get when() {
        return Flag.CLOSEDCODE_SHOW_TTFD;
      },
      get children() {
        return _$createComponent(TimeToFirstDraw, {});
      }
    }), null);
    _$insert(_el$, _$createComponent(Show, {
      get when() {
        return ready();
      },
      get children() {
        return _$createComponent(Switch, {
          get children() {
            return [_$createComponent(Match, {
              get when() {
                return route.data.type === "home";
              },
              get children() {
                return _$createComponent(Home, {});
              }
            }), _$createComponent(Match, {
              get when() {
                return route.data.type === "session";
              },
              get children() {
                return _$createComponent(Session, {});
              }
            })];
          }
        });
      }
    }), null);
    _$insert(_el$, plugin, null);
    _$insert(_el$, _$createComponent(TuiPluginRuntime.Slot, {
      name: "app"
    }), null);
    _$insert(_el$, _$createComponent(StartupLoading, {
      ready: ready
    }), null);
    _$effect(_p$ => {
      var _v$ = dimensions().width,
        _v$2 = dimensions().height,
        _v$3 = theme.background,
        _v$4 = Flag.CLOSEDCODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT ? undefined : () => Selection.copy(renderer, toast);
      _v$ !== _p$.e && (_p$.e = _$setProp(_el$, "width", _v$, _p$.e));
      _v$2 !== _p$.t && (_p$.t = _$setProp(_el$, "height", _v$2, _p$.t));
      _v$3 !== _p$.a && (_p$.a = _$setProp(_el$, "backgroundColor", _v$3, _p$.a));
      _v$4 !== _p$.o && (_p$.o = _$setProp(_el$, "onMouseUp", _v$4, _p$.o));
      return _p$;
    }, {
      e: undefined,
      t: undefined,
      a: undefined,
      o: undefined
    });
    return _el$;
  })();
}