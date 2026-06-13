import { Avatar } from "@/vendor/ui/components/avatar.js";
import { Icon } from "@/bs/icon.js";
import { IconButton } from "@/bs/icon-button.js";
import { Spinner } from "@/bs/spinner.js";
import { Tooltip } from "@/bs/tooltip.js";
import { getFilename } from "core/util/path";
import { A, useParams } from "../../lib/router/index.js";
import { createComponent, createMemo, createRenderEffect, mergeProps, Show } from "../../lib/reactivity.js";
import { useGlobalSync } from "@/context/global-sync.js";
import { useLanguage } from "@/context/language.js";
import { getAvatarColors, useLayout } from "@/context/layout.js";
import { useNotification } from "@/context/notification.js";
import { usePermission } from "@/context/permission.js";
import { messageAgentColor } from "@/utils/agent.js";
import { sessionTitle } from "@/utils/session-title.js";
import { sessionPermissionRequest } from "../session/composer/session-request-tree.js";
import { childSessionOnPath, hasProjectPermissions } from "./helpers.js";

// Build a detached element from compact HTML (no inter-element whitespace,
// matching the compiled Solid templates). Built fresh per call: no cloneNode.
// Only static markup goes through here; user strings use textContent.
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  return wrapper.firstElementChild;
}

// Mount a SessionItem result into `parent`. SessionItem returns
// [row element, child accessor]; the accessor (a memo) resolves to the nested
// child-session wrapper element or undefined. A render effect keeps that
// trailing region live, replacing solid-js/web insert() for the recursion.
function mountSessionItem(parent, parts) {
  const [row, nested] = parts;
  parent.appendChild(row);
  let current = null;
  createRenderEffect(() => {
    let value = nested;
    while (typeof value === "function") value = value();
    const node = value ?? null;
    if (node === current) return;
    if (current) current.remove();
    if (node) parent.appendChild(node);
    current = node;
  });
}

export function getProjectAvatarSource(id, icon) {
  if (icon?.override) return icon?.override;
  if (icon?.color) return undefined;
  return icon?.url;
}

export const ProjectIcon = props => {
  const globalSync = useGlobalSync();
  const notification = useNotification();
  const permission = usePermission();
  const dirs = createMemo(() => [props.project.worktree, ...(props.project.sandboxes ?? [])]);
  const unseenCount = createMemo(() => dirs().reduce((total, directory) => total + notification.project.unseenCount(directory), 0));
  const hasError = createMemo(() => dirs().some(directory => notification.project.unseenHasError(directory)));
  const hasPermissions = createMemo(() => dirs().some(directory => {
    const [store] = globalSync.child(directory, {
      bootstrap: false
    });
    return hasProjectPermissions(store.permission, item => !permission.autoResponds(item, directory));
  }));
  const notify = createMemo(() => props.notify && (hasPermissions() || unseenCount() > 0));
  const name = createMemo(() => props.project.name || getFilename(props.project.worktree));

  // Static skeleton (_tmpl$2): root + avatar wrapper.
  const root = document.createElement("div");
  const avatarBox = document.createElement("div");
  avatarBox.className = "size-full rounded-2 overflow-clip";
  root.appendChild(avatarBox);

  // Avatar: the vanilla Avatar reads its props once, so rebuild it whenever a
  // reactive input (name, icon source, colors, badge mask) changes. The avatar
  // is stateless display, so a rebuild matches the original in-place updates.
  createRenderEffect(() => {
    const fallback = name();
    const src = getProjectAvatarSource(props.project.id, props.project.icon);
    const colors = getAvatarColors(props.project.icon?.color);
    const badge = notify();
    avatarBox.replaceChildren(createComponent(Avatar, {
      fallback,
      src,
      ...colors,
      "class": "size-full rounded",
      classList: {
        "badge-mask": badge
      }
    }));
  });

  // Notification dot (the compiled Show + classList effect): present only
  // while notify() is true; exactly one bg-* class, same precedence order.
  let dot = null;
  createRenderEffect(() => {
    if (!notify()) {
      if (dot) {
        dot.remove();
        dot = null;
      }
      return;
    }
    if (!dot) {
      dot = document.createElement("div");
      root.appendChild(dot);
    }
    const bg = hasPermissions() ? "bg-warning-subtle" : hasError() ? "bg-icon-critical-base" : "bg-text-interactive-base";
    dot.className = `absolute top-px right-px size-1.5 rounded-circle z-10 ${bg}`;
  });

  // Root class tracks props.class (compiled className effect, change-guarded).
  let prevClass;
  createRenderEffect(() => {
    const cls = `relative size-8 shrink-0 rounded-2 ${props.class ?? ""}`;
    if (cls !== prevClass) root.className = prevClass = cls;
  });
  return root;
};

