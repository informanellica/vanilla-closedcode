// Kobalte presence-gated content flows through the insertions below: the
// ContextMenu/HoverCard component trees resolve to [trigger, portal marker]
// arrays whose membership changes whenever a portal mounts/unmounts, and the
// session lists are For-reconciled rows inside the hover-card panel. insert()
// reconciles those arrays in place instead of detaching the live trigger or
// session nodes, so it stays (established exception).
import { insert } from "solid-js/web";
import { createComponent, createMemo, createRenderEffect, For, mergeProps, Show, untrack } from "solid-js";
import { createStore } from "solid-js/store";
import { base64Encode } from "core/util/encode";
import { Button } from "@/bs/button.js";
import { ContextMenu } from "@/vendor/ui/components/context-menu.js";
import { HoverCard } from "@/vendor/ui/components/hover-card.js";
import { Icon } from "@/bs/icon.js";
import { createSortable } from "../../lib/dnd/index.js";
import { useLayout } from "@/context/layout.js";
import { useGlobalSync } from "@/context/global-sync.js";
import { useLanguage } from "@/context/language.js";
import { useNotification } from "@/context/notification.js";
import { ProjectIcon, SessionItem } from "./sidebar-items.js";
import { displayName, sortedRootSessions } from "./helpers.js";

// Build a detached element from compact HTML (no inter-element whitespace,
// matching the compiled Solid templates). Built fresh per call: no cloneNode.
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  return wrapper.firstElementChild;
}

// Reactive text binding: mirrors insert(el, accessor) for text-only slots
// (renders nothing for null/undefined, like insert does).
function bindText(el, accessor) {
  createRenderEffect(() => {
    const value = accessor();
    el.textContent = value == null ? "" : value;
  });
}

