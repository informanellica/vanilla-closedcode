import { template as _$template } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div class="d-flex min-w-0 flex-1 align-items-center overflow-visible"><span class="flex-1 min-w-0 text-12-regular text-secondary truncate text-left">`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div class="d-flex size-5 shrink-0 align-items-center justify-content-center [&amp;_[data-component=app-icon]]:size-5">`),
  _tmpl$3 = /*#__PURE__*/_$template(`<div class="d-flex size-5 shrink-0 align-items-center justify-content-center">`),
  _tmpl$4 = /*#__PURE__*/_$template(`<div class="d-flex align-items-center"><div class="d-flex h-[24px] box-border align-items-center rounded-2 border bg-body-tertiary overflow-hidden">`),
  _tmpl$5 = /*#__PURE__*/_$template(`<div class="d-none xl:flex align-items-center">`),
  _tmpl$6 = /*#__PURE__*/_$template(`<div class="position-relative d-flex align-items-center justify-content-center size-4">`),
  _tmpl$7 = /*#__PURE__*/_$template(`<div class="d-flex align-items-center gap-2"><div class="d-flex align-items-center gap-1"><div class="d-none md:flex align-items-center gap-1 shrink-0">`),
  _tmpl$8 = /*#__PURE__*/_$template(`<span class="small fw-normal text-body-emphasis">`),
  _tmpl$9 = /*#__PURE__*/_$template(`<div class="d-flex h-[24px] box-border align-items-center rounded-2 border bg-body-tertiary overflow-hidden">`);
