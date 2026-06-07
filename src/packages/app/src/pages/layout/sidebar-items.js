import { template as _$template } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { setStyleProperty as _$setStyleProperty } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { className as _$className } from "solid-js/web";
import { classList as _$classList } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { mergeProps as _$mergeProps } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div>`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div><div class="size-full rounded-2 overflow-clip">`),
  _tmpl$3 = /*#__PURE__*/_$template(`<div class="size-1.5 rounded-circle bg-warning-subtle">`),
  _tmpl$4 = /*#__PURE__*/_$template(`<div class="size-1.5 rounded-circle bg-text-diff-delete-base">`),
  _tmpl$5 = /*#__PURE__*/_$template(`<div class="size-1.5 rounded-circle bg-text-interactive-base">`),
  _tmpl$6 = /*#__PURE__*/_$template(`<div class="shrink-0 size-6 d-flex align-items-center justify-content-center">`),
  _tmpl$7 = /*#__PURE__*/_$template(`<span class="text-body-emphasis min-w-0 flex-1 truncate">`),
  _tmpl$8 = /*#__PURE__*/_$template(`<div class="shrink-0 overflow-hidden transition-[width,opacity]">`),
  _tmpl$9 = /*#__PURE__*/_$template(`<div class="group/session relative w-full min-w-0 rounded-2 cursor-default pr-3 transition-colors"><div class="d-flex min-w-0 align-items-center gap-1"><div class="min-w-0 flex-1">`),
  _tmpl$0 = /*#__PURE__*/_$template(`<div class=w-full>`),
  _tmpl$1 = /*#__PURE__*/_$template(`<div class="group/session relative w-full min-w-0 rounded-2 cursor-default transition-colors pl-2 pr-3">`),
  _tmpl$10 = /*#__PURE__*/_$template(`<div class="d-flex flex-column gap-1">`),
  _tmpl$11 = /*#__PURE__*/_$template(`<div class="h-8 w-full rounded-2 bg-body-tertiary opacity-60 animate-pulse">`);