const SessionRow = props => {
  const title = () => sessionTitle(props.session.title);
  return createComponent(A, {
    get href() {
      return `/${props.slug}/session/${props.session.id}`;
    },
    get ["class"]() {
      return `d-flex align-items-center gap-2 min-w-0 w-100 text-left focus:outline-none ${props.dense ? "py-0.5" : "py-1"}`;
    },
    get onPointerDown() {
      return props.warmPress;
    },
    get onFocus() {
      return props.warmFocus;
    },
    onClick: () => {
      if (props.sidebarOpened()) return;
      props.clearHoverProjectSoon();
    },
    get children() {
      // Status slot: Show is the same runtime solid-js component the original
      // used (its output is handled by A's own children insertion). Inside,
      // a render effect replaces the compiled Switch/Match with the same
      // first-match-wins order and short-circuit reads.
      const status = createComponent(Show, {
        get when() {
          return props.isWorking() || props.hasPermissions() || props.hasError() || props.unseenCount() > 0;
        },
        get children() {
          const box = document.createElement("div");
          box.className = "shrink-0 size-6 d-flex align-items-center justify-content-center";
          createRenderEffect(() => {
            box.style.setProperty("color", props.tint() ?? "var(--icon-interactive-base)");
          });
          createRenderEffect(() => {
            if (props.isWorking()) {
              box.replaceChildren(createComponent(Spinner, {
                "class": "size-[15px]"
              }));
              return;
            }
            if (props.hasPermissions()) {
              box.replaceChildren(template(`<div class="size-1.5 rounded-circle bg-warning-subtle"></div>`));
              return;
            }
            if (props.hasError()) {
              box.replaceChildren(template(`<div class="size-1.5 rounded-circle bg-text-diff-delete-base"></div>`));
              return;
            }
            if (props.unseenCount() > 0) {
              box.replaceChildren(template(`<div class="size-1.5 rounded-circle bg-text-interactive-base"></div>`));
              return;
            }
            box.replaceChildren();
          });
          return box;
        }
      });
      const label = document.createElement("span");
      label.className = "text-body-emphasis min-w-0 flex-1 truncate";
      createRenderEffect(() => {
        label.textContent = title() ?? "";
      });
      return [status, label];
    }
  });
};

