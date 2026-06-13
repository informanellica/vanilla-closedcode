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
import { createComponent, createEffect, createMemo, createRenderEffect, createSignal, For, onCleanup, onMount, Show } from "../../lib/reactivity.js";
import { createStore } from "../../lib/store.js";
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

// Build a detached element from compact HTML (no inter-element whitespace,
// matching the compiled Solid templates). Static markup only — translated and
// user-provided strings are always assigned via textContent, never
// interpolated into the HTML.
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  return wrapper.firstElementChild;
}

// Reactive single-region host standing in for the compiled insert(parent,
// value, marker) calls: a persistent empty text node anchors the region so
// sibling regions keep their relative order, and the previous branch's nodes
// are removed before the next branch is inserted (matching Show's swap
// semantics).
function createRegion(parent, anchor) {
  const placeholder = document.createTextNode("");
  parent.insertBefore(placeholder, anchor);
  let current = [];
  return value => {
    const next = (Array.isArray(value) ? value : [value]).filter(node => node instanceof Node);
    for (const node of current) node.remove();
    current = next;
    for (const node of next) parent.insertBefore(node, placeholder);
  };
}
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

  // Search button for the titlebar center slot (_tmpl$ + Button). Built once
  // per portal mount, exactly like the compiled children getter.
  const buildSearchButton = () => {
    const label = template(`<div class="d-flex min-w-0 flex-1 align-items-center overflow-visible"><span class="flex-1 min-w-0 text-12-regular text-secondary truncate text-left"></span></div>`);
    const labelText = label.firstChild;
    // Compiled reactive insert: keep the placeholder live across locale and
    // project-name changes.
    createRenderEffect(() => {
      labelText.textContent = language.t("session.header.search.placeholder", {
        project: name()
      });
    });
    return createComponent(Button, {
      type: "button",
      variant: "ghost",
      size: "small",
      "class": "d-none md:flex w-[240px] max-w-full min-w-0 align-items-center gap-2 justify-content-between rounded-2 border bg-body-tertiary shadow-none cursor-default",
      onClick: () => command.trigger("file.open"),
      get ["aria-label"]() {
        return language.t("session.header.searchFiles");
      },
      get children() {
        return [label, createComponent(Show, {
          get when() {
            return hotkey();
          },
          children: keybind => createComponent(Keybind, {
            "class": "shrink-0 !border-0 !bg-transparent !shadow-none px-0 text-body-secondary",
            get children() {
              return keybind();
            }
          })
        })];
      }
    });
  };

  // Fallback when the directory cannot be opened locally (_tmpl$9 + _tmpl$8):
  // a single copy-path button.
  const buildCopyPathBox = () => {
    const box = template(`<div class="d-flex h-[24px] box-border align-items-center rounded-2 border bg-body-tertiary overflow-hidden"></div>`);
    const labelEl = template(`<span class="small fw-normal text-body-emphasis"></span>`);
    // Compiled reactive insert: label follows locale changes.
    createRenderEffect(() => {
      labelEl.textContent = language.t("session.header.open.copyPath");
    });
    box.appendChild(createComponent(Button, {
      variant: "ghost",
      "class": "rounded-none h-full py-0 pr-3 pl-0.5 gap-1.5 border-none shadow-none",
      onClick: copyPath,
      get ["aria-label"]() {
        return language.t("session.header.open.copyPath");
      },
      get children() {
        return [createComponent(Icon, {
          name: "copy",
          size: "small",
          "class": "text-secondary"
        }), labelEl];
      }
    }));
    return box;
  };

  // Open-in split button: main action + dropdown menu (_tmpl$4/_tmpl$2/_tmpl$3).
  const buildOpenBox = () => {
    const wrap = template(`<div class="d-flex align-items-center"><div class="d-flex h-[24px] box-border align-items-center rounded-2 border bg-body-tertiary overflow-hidden"></div></div>`);
    const box = wrap.firstChild;
    box.appendChild(createComponent(Button, {
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
        const iconHost = template(`<div class="d-flex size-5 shrink-0 align-items-center justify-content-center [&amp;_[data-component=app-icon]]:size-5"></div>`);
        // Show(when=opening()): swap the app icon for a spinner while an open
        // request is in flight. Branch construction stays untracked through
        // createComponent, so this effect only tracks opening().
        createRenderEffect(() => {
          iconHost.replaceChildren(opening() ? createComponent(Spinner, {
            "class": "size-3.5",
            get style() {
              return {
                color: tint() ?? "var(--icon-base)"
              };
            }
          }) : createComponent(AppIcon, {
            get id() {
              return current().icon;
            }
          }));
        });
        return iconHost;
      }
    }));
    box.appendChild(createComponent(DropdownMenu, {
      gutter: 4,
      placement: "bottom-end",
      get open() {
        return menu.open;
      },
      onOpenChange: open => setMenu("open", open),
      get children() {
        return [createComponent(DropdownMenu.Trigger, {
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
        }), createComponent(DropdownMenu.Portal, {
          get children() {
            return createComponent(DropdownMenu.Content, {
              "class": "[&_[data-slot=dropdown-menu-item]]:pl-1 [&_[data-slot=dropdown-menu-radio-item]]:pl-1 [&_[data-slot=dropdown-menu-radio-item]+[data-slot=dropdown-menu-radio-item]]:mt-1",
              get children() {
                return [createComponent(DropdownMenu.Group, {
                  get children() {
                    return [createComponent(DropdownMenu.GroupLabel, {
                      "class": "!px-1 !py-1",
                      get children() {
                        return language.t("session.header.openIn");
                      }
                    }), createComponent(DropdownMenu.RadioGroup, {
                      "class": "mt-1",
                      get value() {
                        return current().id;
                      },
                      onChange: value => {
                        if (!OPEN_APPS.includes(value)) return;
                        selectApp(value);
                      },
                      get children() {
                        // Runtime For: bs/dropdown-menu renders function
                        // children reactively, so options()/locale changes
                        // keep re-rendering the radio items.
                        return createComponent(For, {
                          get each() {
                            return options();
                          },
                          children: o => createComponent(DropdownMenu.RadioItem, {
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
                              const cell = template(`<div class="d-flex size-5 shrink-0 align-items-center justify-content-center [&amp;_[data-component=app-icon]]:size-5"></div>`);
                              cell.appendChild(createComponent(AppIcon, {
                                get id() {
                                  return o.icon;
                                }
                              }));
                              return [cell, createComponent(DropdownMenu.ItemLabel, {
                                get children() {
                                  return o.label;
                                }
                              }), createComponent(DropdownMenu.ItemIndicator, {
                                get children() {
                                  return createComponent(Icon, {
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
                }), createComponent(DropdownMenu.Separator, {}), createComponent(DropdownMenu.Item, {
                  onSelect: () => {
                    setMenu("open", false);
                    copyPath();
                  },
                  get children() {
                    const cell = template(`<div class="d-flex size-5 shrink-0 align-items-center justify-content-center"></div>`);
                    cell.appendChild(createComponent(Icon, {
                      name: "copy",
                      size: "small",
                      "class": "text-secondary"
                    }));
                    return [cell, createComponent(DropdownMenu.ItemLabel, {
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
    }));
    return wrap;
  };

  // Status popover trigger wrapped in a tooltip.
  const buildStatusButton = () => createComponent(Tooltip, {
    placement: "bottom",
    get value() {
      return language.t("status.popover.trigger");
    },
    get children() {
      return createComponent(StatusPopover, {});
    }
  });

  // Terminal panel toggle.
  const buildTerminalToggle = () => createComponent(TooltipKeybind, {
    get title() {
      return language.t("command.terminal.toggle");
    },
    get keybind() {
      return command.keybind("terminal.toggle");
    },
    get children() {
      return createComponent(Button, {
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
          return createComponent(Icon, {
            size: "small",
            get name() {
              return view().terminal.opened() ? "terminal-active" : "terminal";
            }
          });
        }
      });
    }
  });

  // Review panel toggle (always rendered).
  const buildReviewToggle = () => createComponent(TooltipKeybind, {
    get title() {
      return language.t("command.review.toggle");
    },
    get keybind() {
      return command.keybind("review.toggle");
    },
    get children() {
      return createComponent(Button, {
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
          return createComponent(Icon, {
            size: "small",
            get name() {
              return view().reviewPanel.opened() ? "review-active" : "review";
            }
          });
        }
      });
    }
  });

  // File tree toggle (_tmpl$6 wrapper around the icon).
  const buildFileTreeToggle = () => createComponent(TooltipKeybind, {
    get title() {
      return language.t("command.fileTree.toggle");
    },
    get keybind() {
      return command.keybind("fileTree.toggle");
    },
    get children() {
      return createComponent(Button, {
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
          const iconWrap = template(`<div class="position-relative d-flex align-items-center justify-content-center size-4"></div>`);
          iconWrap.appendChild(createComponent(Icon, {
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
          return iconWrap;
        }
      });
    }
  });

  // Right titlebar cluster (_tmpl$7) with the compiled insert slots replaced
  // by marker-anchored regions. Each Show becomes an effect gated on the same
  // boolean so the rebuild cadence matches the original exactly.
  const buildRightCluster = () => {
    const cluster = template(`<div class="d-flex align-items-center gap-2"><div class="d-flex align-items-center gap-1"><div class="d-none md:flex align-items-center gap-1 shrink-0"></div></div></div>`);
    const controls = cluster.firstChild;
    const panelToggles = controls.firstChild;

    // Show(when=projectDirectory()): open-in / copy-path cluster (_tmpl$5).
    // Gate on truthiness like a non-keyed Show — a dir-to-dir change must not
    // rebuild the cluster.
    const hasDirectory = createMemo(() => !!projectDirectory());
    const setOpenRegion = createRegion(cluster, controls);
    createRenderEffect(() => {
      if (!hasDirectory()) {
        setOpenRegion(null);
        return;
      }
      const host = template(`<div class="d-none xl:flex align-items-center"></div>`);
      // Nested Show(when=canOpen()) with the copy-path fallback.
      createRenderEffect(() => {
        host.replaceChildren(canOpen() ? buildOpenBox() : buildCopyPathBox());
      });
      setOpenRegion(host);
    });

    // Show(when=status()).
    const setStatusRegion = createRegion(controls, panelToggles);
    createRenderEffect(() => {
      setStatusRegion(status() ? buildStatusButton() : null);
    });

    // Show(when=term()).
    const setTermRegion = createRegion(controls, panelToggles);
    createRenderEffect(() => {
      setTermRegion(term() ? buildTerminalToggle() : null);
    });

    // The review toggle is unconditional.
    panelToggles.appendChild(buildReviewToggle());

    // Show(when=tree()), appended after the review toggle.
    const setTreeRegion = createRegion(panelToggles, null);
    createRenderEffect(() => {
      setTreeRegion(tree() ? buildFileTreeToggle() : null);
    });
    return cluster;
  };

  // Compiled root: two portals into the custom titlebar slots. The runtime
  // Portal component (solid-js/web) is replaced by a vanilla stand-in: while
  // the gate yields a mount element, a plain container <div> — the same
  // wrapper element Portal creates — is kept appended to it, with the
  // children built once per mount. Computations created during the build are
  // owned by the effect, so a gate flip or component unmount disposes them
  // and onCleanup detaches the container, matching the original Show + Portal
  // semantics. No child component relies on delegated events, so Portal's
  // host-retargeting property is not needed.
  const createPortal = (mountWhen, build) => {
    createRenderEffect(() => {
      const mount = mountWhen();
      if (!mount) return;
      const container = document.createElement("div");
      const value = build();
      for (const node of Array.isArray(value) ? value : [value]) {
        if (node instanceof Node) container.appendChild(node);
      }
      mount.appendChild(container);
      onCleanup(() => container.remove());
    });
  };
  const searchOn = createMemo(() => !!search());
  createPortal(() => searchOn() && centerMount(), buildSearchButton);
  createPortal(rightMount, buildRightCluster);
  // Everything renders through the portals; nothing is inserted in place.
  return null;
}