import { AppIcon } from "@/vendor/ui/components/app-icon.js";
import { Button } from "@/bs/button.js";
import { DropdownMenu } from "@/bs/dropdown-menu.js";
import { Icon } from "@/bs/icon.js";
import { IconButton } from "@/bs/icon-button.js";
import { Keybind } from "@/vendor/ui/components/keybind.js";
import { Spinner } from "@/bs/spinner.js";
import { showToast } from "@/lib/toast.js";
import { Tooltip, TooltipKeybind } from "@/bs/tooltip.js";
import { env } from "@/lib/env.js";
import { getFilename } from "core/util/path";
import { createEffect, createMemo, createSignal, For, onMount, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { Portal } from "solid-js/web";
import { useCommand } from "@/context/command.js";
import { useLanguage } from "@/context/language.js";
import { useLayout } from "@/context/layout.js";
import { usePlatform } from "@/context/platform.js";
import { useServer } from "@/context/server.js";
import { useSettings } from "@/context/settings.js";
import { useSync } from "@/context/sync.js";
import { useTerminal } from "@/context/terminal.js";
import { focusTerminalById } from "@/pages/session/helpers.js";
import { useSessionLayout } from "@/pages/session/session-layout.js";
import { messageAgentColor } from "@/utils/agent.js";
import { decode64 } from "@/utils/base64.js";
import { Persist, persisted } from "@/utils/persist.js";
import { StatusPopover } from "../status-popover.js";
const OPEN_APPS = ["vscode", "cursor", "zed", "textmate", "antigravity", "finder", "terminal", "iterm2", "ghostty", "warp", "xcode", "android-studio", "powershell", "sublime-text"];
const MAC_APPS = [{
  id: "vscode",
  label: "session.header.open.app.vscode",
  icon: "vscode",
  openWith: "Visual Studio Code"
}, {
  id: "cursor",
  label: "session.header.open.app.cursor",
  icon: "cursor",
  openWith: "Cursor"
}, {
  id: "zed",
  label: "session.header.open.app.zed",
  icon: "zed",
  openWith: "Zed"
}, {
  id: "textmate",
  label: "session.header.open.app.textmate",
  icon: "textmate",
  openWith: "TextMate"
}, {
  id: "antigravity",
  label: "session.header.open.app.antigravity",
  icon: "antigravity",
  openWith: "Antigravity"
}, {
  id: "terminal",
  label: "session.header.open.app.terminal",
  icon: "terminal",
  openWith: "Terminal"
}, {
  id: "iterm2",
  label: "session.header.open.app.iterm2",
  icon: "iterm2",
  openWith: "iTerm"
}, {
  id: "ghostty",
  label: "session.header.open.app.ghostty",
  icon: "ghostty",
  openWith: "Ghostty"
}, {
  id: "warp",
  label: "session.header.open.app.warp",
  icon: "warp",
  openWith: "Warp"
}, {
  id: "xcode",
  label: "session.header.open.app.xcode",
  icon: "xcode",
  openWith: "Xcode"
}, {
  id: "android-studio",
  label: "session.header.open.app.androidStudio",
  icon: "android-studio",
  openWith: "Android Studio"
}, {
  id: "sublime-text",
  label: "session.header.open.app.sublimeText",
  icon: "sublime-text",
  openWith: "Sublime Text"
}];
const WINDOWS_APPS = [{
  id: "vscode",
  label: "session.header.open.app.vscode",
  icon: "vscode",
  openWith: "code"
}, {
  id: "cursor",
  label: "session.header.open.app.cursor",
  icon: "cursor",
  openWith: "cursor"
}, {
  id: "zed",
  label: "session.header.open.app.zed",
  icon: "zed",
  openWith: "zed"
}, {
  id: "powershell",
  label: "session.header.open.app.powershell",
  icon: "powershell",
  openWith: "powershell"
}, {
  id: "sublime-text",
  label: "session.header.open.app.sublimeText",
  icon: "sublime-text",
  openWith: "Sublime Text"
}];
const LINUX_APPS = [{
  id: "vscode",
  label: "session.header.open.app.vscode",
  icon: "vscode",
  openWith: "code"
}, {
  id: "cursor",
  label: "session.header.open.app.cursor",
  icon: "cursor",
  openWith: "cursor"
}, {
  id: "zed",
  label: "session.header.open.app.zed",
  icon: "zed",
  openWith: "zed"
}, {
  id: "sublime-text",
  label: "session.header.open.app.sublimeText",
  icon: "sublime-text",
  openWith: "Sublime Text"
}];
const detectOS = platform => {
  if (platform.platform === "desktop" && platform.os) return platform.os;
  if (typeof navigator !== "object") return "unknown";
  const value = navigator.platform || navigator.userAgent;
  if (/Mac/i.test(value)) return "macos";
  if (/Win/i.test(value)) return "windows";
  if (/Linux/i.test(value)) return "linux";
  return "unknown";
};
const showRequestError = (language, err) => {
  showToast({
    variant: "error",
    title: language.t("common.requestFailed"),
    description: err instanceof Error ? err.message : String(err)
  });
};
export function SessionHeader() {
  const layout = useLayout();
  const command = useCommand();
  const server = useServer();
  const platform = usePlatform();
  const language = useLanguage();
  const settings = useSettings();
  const sync = useSync();
  const terminal = useTerminal();
  const {
    params,
    view
  } = useSessionLayout();
  const projectDirectory = createMemo(() => decode64(params.dir) ?? "");
  const project = createMemo(() => {
    const directory = projectDirectory();
    if (!directory) return;
    return layout.projects.list().find(p => p.worktree === directory || p.sandboxes?.includes(directory));
  });
  const name = createMemo(() => {
    const current = project();
    if (current) return current.name || getFilename(current.worktree);
    return getFilename(projectDirectory());
  });
  const hotkey = createMemo(() => command.keybind("file.open"));
  const os = createMemo(() => detectOS(platform));
  const isDesktopBeta = platform.platform === "desktop" && env("VITE_CLOSEDCODE_CHANNEL") === "beta";
  const search = createMemo(() => !isDesktopBeta || settings.general.showSearch());
  const tree = createMemo(() => !isDesktopBeta || settings.general.showFileTree());
  const term = createMemo(() => !isDesktopBeta || settings.general.showTerminal());
  const status = createMemo(() => !isDesktopBeta || settings.general.showStatus());
  const [exists, setExists] = createStore({
    finder: true
  });
  const apps = createMemo(() => {
    if (os() === "macos") return MAC_APPS;
    if (os() === "windows") return WINDOWS_APPS;
    return LINUX_APPS;
  });
  const fileManager = createMemo(() => {
    if (os() === "macos") return {
      label: "session.header.open.finder",
      icon: "finder"
    };
    if (os() === "windows") return {
      label: "session.header.open.fileExplorer",
      icon: "file-explorer"
    };
    return {
      label: "session.header.open.fileManager",
      icon: "finder"
    };
  });
  createEffect(() => {
    if (platform.platform !== "desktop") return;
    if (!platform.checkAppExists) return;
    const list = apps();
    setExists(Object.fromEntries(list.map(app => [app.id, undefined])));
    void Promise.all(list.map(app => Promise.resolve(platform.checkAppExists?.(app.openWith)).then(value => Boolean(value)).catch(() => false).then(ok => [app.id, ok]))).then(entries => {
      setExists(Object.fromEntries(entries));
    });
  });
  const options = createMemo(() => {
    return [{
      id: "finder",
      label: language.t(fileManager().label),
      icon: fileManager().icon
    }, ...apps().filter(app => exists[app.id]).map(app => ({
      ...app,
      label: language.t(app.label)
    }))];
  });
  const toggleTerminal = () => {
    const next = !view().terminal.opened();
    view().terminal.toggle();
    if (!next) return;
    const id = terminal.active();
    if (!id) return;
    focusTerminalById(id);
  };
  const [prefs, setPrefs] = persisted(Persist.global("open.app"), createStore({
    app: "finder"
  }));
  const [menu, setMenu] = createStore({
    open: false
  });
  const [openRequest, setOpenRequest] = createStore({
    app: undefined
  });
  const canOpen = createMemo(() => platform.platform === "desktop" && !!platform.openPath && server.isLocal());
  const current = createMemo(() => options().find(o => o.id === prefs.app) ?? options()[0] ?? {
    id: "finder",
    label: fileManager().label,
    icon: fileManager().icon
  });
  const opening = createMemo(() => openRequest.app !== undefined);
  const tint = createMemo(() => messageAgentColor(params.id ? sync.data?.message?.[params.id] : undefined, sync.data?.agent));
  const selectApp = app => {
    if (!options().some(item => item.id === app)) return;
    setPrefs("app", app);
  };
  const openDir = app => {
    if (opening() || !canOpen() || !platform.openPath) return;
    const directory = projectDirectory();
    if (!directory) return;
    const item = options().find(o => o.id === app);
    const openWith = item && "openWith" in item ? item.openWith : undefined;
    setOpenRequest("app", app);
    platform.openPath(directory, openWith).catch(err => showRequestError(language, err)).finally(() => {
      setOpenRequest("app", undefined);
    });
  };
  const copyPath = () => {
    const directory = projectDirectory();
    if (!directory) return;
    navigator.clipboard.writeText(directory).then(() => {
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t("session.share.copy.copied"),
        description: directory
      });
    }).catch(err => showRequestError(language, err));
  };
  const [centerMount, setCenterMount] = createSignal(null);
  const [rightMount, setRightMount] = createSignal(null);
  onMount(() => {
    setCenterMount(document.getElementById("closedcode-titlebar-center"));
    setRightMount(document.getElementById("closedcode-titlebar-right"));
  });
  return [_$createComponent(Show, {
    get when() {
      return _$memo(() => !!search())() && centerMount();
    },
    children: mount => _$createComponent(Portal, {
      get mount() {
        return mount();
      },
      get children() {
        return _$createComponent(Button, {
          type: "button",
          variant: "ghost",
          size: "small",
          "class": "d-none md:flex w-[240px] max-w-full min-w-0 align-items-center gap-2 justify-content-between rounded-2 border bg-body-tertiary shadow-none cursor-default",
          onClick: () => command.trigger("file.open"),
          get ["aria-label"]() {
            return language.t("session.header.searchFiles");
          },
          get children() {
            return [(() => {
              var _el$ = _tmpl$(),
                _el$2 = _el$.firstChild;
              _$insert(_el$2, () => language.t("session.header.search.placeholder", {
                project: name()
              }));
              return _el$;
            })(), _$createComponent(Show, {
              get when() {
                return hotkey();
              },
              children: keybind => _$createComponent(Keybind, {
                "class": "shrink-0 !border-0 !bg-transparent !shadow-none px-0 text-body-secondary",
                get children() {
                  return keybind();
                }
              })
            })];
          }
        });
      }
    })
  }), _$createComponent(Show, {
    get when() {
      return rightMount();
    },
    children: mount => _$createComponent(Portal, {
      get mount() {
        return mount();
      },
      get children() {
        var _el$3 = _tmpl$7(),
          _el$9 = _el$3.firstChild,
          _el$0 = _el$9.firstChild;
        _$insert(_el$3, _$createComponent(Show, {
          get when() {
            return projectDirectory();
          },
          get children() {
            var _el$4 = _tmpl$5();
            _$insert(_el$4, _$createComponent(Show, {
              get when() {
                return canOpen();
              },
              get fallback() {
                return (() => {
                  var _el$10 = _tmpl$9();
                  _$insert(_el$10, _$createComponent(Button, {
                    variant: "ghost",
                    "class": "rounded-none h-full py-0 pr-3 pl-0.5 gap-1.5 border-none shadow-none",
                    onClick: copyPath,
                    get ["aria-label"]() {
                      return language.t("session.header.open.copyPath");
                    },
                    get children() {
                      return [_$createComponent(Icon, {
                        name: "copy",
                        size: "small",
                        "class": "text-secondary"
                      }), (() => {
                        var _el$11 = _tmpl$8();
                        _$insert(_el$11, () => language.t("session.header.open.copyPath"));
                        return _el$11;
                      })()];
                    }
                  }));
                  return _el$10;
                })();
              },
              get children() {
                var _el$5 = _tmpl$4(),
                  _el$6 = _el$5.firstChild;
                _$insert(_el$6, _$createComponent(Button, {
                  variant: "ghost",
                  "class": "rounded-none h-full px-0.5 border-none shadow-none disabled:!cursor-default",
                  get classList() {
                    return {
                      "bg-primary-subtle": opening()
                    };
                  },
                  onClick: () => openDir(current().id),
                  get disabled() {
                    return opening();
                  },
                  get ["aria-label"]() {
                    return language.t("session.header.open.ariaLabel", {
                      app: current().label
                    });
                  },
                  get children() {
                    var _el$7 = _tmpl$2();
                    _$insert(_el$7, _$createComponent(Show, {
                      get when() {
                        return opening();
                      },
                      get fallback() {
                        return _$createComponent(AppIcon, {
                          get id() {
                            return current().icon;
                          }
                        });
                      },
                      get children() {
                        return _$createComponent(Spinner, {
                          "class": "size-3.5",
                          get style() {
                            return {
                              color: tint() ?? "var(--icon-base)"
                            };
                          }
                        });
                      }
                    }));
                    return _el$7;
                  }
                }), null);
                _$insert(_el$6, _$createComponent(DropdownMenu, {
                  gutter: 4,
                  placement: "bottom-end",
                  get open() {
                    return menu.open;
                  },
                  onOpenChange: open => setMenu("open", open),
                  get children() {
                    return [_$createComponent(DropdownMenu.Trigger, {
                      as: IconButton,
                      icon: "chevron-down",
                      variant: "ghost",
                      get disabled() {
                        return opening();
                      },
                      "class": "rounded-none h-full w-[20px] p-0 border-none shadow-none disabled:!cursor-default",
                      get classList() {
                        return {
                          "bg-primary-subtle": opening()
                        };
                      },
                      get ["aria-label"]() {
                        return language.t("session.header.open.menu");
                      }
                    }), _$createComponent(DropdownMenu.Portal, {
                      get children() {
                        return _$createComponent(DropdownMenu.Content, {
                          "class": "[&_[data-slot=dropdown-menu-item]]:pl-1 [&_[data-slot=dropdown-menu-radio-item]]:pl-1 [&_[data-slot=dropdown-menu-radio-item]+[data-slot=dropdown-menu-radio-item]]:mt-1",
                          get children() {
                            return [_$createComponent(DropdownMenu.Group, {
                              get children() {
                                return [_$createComponent(DropdownMenu.GroupLabel, {
                                  "class": "!px-1 !py-1",
                                  get children() {
                                    return language.t("session.header.openIn");
                                  }
                                }), _$createComponent(DropdownMenu.RadioGroup, {
                                  "class": "mt-1",
                                  get value() {
                                    return current().id;
                                  },
                                  onChange: value => {
                                    if (!OPEN_APPS.includes(value)) return;
                                    selectApp(value);
                                  },
                                  get children() {
                                    return _$createComponent(For, {
                                      get each() {
                                        return options();
                                      },
                                      children: o => _$createComponent(DropdownMenu.RadioItem, {
                                        get value() {
                                          return o.id;
                                        },
                                        get disabled() {
                                          return opening();
                                        },
                                        onSelect: () => {
                                          setMenu("open", false);
                                          openDir(o.id);
                                        },
                                        get children() {
                                          return [(() => {
                                            var _el$12 = _tmpl$2();
                                            _$insert(_el$12, _$createComponent(AppIcon, {
                                              get id() {
                                                return o.icon;
                                              }
                                            }));
                                            return _el$12;
                                          })(), _$createComponent(DropdownMenu.ItemLabel, {
                                            get children() {
                                              return o.label;
                                            }
                                          }), _$createComponent(DropdownMenu.ItemIndicator, {
                                            get children() {
                                              return _$createComponent(Icon, {
                                                name: "check-small",
                                                size: "small",
                                                "class": "text-secondary"
                                              });
                                            }
                                          })];
                                        }
                                      })
                                    });
                                  }
                                })];
                              }
                            }), _$createComponent(DropdownMenu.Separator, {}), _$createComponent(DropdownMenu.Item, {
                              onSelect: () => {
                                setMenu("open", false);
                                copyPath();
                              },
                              get children() {
                                return [(() => {
                                  var _el$8 = _tmpl$3();
                                  _$insert(_el$8, _$createComponent(Icon, {
                                    name: "copy",
                                    size: "small",
                                    "class": "text-secondary"
                                  }));
                                  return _el$8;
                                })(), _$createComponent(DropdownMenu.ItemLabel, {
                                  get children() {
                                    return language.t("session.header.open.copyPath");
                                  }
                                })];
                              }
                            })];
                          }
                        });
                      }
                    })];
                  }
                }), null);
                return _el$5;
              }
            }));
            return _el$4;
          }
        }), _el$9);
        _$insert(_el$9, _$createComponent(Show, {
          get when() {
            return status();
          },
          get children() {
            return _$createComponent(Tooltip, {
              placement: "bottom",
              get value() {
                return language.t("status.popover.trigger");
              },
              get children() {
                return _$createComponent(StatusPopover, {});
              }
            });
          }
        }), _el$0);
        _$insert(_el$9, _$createComponent(Show, {
          get when() {
            return term();
          },
          get children() {
            return _$createComponent(TooltipKeybind, {
              get title() {
                return language.t("command.terminal.toggle");
              },
              get keybind() {
                return command.keybind("terminal.toggle");
              },
              get children() {
                return _$createComponent(Button, {
                  variant: "ghost",
                  "class": "group/terminal-toggle titlebar-icon w-8 h-6 p-0 box-border shrink-0",
                  onClick: toggleTerminal,
                  get ["aria-label"]() {
                    return language.t("command.terminal.toggle");
                  },
                  get ["aria-expanded"]() {
                    return view().terminal.opened();
                  },
                  "aria-controls": "terminal-panel",
                  get children() {
                    return _$createComponent(Icon, {
                      size: "small",
                      get name() {
                        return view().terminal.opened() ? "terminal-active" : "terminal";
                      }
                    });
                  }
                });
              }
            });
          }
        }), _el$0);
        _$insert(_el$0, _$createComponent(TooltipKeybind, {
          get title() {
            return language.t("command.review.toggle");
          },
          get keybind() {
            return command.keybind("review.toggle");
          },
          get children() {
            return _$createComponent(Button, {
              variant: "ghost",
              "class": "group/review-toggle titlebar-icon w-8 h-6 p-0 box-border",
              onClick: () => view().reviewPanel.toggle(),
              get ["aria-label"]() {
                return language.t("command.review.toggle");
              },
              get ["aria-expanded"]() {
                return view().reviewPanel.opened();
              },
              "aria-controls": "review-panel",
              get children() {
                return _$createComponent(Icon, {
                  size: "small",
                  get name() {
                    return view().reviewPanel.opened() ? "review-active" : "review";
                  }
                });
              }
            });
          }
        }), null);
        _$insert(_el$0, _$createComponent(Show, {
          get when() {
            return tree();
          },
          get children() {
            return _$createComponent(TooltipKeybind, {
              get title() {
                return language.t("command.fileTree.toggle");
              },
              get keybind() {
                return command.keybind("fileTree.toggle");
              },
              get children() {
                return _$createComponent(Button, {
                  variant: "ghost",
                  "class": "titlebar-icon w-8 h-6 p-0 box-border",
                  onClick: () => layout.fileTree.toggle(),
                  get ["aria-label"]() {
                    return language.t("command.fileTree.toggle");
                  },
                  get ["aria-expanded"]() {
                    return layout.fileTree.opened();
                  },
                  "aria-controls": "file-tree-panel",
                  get children() {
                    var _el$1 = _tmpl$6();
                    _$insert(_el$1, _$createComponent(Icon, {
                      size: "small",
                      get name() {
                        return layout.fileTree.opened() ? "file-tree-active" : "file-tree";
                      },
                      get classList() {
                        return {
                          "text-body-emphasis": layout.fileTree.opened(),
                          "text-secondary": !layout.fileTree.opened()
                        };
                      }
                    }));
                    return _el$1;
                  }
                });
              }
            });
          }
        }), null);
        return _el$3;
      }
    })
  })];
}