export const SessionItem = props => {
  const params = useParams();
  const layout = useLayout();
  const language = useLanguage();
  const notification = useNotification();
  const permission = usePermission();
  const globalSync = useGlobalSync();
  const unseenCount = createMemo(() => notification.session.unseenCount(props.session.id));
  const hasError = createMemo(() => notification.session.unseenHasError(props.session.id));
  const [sessionStore] = globalSync.child(props.session.directory);
  const hasPermissions = createMemo(() => {
    return !!sessionPermissionRequest(sessionStore.session, sessionStore.permission, props.session.id, item => {
      return !permission.autoResponds(item, props.session.directory);
    });
  });
  const isWorking = createMemo(() => {
    if (hasPermissions()) return false;
    const pending = (sessionStore.message[props.session.id] ?? []).findLast(message => message.role === "assistant" && typeof message.time?.completed !== "number");
    const status = sessionStore.session_status[props.session.id];
    return pending !== undefined || status?.type === "busy" || status?.type === "retry" || status !== undefined && status.type !== "idle";
  });
  const tint = createMemo(() => messageAgentColor(sessionStore.message[props.session.id], sessionStore.agent));
  const tooltip = createMemo(() => props.showTooltip ?? (props.mobile || !props.sidebarExpanded()));
  const currentChild = createMemo(() => {
    if (!props.showChild) return;
    return childSessionOnPath(sessionStore.session, props.session.id, params.id);
  });
  const warm = (span, priority) => {
    const nav = props.navList?.();
    const list = nav?.some(item => item.id === props.session.id && item.directory === props.session.directory) ? nav : props.list;
    props.prefetchSession(props.session, priority);
    const idx = list.findIndex(item => item.id === props.session.id && item.directory === props.session.directory);
    if (idx === -1) return;
    for (let step = 1; step <= span; step++) {
      const next = list[idx + step];
      if (next) props.prefetchSession(next, step === 1 ? "high" : priority);
      const prev = list[idx - step];
      if (prev) props.prefetchSession(prev, step === 1 ? "high" : priority);
    }
  };
  const item = createComponent(SessionRow, {
    get session() {
      return props.session;
    },
    get slug() {
      return props.slug;
    },
    get mobile() {
      return props.mobile;
    },
    get dense() {
      return props.dense;
    },
    tint: tint,
    isWorking: isWorking,
    hasPermissions: hasPermissions,
    hasError: hasError,
    unseenCount: unseenCount,
    get clearHoverProjectSoon() {
      return props.clearHoverProjectSoon;
    },
    get sidebarOpened() {
      return layout.sidebar.opened;
    },
    warmPress: () => warm(2, "high"),
    warmFocus: () => warm(2, "high")
  });

  // Row skeleton (_tmpl$9): group row > flex line > title holder.
  const row = template(`<div class="group/session relative w-full min-w-0 rounded-2 cursor-default pr-3 transition-colors"><div class="d-flex min-w-0 align-items-center gap-1"><div class="min-w-0 flex-1"></div></div></div>`);
  const inner = row.firstChild;
  const holder = inner.firstChild;

  // Tooltip wrap (Show with fallback): the same `item` node moves between the
  // bare and tooltip-wrapped renderings, so its listeners survive. Truthiness
  // guard mirrors Show's condition memo (no re-wrap on same-value runs).
  let wrapped;
  createRenderEffect(() => {
    const wrap = !!tooltip();
    if (wrap === wrapped) return;
    wrapped = wrap;
    if (!wrap) {
      holder.replaceChildren(item);
      return;
    }
    holder.replaceChildren(createComponent(Tooltip, {
      get placement() {
        return props.mobile ? "bottom" : "right";
      },
      get value() {
        return sessionTitle(props.session.title);
      },
      gutter: 10,
      "class": "min-w-0 w-full",
      children: item
    }));
  });

  // Archive affordance (Show when !props.level): built once at component scope
  // so its class effect stays owned by the component, then attached/detached
  // when the level flips. The reveal-on-hover classes mirror the compiled
  // classList effect (static base + mobile-dependent width/opacity).
  const archive = template(`<div class="shrink-0 overflow-hidden transition-[width,opacity]"></div>`);
  archive.appendChild(createComponent(Tooltip, {
    get value() {
      return language.t("common.archive");
    },
    placement: "top",
    get children() {
      return createComponent(IconButton, {
        icon: "archive",
        variant: "ghost",
        "class": "size-6 rounded-2",
        get ["aria-label"]() {
          return language.t("common.archive");
        },
        onClick: event => {
          event.preventDefault();
          event.stopPropagation();
          void props.archiveSession(props.session);
        }
      });
    }
  }));
  createRenderEffect(() => {
    archive.className = "shrink-0 overflow-hidden transition-[width,opacity]" + (props.mobile ? " w-6 opacity-100 pointer-events-auto" : " w-0 opacity-0 pointer-events-none") + " group-hover/session:w-6 group-hover/session:opacity-100 group-hover/session:pointer-events-auto" + " group-focus-within/session:w-6 group-focus-within/session:opacity-100 group-focus-within/session:pointer-events-auto";
  });
  let archiveShown = false;
  createRenderEffect(() => {
    const show = !props.level;
    if (show === archiveShown) return;
    archiveShown = show;
    if (show) inner.appendChild(archive);
    else archive.remove();
  });

  // data-session-id + indentation (compiled attr effect, change-guarded).
  let prevId;
  let prevPad;
  createRenderEffect(() => {
    const id = props.session.id;
    const pad = `${8 + (props.level ?? 0) * 16}px`;
    if (id !== prevId) row.setAttribute("data-session-id", prevId = id);
    if (pad !== prevPad) row.style.setProperty("padding-left", prevPad = pad);
  });

  // Child session subtree (keyed Show): a memo that rebuilds the wrapper for
  // each distinct child value; computations created in a run (the recursive
  // SessionItem) are owned by the memo and disposed on change, like keyed Show.
  const childNode = createMemo(() => {
    const child = currentChild();
    if (!child) return undefined;
    const wrapper = document.createElement("div");
    wrapper.className = "w-full";
    mountSessionItem(wrapper, createComponent(SessionItem, mergeProps(props, {
      session: child,
      get level() {
        return (props.level ?? 0) + 1;
      }
    })));
    return wrapper;
  });
  return [row, childNode];
};