import { Avatar } from "@/vendor/ui/components/avatar.js";
import { Icon } from "@/bs/icon.js";
import { IconButton } from "@/bs/icon-button.js";
import { Spinner } from "@/bs/spinner.js";
import { Tooltip } from "@/bs/tooltip.js";
import { getFilename } from "core/util/path";
import { A, useParams } from "@solidjs/router";
import { createMemo, For, Match, Show, Switch } from "solid-js";
import { useGlobalSync } from "@/context/global-sync.js";
import { useLanguage } from "@/context/language.js";
import { getAvatarColors, useLayout } from "@/context/layout.js";
import { useNotification } from "@/context/notification.js";
import { usePermission } from "@/context/permission.js";
import { messageAgentColor } from "@/utils/agent.js";
import { sessionTitle } from "@/utils/session-title.js";
import { sessionPermissionRequest } from "../session/composer/session-request-tree.js";
import { childSessionOnPath, hasProjectPermissions } from "./helpers.js";
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
  return (() => {
    var _el$ = _tmpl$2(),
      _el$2 = _el$.firstChild;
    _$insert(_el$2, _$createComponent(Avatar, _$mergeProps({
      get fallback() {
        return name();
      },
      get src() {
        return getProjectAvatarSource(props.project.id, props.project.icon);
      }
    }, () => getAvatarColors(props.project.icon?.color), {
      "class": "size-full rounded",
      get classList() {
        return {
          "badge-mask": notify()
        };
      }
    })));
    _$insert(_el$, _$createComponent(Show, {
      get when() {
        return notify();
      },
      get children() {
        var _el$3 = _tmpl$();
        _$effect(_$p => _$classList(_el$3, {
          "absolute top-px right-px size-1.5 rounded-circle z-10": true,
          "bg-warning-subtle": hasPermissions(),
          "bg-icon-critical-base": !hasPermissions() && hasError(),
          "bg-text-interactive-base": !hasPermissions() && !hasError()
        }, _$p));
        return _el$3;
      }
    }), null);
    _$effect(() => _$className(_el$, `relative size-8 shrink-0 rounded-2 ${props.class ?? ""}`));
    return _el$;
  })();
};
const SessionRow = props => {
  const title = () => sessionTitle(props.session.title);
  return _$createComponent(A, {
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
      return [_$createComponent(Show, {
        get when() {
          return props.isWorking() || props.hasPermissions() || props.hasError() || props.unseenCount() > 0;
        },
        get children() {
          var _el$4 = _tmpl$6();
          _$insert(_el$4, _$createComponent(Switch, {
            get children() {
              return [_$createComponent(Match, {
                get when() {
                  return props.isWorking();
                },
                get children() {
                  return _$createComponent(Spinner, {
                    "class": "size-[15px]"
                  });
                }
              }), _$createComponent(Match, {
                get when() {
                  return props.hasPermissions();
                },
                get children() {
                  return _tmpl$3();
                }
              }), _$createComponent(Match, {
                get when() {
                  return props.hasError();
                },
                get children() {
                  return _tmpl$4();
                }
              }), _$createComponent(Match, {
                get when() {
                  return props.unseenCount() > 0;
                },
                get children() {
                  return _tmpl$5();
                }
              })];
            }
          }));
          _$effect(_$p => _$setStyleProperty(_el$4, "color", props.tint() ?? "var(--icon-interactive-base)"));
          return _el$4;
        }
      }), (() => {
        var _el$8 = _tmpl$7();
        _$insert(_el$8, title);
        return _el$8;
      })()];
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
  const item = _$createComponent(SessionRow, {
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
  return [(() => {
    var _el$9 = _tmpl$9(),
      _el$0 = _el$9.firstChild,
      _el$1 = _el$0.firstChild;
    _$insert(_el$1, _$createComponent(Show, {
      get when() {
        return !tooltip();
      },
      get fallback() {
        return _$createComponent(Tooltip, {
          get placement() {
            return props.mobile ? "bottom" : "right";
          },
          get value() {
            return sessionTitle(props.session.title);
          },
          gutter: 10,
          "class": "min-w-0 w-full",
          children: item
        });
      },
      children: item
    }));
    _$insert(_el$0, _$createComponent(Show, {
      get when() {
        return !props.level;
      },
      get children() {
        var _el$10 = _tmpl$8();
        _$insert(_el$10, _$createComponent(Tooltip, {
          get value() {
            return language.t("common.archive");
          },
          placement: "top",
          get children() {
            return _$createComponent(IconButton, {
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
        _$effect(_$p => _$classList(_el$10, {
          "w-6 opacity-100 pointer-events-auto": !!props.mobile,
          "w-0 opacity-0 pointer-events-none": !props.mobile,
          "group-hover/session:w-6 group-hover/session:opacity-100 group-hover/session:pointer-events-auto": true,
          "group-focus-within/session:w-6 group-focus-within/session:opacity-100 group-focus-within/session:pointer-events-auto": true
        }, _$p));
        return _el$10;
      }
    }), null);
    _$effect(_p$ => {
      var _v$ = props.session.id,
        _v$2 = `${8 + (props.level ?? 0) * 16}px`;
      _v$ !== _p$.e && _$setAttribute(_el$9, "data-session-id", _p$.e = _v$);
      _v$2 !== _p$.t && _$setStyleProperty(_el$9, "padding-left", _p$.t = _v$2);
      return _p$;
    }, {
      e: undefined,
      t: undefined
    });
    return _el$9;
  })(), _$createComponent(Show, {
    get when() {
      return currentChild();
    },
    keyed: true,
    children: child => (() => {
      var _el$11 = _tmpl$0();
      _$insert(_el$11, _$createComponent(SessionItem, _$mergeProps(props, {
        session: child,
        get level() {
          return (props.level ?? 0) + 1;
        }
      })));
      return _el$11;
    })()
  })];
};
export const NewSessionItem = props => {
  const layout = useLayout();
  const language = useLanguage();
  const label = language.t("command.session.new");
  const tooltip = () => props.mobile || !props.sidebarExpanded();
  const item = _$createComponent(A, {
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
      return [(() => {
        var _el$12 = _tmpl$6();
        _$insert(_el$12, _$createComponent(Icon, {
          name: "new-session",
          size: "small",
          "class": "text-secondary"
        }));
        return _el$12;
      })(), (() => {
        var _el$13 = _tmpl$7();
        _$insert(_el$13, label);
        return _el$13;
      })()];
    }
  });
  return (() => {
    var _el$14 = _tmpl$1();
    _$insert(_el$14, _$createComponent(Show, {
      get when() {
        return !tooltip();
      },
      get fallback() {
        return _$createComponent(Tooltip, {
          get placement() {
            return props.mobile ? "bottom" : "right";
          },
          value: label,
          gutter: 10,
          "class": "min-w-0 w-full",
          children: item
        });
      },
      children: item
    }));
    return _el$14;
  })();
};
export const SessionSkeleton = props => {
  const items = Array.from({
    length: props.count ?? 4
  }, (_, index) => index);
  return (() => {
    var _el$15 = _tmpl$10();
    _$insert(_el$15, _$createComponent(For, {
      each: items,
      children: () => _tmpl$11()
    }));
    return _el$15;
  })();
};