// The session list keeps solid-js/web insert() for one region only: the
// For-reconciled SessionItem rows. SessionItem returns [row element, child
// accessor] (the nested child-session subtree is a live memo), and For keys
// rows by session identity so unchanged rows keep their DOM nodes across list
// updates. insert() reconciles that nested array/accessor shape in place
// instead of detaching live rows (established exception, same as
// sidebar-project.js).
import { insert } from "../../lib/reactivity.js";
import { useNavigate, useParams } from "../../lib/router/index.js";
import { createComponent, createEffect, createMemo, createRenderEffect, For, Show, untrack } from "../../lib/reactivity.js";
import { createStore } from "../../lib/store.js";
import { createSortable } from "../../lib/dnd/index.js";
import { createMediaQuery } from "../../lib/primitives/media.js";
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
import { useQuery } from "../../lib/query/index.js";

/** @file Sidebar workspace rows: per-workspace headers (status, kind, branch/inline-rename), action menus, the session list, and the sortable/collapsible workspace containers (sandbox and local). */

// Build a detached element from compact HTML (no inter-element whitespace,
// matching the compiled Solid templates). Built fresh per call: no cloneNode.
// Only static markup goes through here; user strings use textContent.
/**
 * Builds a detached DOM element from a compact HTML string.
 *
 * @param {string} html - Static markup with no inter-element whitespace.
 * @returns {Element} The first element child parsed from the markup.
 */
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  return wrapper.firstElementChild;
}

/**
 * Floating drag preview showing the "kind : name" label of the workspace
 * currently being dragged.
 *
 * @param {Object} props - Component props.
 * @param {Function} props.sidebarProject - Accessor for the active sidebar project.
 * @param {Function} props.activeWorkspace - Accessor for the dragged workspace directory.
 * @param {Function} props.workspaceLabel - Builds a workspace name from (directory, branch, projectId).
 * @returns {Node} The drag overlay component.
 */
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
  // Show is the same runtime solid-js component the original used (its memo
  // result is resolved by the DragOverlay's insertion). The callback child
  // receives an accessor; a render effect replaces the compiled insert() for
  // the badge text.
  return createComponent(Show, {
    get when() {
      return label();
    },
    children: value => {
      const el = template(`<div class="bg-body rounded-2 px-2 py-1 fw-medium text-body-emphasis"></div>`);
      createRenderEffect(() => {
        let v = value;
        while (typeof v === "function") v = v();
        el.textContent = v == null ? "" : String(v);
      });
      return el;
    }
  });
};
/**
 * Workspace row header: a status box (spinner when busy, branch icon
 * otherwise), the workspace kind label, the name (read-only branch span for
 * local, inline editor for sandboxes), and an expand/collapse chevron.
 *
 * @param {Object} props - Component props.
 * @param {Function} props.local - Accessor: true for the project's local worktree.
 * @param {Function} props.busy - Accessor: true while the workspace is busy.
 * @param {Function} props.open - Accessor: true when the workspace is expanded.
 * @param {string} props.directory - The workspace directory path.
 * @param {Function} props.branch - Accessor for the VCS branch name.
 * @param {Function} props.workspaceValue - Accessor for the editable workspace name value.
 * @param {Function} props.workspaceEditActive - Accessor: true while the inline editor is editing.
 * @param {Function} props.InlineEditor - Inline editor component for renaming.
 * @param {Function} props.renameWorkspace - Persists a workspace rename.
 * @param {Function} props.setEditor - Updates inline-editor state.
 * @param {string} props.projectId - Owning project id.
 * @param {Object} props.language - Language context for translations.
 * @returns {HTMLElement} The workspace header element.
 */