export const ProjectDragOverlay = props => {
  const project = createMemo(() => props.projects().find(p => p.worktree === props.activeProject()));
  return createComponent(Show, {
    get when() {
      return project();
    },
    children: p => {
      const el = template(`<div class="bg-body rounded-3 p-1"></div>`);
      el.appendChild(createComponent(ProjectIcon, {
        get project() {
          return p();
        }
      }));
      return el;
    }
  });
};
const ProjectTile = props => {
  const notification = useNotification();
  const layout = useLayout();
  const unseenCount = createMemo(() => props.dirs().reduce((total, directory) => total + notification.project.unseenCount(directory), 0));
  const clear = () => props.dirs().filter(directory => notification.project.unseenCount(directory) > 0).forEach(directory => notification.project.markViewed(directory));
  return createComponent(ContextMenu, {
    get modal() {
      return !props.sidebarHovering();
    },
    onOpenChange: value => {
      props.setMenu(value);
      props.setSuppressHover(value);
      if (value) props.setOpen(false);
    },
    get children() {
      return [createComponent(ContextMenu.Trigger, {
        as: "button",
        type: "button",
        get ["aria-label"]() {
          return displayName(props.project);
        },
        "data-action": "project-switch",
        get ["data-project"]() {
          return base64Encode(props.project.worktree);
        },
        get classList() {
          return {
            "d-flex align-items-center justify-content-center size-10 p-1 rounded-3 overflow-hidden transition-colors cursor-default": true,
            "bg-transparent border-2 border-secondary": props.selected(),
            "bg-transparent border border-transparent": !props.selected() && !props.active(),
            "border": !props.selected() && props.active()
          };
        },
        onPointerDown: event => {
          if (event.button === 0 && !event.ctrlKey) {
            props.setOpen(false);
            props.setSuppressHover(true);
            return;
          }
          if (!props.overlay()) return;
          if (event.button !== 2 && !(event.button === 0 && event.ctrlKey)) return;
          props.setOpen(false);
          props.setSuppressHover(true);
          event.preventDefault();
        },
        onMouseEnter: event => {
          if (!props.overlay()) return;
          if (props.suppressHover()) return;
          props.onProjectMouseEnter(props.project.worktree, event);
        },
        onMouseLeave: () => {
          if (props.suppressHover()) props.setSuppressHover(false);
          if (!props.overlay()) return;
          props.onProjectMouseLeave(props.project.worktree);
        },
        onFocus: () => {
          if (!props.overlay()) return;
          if (props.suppressHover()) return;
          props.onProjectFocus(props.project.worktree);
        },
        onClick: () => {
          props.setOpen(false);
          if (props.selected()) {
            layout.sidebar.toggle();
            return;
          }
          props.navigateToProject(props.project.worktree);
        },
        onBlur: () => props.setOpen(false),
        get children() {
          return createComponent(ProjectIcon, {
            get project() {
              return props.project;
            },
            notify: true
          });
        }
      }), createComponent(ContextMenu.Portal, {
        get children() {
          return createComponent(ContextMenu.Content, {
            get children() {
              return [createComponent(ContextMenu.Item, {
                onSelect: () => props.showEditProjectDialog(props.project),
                get children() {
                  return createComponent(ContextMenu.ItemLabel, {
                    get children() {
                      return props.language.t("common.edit");
                    }
                  });
                }
              }), createComponent(ContextMenu.Item, {
                "data-action": "project-workspaces-toggle",
                get ["data-project"]() {
                  return base64Encode(props.project.worktree);
                },
                get disabled() {
                  return props.project.vcs !== "git" && !props.workspacesEnabled(props.project);
                },
                onSelect: () => props.toggleProjectWorkspaces(props.project),
                get children() {
                  return createComponent(ContextMenu.ItemLabel, {
                    get children() {
                      return props.workspacesEnabled(props.project) ? props.language.t("sidebar.workspaces.disable") : props.language.t("sidebar.workspaces.enable");
                    }
                  });
                }
              }), createComponent(ContextMenu.Item, {
                "data-action": "project-clear-notifications",
                get ["data-project"]() {
                  return base64Encode(props.project.worktree);
                },
                get disabled() {
                  return unseenCount() === 0;
                },
                onSelect: clear,
                get children() {
                  return createComponent(ContextMenu.ItemLabel, {
                    get children() {
                      return props.language.t("sidebar.project.clearNotifications");
                    }
                  });
                }
              }), createComponent(ContextMenu.Separator, {}), createComponent(ContextMenu.Item, {
                "data-action": "project-close-menu",
                get ["data-project"]() {
                  return base64Encode(props.project.worktree);
                },
                onSelect: () => props.closeProject(props.project.worktree),
                get children() {
                  return createComponent(ContextMenu.ItemLabel, {
                    get children() {
                      return props.language.t("common.close");
                    }
                  });
                }
              })];
            }
          });
        }
      })];
    }
  });
};
const ProjectPreviewPanel = props => {
  // Static skeleton mirroring _tmpl$2: header (project name), "recent
  // sessions" label, session list slot, footer ("view all" button).
  const root = template(`<div class="-m-3 p-2 d-flex flex-column w-72"><div class="px-4 pt-2 pb-1 d-flex align-items-center gap-2"><div class="fw-medium text-body-emphasis truncate grow"></div></div><div class="px-4 pb-2 small fw-medium text-secondary"></div><div class="px-2 pb-2 d-flex flex-column gap-2"></div><div class="px-2 py-2 border-t border"></div></div>`);
  const header = root.firstChild;
  const nameEl = header.firstChild;
  const recentLabel = header.nextSibling;
  const sessionList = recentLabel.nextSibling;
  const footer = sessionList.nextSibling;
  bindText(nameEl, () => displayName(props.project));
  bindText(recentLabel, () => props.language.t("sidebar.project.recentSessions"));
  // Session rows live inside the presence-gated hover-card content; keep
  // Show/For + insert so row identity is preserved across list updates.
  insert(sessionList, createComponent(Show, {
    get when() {
      return props.workspaceEnabled();
    },
    get fallback() {
      return createComponent(For, {
        get each() {
          return props.projectSessions().slice(0, 2);
        },
        children: session => createComponent(SessionItem, mergeProps(() => props.ctx.sessionProps, {
          session: session,
          get list() {
            return props.projectSessions();
          },
          get slug() {
            return base64Encode(props.project.worktree);
          },
          dense: true,
          showTooltip: true,
          get mobile() {
            return props.mobile;
          }
        }))
      });
    },
    get children() {
      return createComponent(For, {
        get each() {
          return props.workspaces();
        },
        children: directory => {
          const sessions = createMemo(() => props.workspaceSessions(directory));
          // _tmpl$3: workspace header row (icon + label), sessions appended after.
          const row = template(`<div class="d-flex flex-column gap-1"><div class="px-2 py-0.5 d-flex align-items-center gap-1 min-w-0"><div class="shrink-0 size-6 d-flex align-items-center justify-content-center"></div><span class="truncate fw-medium text-body"></span></div></div>`);
          const iconBox = row.firstChild.firstChild;
          const labelEl = iconBox.nextSibling;
          iconBox.appendChild(createComponent(Icon, {
            name: "branch",
            size: "small",
            "class": "text-secondary"
          }));
          bindText(labelEl, () => props.label(directory));
          insert(row, createComponent(For, {
            get each() {
              return sessions().slice(0, 2);
            },
            children: session => createComponent(SessionItem, mergeProps(() => props.ctx.sessionProps, {
              session: session,
              get list() {
                return sessions();
              },
              get slug() {
                return base64Encode(directory);
              },
              dense: true,
              showTooltip: true,
              get mobile() {
                return props.mobile;
              }
            }))
          }), null);
          return row;
        }
      });
    }
  }));
  footer.appendChild(createComponent(Button, {
    variant: "ghost",
    "class": "d-flex w-100 text-left justify-content-start text-body px-2 hover:bg-transparent active:bg-transparent",
    onClick: () => {
      props.ctx.openSidebar();
      props.ctx.onHoverOpenChanged(props.project.worktree, false);
      if (props.selected()) return;
      props.ctx.navigateToProject(props.project.worktree);
    },
    get children() {
      return props.language.t("sidebar.project.viewAllSessions");
    }
  }));
  return root;
};
export const SortableProject = props => {
  const globalSync = useGlobalSync();
  const language = useLanguage();
  const sortable = createSortable(props.project.worktree);
  const selected = createMemo(() => props.ctx.currentProject()?.worktree === props.project.worktree);
  const workspaces = createMemo(() => props.ctx.workspaceIds(props.project).slice(0, 2));
  const workspaceEnabled = createMemo(() => props.ctx.workspacesEnabled(props.project));
  const dirs = createMemo(() => props.ctx.workspaceIds(props.project));
  const [state, setState] = createStore({
    menu: false,
    suppressHover: false
  });
  const isHoverProject = () => props.ctx.hoverProject() === props.project.worktree;
  const preview = createMemo(() => !props.mobile && props.ctx.sidebarOpened());
  const overlay = createMemo(() => !props.mobile && !props.ctx.sidebarOpened());
  const active = createMemo(() => state.menu || (preview() ? isHoverProject() : overlay() && isHoverProject()));
  const hoverOpen = () => isHoverProject() && preview() && !selected() && !state.menu;
  const label = directory => {
    const [data] = globalSync.child(directory, {
      bootstrap: false
    });
    const kind = directory === props.project.worktree ? language.t("workspace.type.local") : language.t("workspace.type.sandbox");
    const name = props.ctx.workspaceLabel(directory, data.vcs?.branch, props.project.id);
    return `${kind} : ${name}`;
  };
  const projectStore = createMemo(() => globalSync.child(props.project.worktree, {
    bootstrap: false
  })[0]);
  const projectSessions = createMemo(() => sortedRootSessions(projectStore(), props.sortNow()));
  const workspaceSessions = directory => {
    const [data] = globalSync.child(directory, {
      bootstrap: false
    });
    return sortedRootSessions(data, props.sortNow());
  };
  const tile = () => createComponent(ProjectTile, {
    get project() {
      return props.project;
    },
    get mobile() {
      return props.mobile;
    },
    get sidebarHovering() {
      return props.ctx.sidebarHovering;
    },
    selected: selected,
    active: active,
    overlay: overlay,
    suppressHover: () => state.suppressHover,
    dirs: dirs,
    get onProjectMouseEnter() {
      return props.ctx.onProjectMouseEnter;
    },
    get onProjectMouseLeave() {
      return props.ctx.onProjectMouseLeave;
    },
    get onProjectFocus() {
      return props.ctx.onProjectFocus;
    },
    get navigateToProject() {
      return props.ctx.navigateToProject;
    },
    get showEditProjectDialog() {
      return props.ctx.showEditProjectDialog;
    },
    get toggleProjectWorkspaces() {
      return props.ctx.toggleProjectWorkspaces;
    },
    get workspacesEnabled() {
      return props.ctx.workspacesEnabled;
    },
    get closeProject() {
      return props.ctx.closeProject;
    },
    setMenu: value => setState("menu", value),
    setOpen: value => props.ctx.onHoverOpenChanged(props.project.worktree, value),
    setSuppressHover: value => setState("suppressHover", value),
    language: language
  });
  const root = document.createElement("div");
  // use:sortable directive (compiled use() helper): run untracked, exactly
  // like solid-js/web's use() does.
  untrack(() => sortable(root, () => true));
  insert(root, createComponent(Show, {
    get when() {
      return preview() && !selected();
    },
    get fallback() {
      return tile();
    },
    get children() {
      return createComponent(HoverCard, {
        get open() {
          return !state.suppressHover && hoverOpen() && !state.menu;
        },
        openDelay: 0,
        closeDelay: 0,
        placement: "right-start",
        gutter: 6,
        get trigger() {
          return tile();
        },
        onOpenChange: value => {
          if (state.menu) return;
          if (value && state.suppressHover) return;
          props.ctx.onHoverOpenChanged(props.project.worktree, value);
        },
        get children() {
          return createComponent(ProjectPreviewPanel, {
            get project() {
              return props.project;
            },
            get mobile() {
              return props.mobile;
            },
            selected: selected,
            workspaceEnabled: workspaceEnabled,
            workspaces: workspaces,
            label: label,
            projectSessions: projectSessions,
            workspaceSessions: workspaceSessions,
            get ctx() {
              return props.ctx;
            },
            language: language
          });
        }
      });
    }
  }));
  createRenderEffect(() => root.classList.toggle("opacity-30", !!sortable.isActiveDraggable));
  return root;
};
