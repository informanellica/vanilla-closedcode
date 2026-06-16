import { createComponent, createEffect, createMemo, For, Show } from "../../lib/reactivity.js";
import { insert } from "../../lib/reactivity.js";
import { DragDropProvider, DragDropSensors, DragOverlay, SortableProvider, closestCenter } from "../../lib/dnd/index.js";
import { ConstrainDragXAxis } from "@/utils/solid-dnd.js";
import { IconButton } from "@/bs/icon-button.js";
import { Tooltip, TooltipKeybind } from "@/bs/tooltip.js";

/** @file Sidebar shell: the rail + collapsible panel layout that hosts the drag-and-drop project list, the add-project button, and the settings/help rail footer. */

/**
 * Top-level sidebar layout: a fixed rail (project list + footer buttons) beside
 * a collapsible panel. Wires up drag-and-drop for the project list and renders
 * the settings/help affordances.
 *
 * @param {Object} props - Component props.
 * @param {boolean} props.mobile - Whether rendering on a mobile layout (forces expanded).
 * @param {Function} props.opened - Accessor: true when the panel is open.
 * @param {Function} props.projects - Accessor for the ordered project list.
 * @param {Function} props.renderProject - Renders a single project rail entry.
 * @param {Function} props.renderProjectOverlay - Renders the drag overlay for the active project.
 * @param {Function} props.renderPanel - Renders the panel content.
 * @param {Function} props.aimMove - Rail mousemove handler used for hover-aim tracking.
 * @param {Function} props.handleDragStart - Drag-start handler for the project list.
 * @param {Function} props.handleDragEnd - Drag-end handler for the project list.
 * @param {Function} props.handleDragOver - Drag-over handler for the project list.
 * @param {Function} props.onOpenProject - Click handler for the add-project button.
 * @param {string} props.openProjectLabel - Label/tooltip text for the add-project button.
 * @param {Function} props.openProjectKeybind - Accessor for the add-project keybind hint.
 * @param {Function} props.settingsLabel - Accessor for the settings button label.
 * @param {Function} props.settingsKeybind - Accessor for the settings keybind hint.
 * @param {Function} props.onOpenSettings - Click handler for the settings button.
 * @param {Function} props.helpLabel - Accessor for the help button label.
 * @param {Function} props.onOpenHelp - Click handler for the help button.
 * @returns {HTMLElement} The sidebar root element.
 */