const WorkspaceHeader = props => {
  // Static skeleton (_tmpl$2): status box + "<kind> :" span + chevron box; the
  // name (editor or branch span) is inserted between the span and the chevron.
  const root = template(`<div class="d-flex align-items-center gap-1 min-w-0 flex-1"><div class="d-flex align-items-center justify-content-center shrink-0 size-6"></div><span class="fw-medium text-body shrink-0"> :</span><div class="d-flex align-items-center justify-content-center shrink-0 overflow-hidden w-0 opacity-0 transition-all duration-200 group-hover/workspace:w-3.5 group-hover/workspace:opacity-100 group-focus-within/workspace:w-3.5 group-focus-within/workspace:opacity-100"></div></div>`);
  const statusBox = root.firstChild;
  const kindSpan = statusBox.nextSibling;
  const chevronBox = kindSpan.nextSibling;

  // Spinner while busy, branch icon otherwise (Show with fallback): rebuild
  // only on truthiness flips, mirroring Show's condition memo.
  let busyShown;
  createRenderEffect(() => {
    const value = !!props.busy();
    if (value === busyShown) return;
    busyShown = value;
    statusBox.replaceChildren(value ? createComponent(Spinner, {
      "class": "size-[15px]"
    }) : createComponent(Icon, {
      name: "branch",
      size: "small"
    }));
  });

  // Workspace kind label, inserted before the static " :" text node.
  const kindText = document.createTextNode("");
  kindSpan.insertBefore(kindText, kindSpan.firstChild);
  createRenderEffect(() => {
    kindText.data = props.local() ? props.language.t("workspace.type.local") : props.language.t("workspace.type.sandbox");
  });

  // Name region (Show when !local, fallback = read-only branch span): managed
  // before the chevron box so membership flips keep the original DOM order.
  let nameCurrent = null;
  /**
   * Swaps the workspace name node (branch span or inline editor) before the
   * chevron box, preserving document order across membership flips.
   *
   * @param {Node} node - The new name node, or null to clear it.
   * @returns {void}
   */
  const mountName = node => {
    if (node === nameCurrent) return;
    if (nameCurrent) nameCurrent.remove();
    if (node) root.insertBefore(node, chevronBox);
    nameCurrent = node;
  };
  let nameSandbox;
  createRenderEffect(() => {
    const sandbox = !props.local();
    if (sandbox === nameSandbox) return;
    nameSandbox = sandbox;
    if (!sandbox) {
      const span = template(`<span class="fw-medium text-body min-w-0 truncate"></span>`);
      createRenderEffect(() => {
        const value = props.branch() ?? getFilename(props.directory);
        span.textContent = value == null ? "" : String(value);
      });
      mountName(span);
      return;
    }
    const editor = createComponent(props.InlineEditor, {
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
    // InlineEditor returns a memo accessor that swaps between the display
    // span and the input as editing toggles; resolve it reactively (this
    // nested effect is owned by the branch run, disposing on swap).
    createRenderEffect(() => {
      let value = editor;
      while (typeof value === "function") value = value();
      mountName(value ?? null);
    });
  });

  // Chevron: identical createComponent call; the vanilla Icon reads `name`
  // once at creation, exactly as it did for the compiled caller.
  chevronBox.appendChild(createComponent(Icon, {
    get name() {
      return props.open() ? "chevron-down" : "chevron-right";
    },
    size: "small",
    "class": "text-secondary"
  }));
  return root;
};
/**
 * Hover/focus-revealed action cluster for a workspace row: a "more options"
 * dropdown (rename, reset, delete) and a quick "new session" button.
 *
 * @param {Object} props - Component props.
 * @param {string} props.directory - The workspace directory path.
 * @param {string} props.root - The owning project's worktree (root) path.
 * @param {Function} props.local - Accessor: true for the project's local worktree.
 * @param {Function} props.busy - Accessor: true while the workspace is busy.
 * @param {Function} props.menuOpen - Accessor: true when the dropdown is open.
 * @param {Function} props.pendingRename - Accessor: true when a rename is queued on menu close.
 * @param {Function} props.setMenuOpen - Setter for the dropdown open flag.
 * @param {Function} props.setPendingRename - Setter for the pending-rename flag.
 * @param {Function} props.sidebarHovering - Accessor: true while the sidebar is hovered.
 * @param {Function} props.touch - Accessor: true on touch (hover:none) devices.
 * @param {Function} props.workspaceValue - Accessor for the editable workspace name.
 * @param {Function} props.openEditor - Opens the inline editor for an id.
 * @param {Function} props.showResetWorkspaceDialog - Opens the reset-workspace dialog.
 * @param {Function} props.showDeleteWorkspaceDialog - Opens the delete-workspace dialog.
 * @param {Function} props.clearHoverProjectSoon - Dismisses the hover-project preview.
 * @param {Function} props.navigateToNewSession - Navigates to a new session in this workspace.
 * @param {Object} props.language - Language context for translations.
 * @returns {HTMLElement} The actions cluster element.
 */
const WorkspaceActions = props => {
  const root = template(`<div class="absolute right-1 top-1/2 -translate-y-1/2 d-flex align-items-center gap-0.5 transition-opacity"></div>`);
  // Static keys of the compiled classList effect (always true).
  root.classList.add("group-hover/workspace:opacity-100", "group-hover/workspace:pointer-events-auto", "group-focus-within/workspace:opacity-100", "group-focus-within/workspace:pointer-events-auto");
  root.appendChild(createComponent(DropdownMenu, {
    get modal() {
      return !props.sidebarHovering();
    },
    get open() {
      return props.menuOpen();
    },
    onOpenChange: open => props.setMenuOpen(open),
    get children() {
      return [createComponent(Tooltip, {
        get value() {
          return props.language.t("common.moreOptions");
        },
        placement: "top",
        get children() {
          return createComponent(DropdownMenu.Trigger, {
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
      }), createComponent(DropdownMenu.Portal, {
        get children() {
          return createComponent(DropdownMenu.Content, {
            onCloseAutoFocus: event => {
              if (!props.pendingRename()) return;
              event.preventDefault();
              props.setPendingRename(false);
              props.openEditor(`workspace:${props.directory}`, props.workspaceValue());
            },
            get children() {
              return [createComponent(DropdownMenu.Item, {
                get disabled() {
                  return props.local();
                },
                onSelect: () => {
                  props.setPendingRename(true);
                  props.setMenuOpen(false);
                },
                get children() {
                  return createComponent(DropdownMenu.ItemLabel, {
                    get children() {
                      return props.language.t("common.rename");
                    }
                  });
                }
              }), createComponent(DropdownMenu.Item, {
                get disabled() {
                  return props.local() || props.busy();
                },
                onSelect: () => props.showResetWorkspaceDialog(props.root, props.directory),
                get children() {
                  return createComponent(DropdownMenu.ItemLabel, {
                    get children() {
                      return props.language.t("common.reset");
                    }
                  });
                }
              }), createComponent(DropdownMenu.Item, {
                get disabled() {
                  return props.local() || props.busy();
                },
                onSelect: () => props.showDeleteWorkspaceDialog(props.root, props.directory),
                get children() {
                  return createComponent(DropdownMenu.ItemLabel, {
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
  }));

  // New-session shortcut (Show when !touch): last region of the row, so plain
  // append/remove keeps the original order; rebuilt per truthiness flip.
  let shortcutShown;
  let shortcutNode = null;
  createRenderEffect(() => {
    const show = !props.touch();
    if (show === shortcutShown) return;
    shortcutShown = show;
    if (shortcutNode) {
      shortcutNode.remove();
      shortcutNode = null;
    }
    if (!show) return;
    shortcutNode = createComponent(Tooltip, {
      get value() {
        return props.language.t("command.session.new");
      },
      placement: "top",
      get children() {
        return createComponent(IconButton, {
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
    root.appendChild(shortcutNode);
  });

  // Reactive keys of the compiled classList effect.
  createRenderEffect(() => {
    const open = !!props.menuOpen();
    root.classList.toggle("opacity-100", open);
    root.classList.toggle("pointer-events-auto", open);
    root.classList.toggle("opacity-0", !open);
    root.classList.toggle("pointer-events-none", !open);
  });
  return root;
};
/**
 * Session list for a workspace: an optional "new session" row, a loading
 * skeleton, the For-reconciled SessionItem rows, and a "load more" row, all
 * kept in document order via placeholder anchors.
 *
 * @param {Object} props - Component props.
 * @param {Function} props.slug - Accessor for the base64 directory slug.
 * @param {boolean} props.mobile - Whether rendering on a mobile layout.
 * @param {Function} props.showNew - Accessor: true to show the new-session row.
 * @param {Function} props.loading - Accessor: true to show the loading skeleton.
 * @param {Function} props.sessions - Accessor for the session list.
 * @param {Function} props.hasMore - Accessor: true when more sessions can be loaded.
 * @param {Function} props.loadMore - Loads the next page of sessions.
 * @param {Object} props.ctx - Shared sidebar context (prefetch, archive, expansion, hover helpers).
 * @param {Object} props.language - Language context for translations.
 * @returns {HTMLElement} The session list nav element.
 */
const WorkspaceSessionList = props => {
  const nav = template(`<nav class="d-flex flex-column gap-1"></nav>`);
  // Empty text nodes keep the four dynamic regions in document order (the
  // compiled insert() runtime used the same placeholder technique).
  const newAnchor = nav.appendChild(document.createTextNode(""));
  const skeletonAnchor = nav.appendChild(document.createTextNode(""));
  const sessionsAnchor = nav.appendChild(document.createTextNode(""));
  const moreAnchor = nav.appendChild(document.createTextNode(""));

  // New-session row (Show when showNew): rebuilt per truthiness flip.
  let newShown;
  let newNode = null;
  createRenderEffect(() => {
    const show = !!props.showNew();
    if (show === newShown) return;
    newShown = show;
    if (newNode) {
      newNode.remove();
      newNode = null;
    }
    if (!show) return;
    newNode = createComponent(NewSessionItem, {
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
    nav.insertBefore(newNode, newAnchor);
  });

  // Loading skeleton (Show when loading).
  let loadingShown;
  let skeletonNode = null;
  createRenderEffect(() => {
    const show = !!props.loading();
    if (show === loadingShown) return;
    loadingShown = show;
    if (skeletonNode) {
      skeletonNode.remove();
      skeletonNode = null;
    }
    if (!show) return;
    skeletonNode = createComponent(SessionSkeleton, {});
    nav.insertBefore(skeletonNode, skeletonAnchor);
  });

  // Session rows: For + insert() so row identity survives list updates and
  // the nested child-session accessor each SessionItem returns stays live
  // (established exception, see header note).
  insert(nav, createComponent(For, {
    get each() {
      return props.sessions();
    },
    children: session => createComponent(SessionItem, {
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
  }), sessionsAnchor);

  // Load-more row (Show when hasMore): rebuilt per truthiness flip.
  let moreShown;
  let moreNode = null;
  createRenderEffect(() => {
    const show = !!props.hasMore();
    if (show === moreShown) return;
    moreShown = show;
    if (moreNode) {
      moreNode.remove();
      moreNode = null;
    }
    if (!show) return;
    moreNode = template(`<div class="relative w-full py-1"></div>`);
    moreNode.appendChild(createComponent(Button, {
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
    nav.insertBefore(moreNode, moreAnchor);
  });
  return nav;
};
/**
 * Sortable, collapsible workspace container (used for sandbox/non-local
 * workspaces): a header row with actions and the collapsible session list.
 * Bootstraps the workspace's data store when expanded or active.
 *
 * @param {Object} props - Component props.
 * @param {string} props.directory - The workspace directory path.
 * @param {Object} props.project - Owning project descriptor (worktree, id).
 * @param {boolean} props.mobile - Whether rendering on a mobile layout.
 * @param {Function} props.sortNow - Accessor for the current sort timestamp.
 * @param {Object} props.ctx - Shared sidebar context (expansion state, editors, dialogs, navigation, prefetch).
 * @returns {HTMLElement} The sortable workspace root element.
 */
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
  /**
   * Raises this workspace's session limit and fetches the next page.
   *
   * @returns {Promise} Resolves once the additional sessions are loaded.
   */
  const loadMore = async () => {
    setWorkspaceStore("limit", limit => (limit ?? 0) + 5);
    await globalSync.project.loadSessions(props.directory);
  };
  const workspaceEditActive = createMemo(() => props.ctx.editorOpen(`workspace:${props.directory}`));
  const header = () => createComponent(WorkspaceHeader, {
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
  /**
   * Persists the workspace expanded/collapsed state, closing any open inline
   * editor when the workspace collapses.
   *
   * @param {boolean} value - True to expand, false to collapse.
   * @returns {void}
   */
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

  // Header row skeleton (_tmpl$8): py-1 wrapper > workspace-item > flex row.
  const headerRow = template(`<div class="py-1"><div class="group/workspace relative" data-component="workspace-item"><div class="d-flex align-items-center gap-1"></div></div></div>`);
  const workspaceItem = headerRow.firstChild;
  const flexRow = workspaceItem.firstChild;

  // Actions are static (appended first); the header region is kept before
  // them so membership flips preserve the original order.
  const actions = createComponent(WorkspaceActions, {
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
  });
  flexRow.appendChild(actions);

  // Collapsible trigger (read mode) / plain div (while the inline editor is
  // active), both hosting a fresh WorkspaceHeader (Show with fallback).
  const headerClass = () => `d-flex align-items-center justify-content-between w-100 pl-2 py-1.5 rounded-2 transition-[padding] duration-200 ${menu.open ? "pr-16" : "pr-2"} group-hover/workspace:pr-16 group-focus-within/workspace:pr-16`;
  let editShown;
  let headerNode = null;
  createRenderEffect(() => {
    const editing = !!workspaceEditActive();
    if (editing === editShown) return;
    editShown = editing;
    if (headerNode) headerNode.remove();
    if (editing) {
      const holder = document.createElement("div");
      holder.appendChild(header());
      // Compiled className effect: tracks menu.open while editing.
      createRenderEffect(() => {
        holder.className = headerClass();
      });
      headerNode = holder;
    } else {
      headerNode = createComponent(Collapsible.Trigger, {
        get ["class"]() {
          return headerClass();
        },
        "data-action": "workspace-toggle",
        get ["data-workspace"]() {
          return base64Encode(props.directory);
        },
        get children() {
          return header();
        }
      });
    }
    flexRow.insertBefore(headerNode, actions);
  });
  createRenderEffect(() => {
    workspaceItem.setAttribute("data-workspace", base64Encode(props.directory));
  });

  const root = document.createElement("div");
  // use:sortable directive (compiled use() helper): run untracked, exactly
  // like solid-js/web's use() does.
  untrack(() => sortable(root, () => true));
  root.appendChild(createComponent(Collapsible, {
    variant: "ghost",
    get open() {
      return open();
    },
    "class": "shrink-0",
    onOpenChange: openWrapper,
    get children() {
      return [headerRow, createComponent(Collapsible.Content, {
        get children() {
          return createComponent(WorkspaceSessionList, {
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
  createRenderEffect(() => {
    root.classList.toggle("opacity-30", !!sortable.isActiveDraggable);
    const blocked = !!busy();
    root.classList.toggle("opacity-50", blocked);
    root.classList.toggle("pointer-events-none", blocked);
  });
  return root;
};
/**
 * Scrollable session list for a project's local worktree (no collapsible
 * header). Registers the scroll container ref and renders a WorkspaceSessionList
 * with paging.
 *
 * @param {Object} props - Component props.
 * @param {Object} props.project - The project descriptor (worktree, id).
 * @param {boolean} props.mobile - Whether rendering on a mobile layout.
 * @param {Function} props.sortNow - Accessor for the current sort timestamp.
 * @param {Object} props.ctx - Shared sidebar context (scroll container ref, prefetch, navigation).
 * @returns {HTMLElement} The local workspace root element.
 */
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
  const root = template(`<div class="size-full d-flex flex-column py-2 overflow-y-auto no-scrollbar [overflow-anchor:none]"></div>`);
  // ref (compiled use() helper): run untracked like solid-js/web's use().
  untrack(() => props.ctx.setScrollContainerRef(root, props.mobile));
  root.appendChild(createComponent(WorkspaceSessionList, {
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
  return root;
};
