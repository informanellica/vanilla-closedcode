import { template as _$template } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { className as _$className } from "solid-js/web";
import { use as _$use } from "solid-js/web";
import { classList as _$classList } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div class="bg-body rounded-2 px-2 py-1 fw-medium text-body-emphasis">`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div class="d-flex align-items-center gap-1 min-w-0 flex-1"><div class="d-flex align-items-center justify-content-center shrink-0 size-6"></div><span class="fw-medium text-body shrink-0"> :</span><div class="d-flex align-items-center justify-content-center shrink-0 overflow-hidden w-0 opacity-0 transition-all duration-200 group-hover/workspace:w-3.5 group-hover/workspace:opacity-100 group-focus-within/workspace:w-3.5 group-focus-within/workspace:opacity-100">`),
  _tmpl$3 = /*#__PURE__*/_$template(`<span class="fw-medium text-body min-w-0 truncate">`),
  _tmpl$4 = /*#__PURE__*/_$template(`<div class="absolute right-1 top-1/2 -translate-y-1/2 d-flex align-items-center gap-0.5 transition-opacity">`),
  _tmpl$5 = /*#__PURE__*/_$template(`<div class="relative w-full py-1">`),
  _tmpl$6 = /*#__PURE__*/_$template(`<nav class="d-flex flex-column gap-1">`),
  _tmpl$7 = /*#__PURE__*/_$template(`<div>`),
  _tmpl$8 = /*#__PURE__*/_$template(`<div class=py-1><div class="group/workspace relative"data-component=workspace-item><div class="d-flex align-items-center gap-1">`),
  _tmpl$9 = /*#__PURE__*/_$template(`<div class="size-full d-flex flex-column py-2 overflow-y-auto no-scrollbar [overflow-anchor:none]">`);