export const SidebarContent = props => {
  const expanded = createMemo(() => !!props.mobile || props.opened());
  const placement = () => props.mobile ? "bottom" : "right";
  let panel;
  createEffect(() => {
    const el = panel;
    if (!el) return;
    if (expanded()) {
      el.removeAttribute("inert");
      return;
    }
    el.setAttribute("inert", "");
  });

  // Static skeleton mirroring _tmpl$2:
  // <div> (root)
  //   <div data-component=sidebar-rail> (rail)
  //     <div> (projectList)  <div> (railFooter)
  //   <div> (panel)
  const root = document.createElement("div");
  root.className = "d-flex h-100 w-100 min-w-0 overflow-hidden";

  const rail = document.createElement("div");
  rail.setAttribute("data-component", "sidebar-rail");
  rail.className = "w-16 shrink-0 bg-body d-flex flex-column align-items-center overflow-hidden";

  const projectList = document.createElement("div");
  projectList.className = "flex-1 min-h-0 w-100";

  const railFooter = document.createElement("div");
  railFooter.className = "shrink-0 w-100 pt-3 pb-6 d-flex flex-column align-items-center gap-2";

  rail.appendChild(projectList);
  rail.appendChild(railFooter);

  const panelEl = document.createElement("div");
  panel = panelEl; // ref binding (replaces the compiled use:ref on the panel div)

  root.appendChild(rail);
  root.appendChild(panelEl);

  // Rail mousemove → props.aimMove (capture). Compiled used delegated events;
  // a capturing listener preserves identical timing/order for this handler.
  rail.addEventListener("mousemove", event => props.aimMove?.(event), true);

  // Drag-and-drop provider holding the sortable project list and the
  // "add project" tooltip/button. Inserted into projectList.
  insert(projectList, createComponent(DragDropProvider, {
    get onDragStart() {
      return props.handleDragStart;
    },
    get onDragEnd() {
      return props.handleDragEnd;
    },
    get onDragOver() {
      return props.handleDragOver;
    },
    collisionDetector: closestCenter,
    get children() {
      return [createComponent(DragDropSensors, {}), createComponent(ConstrainDragXAxis, {}), (() => {
        // _tmpl$: scrolling column holding the sortable projects + add button.
        const column = document.createElement("div");
        column.className = "h-100 w-100 d-flex flex-column align-items-center gap-3 px-3 py-3 overflow-y-auto no-scrollbar";

        insert(column, createComponent(SortableProvider, {
          get ids() {
            return props.projects().map(p => p.worktree);
          },
          get children() {
            return createComponent(For, {
              get each() {
                return props.projects();
              },
              children: project => props.renderProject(project)
            });
          }
        }), null);

        insert(column, createComponent(Tooltip, {
          get placement() {
            return placement();
          },
          get value() {
            // _tmpl$4: <div class="d-flex align-items-center gap-2"><span>label
            // </span> + optional keybind hint span</div>.
            const tip = document.createElement("div");
            tip.className = "d-flex align-items-center gap-2";
            const labelSpan = document.createElement("span");
            tip.appendChild(labelSpan);
            insert(labelSpan, () => props.openProjectLabel);
            insert(tip, createComponent(Show, {
              get when() {
                return !props.mobile && !!props.openProjectKeybind();
              },
              get children() {
                // _tmpl$3: keybind hint span.
                const hint = document.createElement("span");
                hint.className = "text-secondary small fw-medium";
                insert(hint, () => props.openProjectKeybind());
                return hint;
              }
            }), null);
            return tip;
          },
          get children() {
            return createComponent(IconButton, {
              icon: "plus",
              variant: "ghost",
              size: "large",
              get onClick() {
                return props.onOpenProject;
              },
              get ["aria-label"]() {
                return typeof props.openProjectLabel === "string" ? props.openProjectLabel : undefined;
              }
            });
          }
        }), null);

        return column;
      })(), createComponent(DragOverlay, {
        get children() {
          return props.renderProjectOverlay();
        }
      })];
    }
  }));

  // Rail footer: settings (keybind tooltip) + help (plain tooltip) buttons.
  insert(railFooter, createComponent(TooltipKeybind, {
    get placement() {
      return placement();
    },
    get title() {
      return props.settingsLabel();
    },
    get keybind() {
      return props.settingsKeybind() ?? "";
    },
    get children() {
      return createComponent(IconButton, {
        icon: "settings-gear",
        variant: "ghost",
        size: "large",
        get onClick() {
          return props.onOpenSettings;
        },
        get ["aria-label"]() {
          return props.settingsLabel();
        }
      });
    }
  }), null);

  insert(railFooter, createComponent(Tooltip, {
    get placement() {
      return placement();
    },
    get value() {
      return props.helpLabel();
    },
    get children() {
      return createComponent(IconButton, {
        icon: "help",
        variant: "ghost",
        size: "large",
        get onClick() {
          return props.onOpenHelp;
        },
        get ["aria-label"]() {
          return props.helpLabel();
        }
      });
    }
  }), null);

  // Panel content.
  insert(panelEl, () => props.renderPanel());

  // Panel dynamic class list + aria-hidden, change-guarded like the compiled
  // effect(). The base classes are always present; "pointer-events-none" and
  // aria-hidden track the collapsed state.
  let prevCollapsed;
  let prevHidden;
  createEffect(() => {
    const collapsed = !expanded();
    if (collapsed !== prevCollapsed) {
      prevCollapsed = collapsed;
      panelEl.className =
        "flex-1 d-flex h-100 min-h-0 min-w-0 overflow-hidden" +
        (collapsed ? " pointer-events-none" : "");
    }
    if (collapsed !== prevHidden) {
      panelEl.setAttribute("aria-hidden", prevHidden = collapsed);
    }
  });

  return root;
};