export const NewSessionItem = props => {
  const layout = useLayout();
  const language = useLanguage();
  // Resolved once at setup, exactly like the original (not locale-reactive).
  const label = language.t("command.session.new");
  const tooltip = () => props.mobile || !props.sidebarExpanded();
  const item = createComponent(A, {
    get href() {
      return `/${props.slug}/session`;
    },
    end: true,
    get ["class"]() {
      return `d-flex align-items-center gap-2 min-w-0 w-100 text-left focus:outline-none ${props.dense ? "py-0.5" : "py-1"}`;
    },
    onClick: () => {
      if (layout.sidebar.opened()) return;
      props.clearHoverProjectSoon();
    },
    get children() {
      const iconBox = document.createElement("div");
      iconBox.className = "shrink-0 size-6 d-flex align-items-center justify-content-center";
      iconBox.appendChild(createComponent(Icon, {
        name: "new-session",
        size: "small",
        "class": "text-secondary"
      }));
      const span = document.createElement("span");
      span.className = "text-body-emphasis min-w-0 flex-1 truncate";
      span.textContent = label ?? "";
      return [iconBox, span];
    }
  });
  const root = template(`<div class="group/session relative w-full min-w-0 rounded-2 cursor-default transition-colors pl-2 pr-3"></div>`);
  let wrapped;
  createRenderEffect(() => {
    const wrap = !!tooltip();
    if (wrap === wrapped) return;
    wrapped = wrap;
    if (!wrap) {
      root.replaceChildren(item);
      return;
    }
    root.replaceChildren(createComponent(Tooltip, {
      get placement() {
        return props.mobile ? "bottom" : "right";
      },
      value: label,
      gutter: 10,
      "class": "min-w-0 w-full",
      children: item
    }));
  });
  return root;
};

export const SessionSkeleton = props => {
  const root = template(`<div class="d-flex flex-column gap-1"></div>`);
  // props.count was read once at setup in the original (static For source).
  const count = props.count ?? 4;
  for (let index = 0; index < count; index++) {
    root.appendChild(template(`<div class="h-8 w-full rounded-2 bg-body-tertiary opacity-60 animate-pulse"></div>`));
  }
  return root;
};