import { useNavigate, useParams } from "@solidjs/router";
import { createEffect, createMemo, For, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { createSortable } from "@thisbeyond/solid-dnd";
import { createMediaQuery } from "@solid-primitives/media";
import { base64Encode } from "core/util/encode";
import { getFilename } from "core/util/path";
import { Button } from "@/bs/button.js";
import { Collapsible } from "@/bs/collapsible.js";
import { DropdownMenu } from "@/bs/dropdown-menu.js";
import { Icon } from "@/bs/icon.js";
import { IconButton } from "@/bs/icon-button.js";
import { Spinner } from "@/bs/spinner.js";
import { Tooltip } from "@/bs/tooltip.js";
import { loadSessionsQuery, useGlobalSync } from "@/context/global-sync.js";
import { useLanguage } from "@/context/language.js";
import { pathKey } from "@/utils/path-key.js";
import { NewSessionItem, SessionItem, SessionSkeleton } from "./sidebar-items.js";
import { sortedRootSessions } from "./helpers.js";
import { useQuery } from "@tanstack/solid-query";
export const WorkspaceDragOverlay = props => {
  const globalSync = useGlobalSync();
  const language = useLanguage();
  const label = createMemo(() => {
    const project = props.sidebarProject();
    if (!project) return;
    const directory = props.activeWorkspace();
    if (!directory) return;
    const [workspaceStore] = globalSync.child(directory, {
      bootstrap: false
    });
    const kind = directory === project.worktree ? language.t("workspace.type.local") : language.t("workspace.type.sandbox");
    const name = props.workspaceLabel(directory, workspaceStore.vcs?.branch, project.id);
    return `${kind} : ${name}`;
  });
  return _$createComponent(Show, {
    get when() {
      return label();
    },
    children: value => (() => {
      var _el$ = _tmpl$();
      _$insert(_el$, value);
      return _el$;
    })()
  });
};
const WorkspaceHeader = props => (() => {
  var _el$2 = _tmpl$2(),
    _el$3 = _el$2.firstChild,
    _el$4 = _el$3.nextSibling,
    _el$5 = _el$4.firstChild,
    _el$6 = _el$4.nextSibling;
  _$insert(_el$3, _$createComponent(Show, {
    get when() {
      return props.busy();
    },
    get fallback() {
      return _$createComponent(Icon, {
        name: "branch",
        size: "small"
      });
    },
    get children() {
      return _$createComponent(Spinner, {
        "class": "size-[15px]"
      });
    }
  }));
  _$insert(_el$4, (() => {
    var _c$ = _$memo(() => !!props.local());
    return () => _c$() ? props.language.t("workspace.type.local") : props.language.t("workspace.type.sandbox");
  })(), _el$5);
  _$insert(_el$2, _$createComponent(Show, {
    get when() {
      return !props.local();
    },
    get fallback() {
      return (() => {
        var _el$7 = _tmpl$3();
        _$insert(_el$7, () => props.branch() ?? getFilename(props.directory));
        return _el$7;
      })();
    },
    get children() {
      return _$createComponent(props.InlineEditor, {
        get id() {
          return `workspace:${props.directory}`;
        },
        get value() {
          return props.workspaceValue;
        },
        onSave: next => {
          const trimmed = next.trim();
          if (!trimmed) return;
          props.renameWorkspace(props.directory, trimmed, props.projectId, props.branch());
          props.setEditor("value", props.workspaceValue());
        },
        "class": "fw-medium text-body min-w-0 truncate",
        displayClass: "fw-medium text-body min-w-0 truncate",
        get editing() {
          return props.workspaceEditActive();
        },
        stopPropagation: false,
        openOnDblClick: false
      });
    }
  }), _el$6);
  _$insert(_el$6, _$createComponent(Icon, {
    get name() {
      return props.open() ? "chevron-down" : "chevron-right";
    },
    size: "small",
    "class": "text-secondary"
  }));
  return _el$2;
})();
const WorkspaceActions = props => (() => {
  var _el$8 = _tmpl$4();
  _$insert(_el$8, _$createComponent(DropdownMenu, {
    get modal() {
      return !props.sidebarHovering();
    },
    get open() {
      return props.menuOpen();
    },
    onOpenChange: open => props.setMenuOpen(open),
    get children() {
      return [_$createComponent(Tooltip, {
        get value() {
          return props.language.t("common.moreOptions");
        },
        placement: "top",
        get children() {
          return _$createComponent(DropdownMenu.Trigger, {
            as: IconButton,
            icon: "dot-grid",
            variant: "ghost",
            "class": "size-6 rounded-2",
            "data-action": "workspace-menu",
            get ["data-workspace"]() {
              return base64Encode(props.directory);
            },
            get ["aria-label"]() {
              return props.language.t("common.moreOptions");
            }
          });
        }
      }), _$createComponent(DropdownMenu.Portal, {
        get children() {
          return _$createComponent(DropdownMenu.Content, {
            onCloseAutoFocus: event => {
              if (!props.pendingRename()) return;
              event.preventDefault();
              props.setPendingRename(false);
              props.openEditor(`workspace:${props.directory}`, props.workspaceValue());
            },
            get children() {
              return [_$createComponent(DropdownMenu.Item, {
                get disabled() {
                  return props.local();
                },
                onSelect: () => {
                  props.setPendingRename(true);
                  props.setMenuOpen(false);
                },
                get children() {
                  return _$createComponent(DropdownMenu.ItemLabel, {
                    get children() {
                      return props.language.t("common.rename");
                    }
                  });
                }
              }), _$createComponent(DropdownMenu.Item, {
                get disabled() {
                  return props.local() || props.busy();
                },
                onSelect: () => props.showResetWorkspaceDialog(props.root, props.directory),
                get children() {
                  return _$createComponent(DropdownMenu.ItemLabel, {
                    get children() {
                      return props.language.t("common.reset");
                    }
                  });
                }
              }), _$createComponent(DropdownMenu.Item, {
                get disabled() {
                  return props.local() || props.busy();
                },
                onSelect: () => props.showDeleteWorkspaceDialog(props.root, props.directory),
                get children() {
                  return _$createComponent(DropdownMenu.ItemLabel, {
                    get children() {
                      return props.language.t("common.delete");
                    }
                  });
                }
              })];
            }
          });
        }
      })];
    }
  }), null);
  _$insert(_el$8, _$createComponent(Show, {
    get when() {
      return !props.touch();
    },
    get children() {
      return _$createComponent(Tooltip, {
        get value() {
          return props.language.t("command.session.new");
        },
        placement: "top",
        get children() {
          return _$createComponent(IconButton, {
            icon: "new-session",
            variant: "ghost",
            "class": "size-6 rounded-2 opacity-0 pointer-events-none group-hover/workspace:opacity-100 group-hover/workspace:pointer-events-auto group-focus-within/workspace:opacity-100 group-focus-within/workspace:pointer-events-auto",
            "data-action": "workspace-new-session",
            get ["data-workspace"]() {
              return base64Encode(props.directory);
            },
            get ["aria-label"]() {
              return props.language.t("command.session.new");
            },
            onClick: event => {
              event.preventDefault();
              event.stopPropagation();
              props.clearHoverProjectSoon();
              props.navigateToNewSession();
            }
          });
        }
      });
    }
  }), null);
  _$effect(_$p => _$classList(_el$8, {
    "opacity-100 pointer-events-auto": props.menuOpen(),
    "opacity-0 pointer-events-none": !props.menuOpen(),
    "group-hover/workspace:opacity-100 group-hover/workspace:pointer-events-auto": true,
    "group-focus-within/workspace:opacity-100 group-focus-within/workspace:pointer-events-auto": true
  }, _$p));
  return _el$8;
})();
const WorkspaceSessionList = props => (() => {
  var _el$9 = _tmpl$6();
  _$insert(_el$9, _$createComponent(Show, {
    get when() {
      return props.showNew();
    },
    get children() {
      return _$createComponent(NewSessionItem, {
        get slug() {
          return props.slug();
        },
        get mobile() {
          return props.mobile;
        },
        get sidebarExpanded() {
          return props.ctx.sidebarExpanded;
        },
        get clearHoverProjectSoon() {
          return props.ctx.clearHoverProjectSoon;
        }
      });
    }
  }), null);
  _$insert(_el$9, _$createComponent(Show, {
    get when() {
      return props.loading();
    },
    get children() {
      return _$createComponent(SessionSkeleton, {});
    }
  }), null);
  _$insert(_el$9, _$createComponent(For, {
    get each() {
      return props.sessions();
    },
    children: session => _$createComponent(SessionItem, {
      session: session,
      get list() {
        return props.sessions();
      },
      get navList() {
        return props.ctx.navList;
      },
      get slug() {
        return props.slug();
      },
      get mobile() {
        return props.mobile;
      },
      showChild: true,
      get sidebarExpanded() {
        return props.ctx.sidebarExpanded;
      },
      get clearHoverProjectSoon() {
        return props.ctx.clearHoverProjectSoon;
      },
      get prefetchSession() {
        return props.ctx.prefetchSession;
      },
      get archiveSession() {
        return props.ctx.archiveSession;
      }
    })
  }), null);
  _$insert(_el$9, _$createComponent(Show, {
    get when() {
      return props.hasMore();
    },
    get children() {
      var _el$0 = _tmpl$5();
      _$insert(_el$0, _$createComponent(Button, {
        variant: "ghost",
        "class": "d-flex w-100 text-left justify-content-start text-secondary pl-2 pr-10",
        size: "large",
        onClick: e => {
          void props.loadMore();
          e.currentTarget.blur();
        },
        get children() {
          return props.language.t("common.loadMore");
        }
      }));
      return _el$0;
    }
  }), null);
  return _el$9;
})();
export const SortableWorkspace = props => {
  const navigate = useNavigate();
  const params = useParams();
  const globalSync = useGlobalSync();
  const language = useLanguage();
  const sortable = createSortable(props.directory);
  const [workspaceStore, setWorkspaceStore] = globalSync.child(props.directory, {
    bootstrap: false
  });
  const [menu, setMenu] = createStore({
    open: false,
    pendingRename: false
  });
  const slug = createMemo(() => base64Encode(props.directory));
  const sessions = createMemo(() => sortedRootSessions(workspaceStore, props.sortNow()));
  const local = createMemo(() => props.directory === props.project.worktree);
  const active = createMemo(() => pathKey(props.ctx.currentDir()) === pathKey(props.directory));
  const workspaceValue = createMemo(() => {
    const branch = workspaceStore.vcs?.branch;
    const name = branch ?? getFilename(props.directory);
    return props.ctx.workspaceName(props.directory, props.project.id, branch) ?? name;
  });
  const open = createMemo(() => props.ctx.workspaceExpanded(props.directory, local()));
  const boot = createMemo(() => open() || active());
  const count = createMemo(() => sessions()?.length ?? 0);
  const hasMore = createMemo(() => workspaceStore.sessionTotal > count());
  const query = useQuery(() => ({
    ...loadSessionsQuery(props.project.worktree)
  }));
  const busy = createMemo(() => props.ctx.isBusy(props.directory));
  const loading = () => query.isLoading && count() === 0;
  const touch = createMediaQuery("(hover: none)");
  const showNew = createMemo(() => !loading() && (touch() || count() === 0 || active() && !params.id));
  const loadMore = async () => {
    setWorkspaceStore("limit", limit => (limit ?? 0) + 5);
    await globalSync.project.loadSessions(props.directory);
  };
  const workspaceEditActive = createMemo(() => props.ctx.editorOpen(`workspace:${props.directory}`));
  const header = () => _$createComponent(WorkspaceHeader, {
    local: local,
    busy: busy,
    open: open,
    get directory() {
      return props.directory;
    },
    language: language,
    branch: () => workspaceStore.vcs?.branch,
    workspaceValue: workspaceValue,
    workspaceEditActive: workspaceEditActive,
    get InlineEditor() {
      return props.ctx.InlineEditor;
    },
    get renameWorkspace() {
      return props.ctx.renameWorkspace;
    },
    get setEditor() {
      return props.ctx.setEditor;
    },
    get projectId() {
      return props.project.id;
    }
  });
  const openWrapper = value => {
    props.ctx.setWorkspaceExpanded(props.directory, value);
    if (value) return;
    if (props.ctx.editorOpen(`workspace:${props.directory}`)) props.ctx.closeEditor();
  };
  createEffect(() => {
    if (!boot()) return;
    globalSync.child(props.directory, {
      bootstrap: true
    });
  });
  return (() => {
    var _el$1 = _tmpl$7();
    _$use(sortable, _el$1, () => true);
    _$insert(_el$1, _$createComponent(Collapsible, {
      variant: "ghost",
      get open() {
        return open();
      },
      "class": "shrink-0",
      onOpenChange: openWrapper,
      get children() {
        return [(() => {
          var _el$10 = _tmpl$8(),
            _el$11 = _el$10.firstChild,
            _el$12 = _el$11.firstChild;
          _$insert(_el$12, _$createComponent(Show, {
            get when() {
              return workspaceEditActive();
            },
            get fallback() {
              return _$createComponent(Collapsible.Trigger, {
                get ["class"]() {
                  return `d-flex align-items-center justify-content-between w-100 pl-2 py-1.5 rounded-2 transition-[padding] duration-200 ${menu.open ? "pr-16" : "pr-2"} group-hover/workspace:pr-16 group-focus-within/workspace:pr-16`;
                },
                "data-action": "workspace-toggle",
                get ["data-workspace"]() {
                  return base64Encode(props.directory);
                },
                get children() {
                  return header();
                }
              });
            },
            get children() {
              var _el$13 = _tmpl$7();
              _$insert(_el$13, header);
              _$effect(() => _$className(_el$13, `d-flex align-items-center justify-content-between w-100 pl-2 py-1.5 rounded-2 transition-[padding] duration-200 ${menu.open ? "pr-16" : "pr-2"} group-hover/workspace:pr-16 group-focus-within/workspace:pr-16`));
              return _el$13;
            }
          }), null);
          _$insert(_el$12, _$createComponent(WorkspaceActions, {
            get directory() {
              return props.directory;
            },
            local: local,
            busy: busy,
            menuOpen: () => menu.open,
            pendingRename: () => menu.pendingRename,
            setMenuOpen: open => setMenu("open", open),
            setPendingRename: value => setMenu("pendingRename", value),
            get sidebarHovering() {
              return props.ctx.sidebarHovering;
            },
            touch: touch,
            language: language,
            workspaceValue: workspaceValue,
            get openEditor() {
              return props.ctx.openEditor;
            },
            get showResetWorkspaceDialog() {
              return props.ctx.showResetWorkspaceDialog;
            },
            get showDeleteWorkspaceDialog() {
              return props.ctx.showDeleteWorkspaceDialog;
            },
            get root() {
              return props.project.worktree;
            },
            get clearHoverProjectSoon() {
              return props.ctx.clearHoverProjectSoon;
            },
            navigateToNewSession: () => navigate(`/${slug()}/session`)
          }), null);
          _$effect(() => _$setAttribute(_el$11, "data-workspace", base64Encode(props.directory)));
          return _el$10;
        })(), _$createComponent(Collapsible.Content, {
          get children() {
            return _$createComponent(WorkspaceSessionList, {
              slug: slug,
              get mobile() {
                return props.mobile;
              },
              get ctx() {
                return props.ctx;
              },
              showNew: showNew,
              loading: () => query.isLoading && count() === 0,
              sessions: sessions,
              hasMore: hasMore,
              loadMore: loadMore,
              language: language
            });
          }
        })];
      }
    }));
    _$effect(_$p => _$classList(_el$1, {
      "opacity-30": sortable.isActiveDraggable,
      "opacity-50 pointer-events-none": busy()
    }, _$p));
    return _el$1;
  })();
};
export const LocalWorkspace = props => {
  const globalSync = useGlobalSync();
  const language = useLanguage();
  const workspace = createMemo(() => {
    const [store, setStore] = globalSync.child(props.project.worktree);
    return {
      store,
      setStore
    };
  });
  const slug = createMemo(() => base64Encode(props.project.worktree));
  const sessions = createMemo(() => sortedRootSessions(workspace().store, props.sortNow()));
  const count = createMemo(() => sessions()?.length ?? 0);
  const query = useQuery(() => ({
    ...loadSessionsQuery(props.project.worktree)
  }));
  const hasMore = createMemo(() => workspace().store.sessionTotal > count());
  const loading = () => query.isLoading && count() === 0;
  const loadMore = async () => {
    workspace().setStore("limit", limit => (limit ?? 0) + 5);
    await globalSync.project.loadSessions(props.project.worktree);
  };
  return (() => {
    var _el$14 = _tmpl$9();
    _$use(el => props.ctx.setScrollContainerRef(el, props.mobile), _el$14);
    _$insert(_el$14, _$createComponent(WorkspaceSessionList, {
      slug: slug,
      get mobile() {
        return props.mobile;
      },
      get ctx() {
        return props.ctx;
      },
      showNew: () => false,
      loading: loading,
      sessions: sessions,
      hasMore: hasMore,
      loadMore: loadMore,
      language: language
    }));
    return _el$14;
  })();
};