import { template as _$template } from "solid-js/web";
import { delegateEvents as _$delegateEvents } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { classList as _$classList } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { use as _$use } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { addEventListener as _$addEventListener } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div class="h-100 w-100 d-flex flex-column align-items-center gap-3 px-3 py-3 overflow-y-auto no-scrollbar">`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div class="d-flex h-100 w-100 min-w-0 overflow-hidden"><div data-component=sidebar-rail class="w-16 shrink-0 bg-body d-flex flex-column align-items-center overflow-hidden"><div class="flex-1 min-h-0 w-100"></div><div class="shrink-0 w-100 pt-3 pb-6 d-flex flex-column align-items-center gap-2"></div></div><div>`),
  _tmpl$3 = /*#__PURE__*/_$template(`<span class="text-secondary small fw-medium">`),
  _tmpl$4 = /*#__PURE__*/_$template(`<div class="d-flex align-items-center gap-2"><span>`);
import { createEffect, createMemo, For, Show } from "solid-js";
import { DragDropProvider, DragDropSensors, DragOverlay, SortableProvider, closestCenter } from "@thisbeyond/solid-dnd";
import { ConstrainDragXAxis } from "@/utils/solid-dnd.js";
import { IconButton } from "@/bs/icon-button.js";
import { Tooltip, TooltipKeybind } from "@/bs/tooltip.js";
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
  return (() => {
    var _el$ = _tmpl$2(),
      _el$2 = _el$.firstChild,
      _el$3 = _el$2.firstChild,
      _el$5 = _el$3.nextSibling,
      _el$6 = _el$2.nextSibling;
    _$addEventListener(_el$2, "mousemove", props.aimMove, true);
    _$insert(_el$3, _$createComponent(DragDropProvider, {
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
        return [_$createComponent(DragDropSensors, {}), _$createComponent(ConstrainDragXAxis, {}), (() => {
          var _el$4 = _tmpl$();
          _$insert(_el$4, _$createComponent(SortableProvider, {
            get ids() {
              return props.projects().map(p => p.worktree);
            },
            get children() {
              return _$createComponent(For, {
                get each() {
                  return props.projects();
                },
                children: project => props.renderProject(project)
              });
            }
          }), null);
          _$insert(_el$4, _$createComponent(Tooltip, {
            get placement() {
              return placement();
            },
            get value() {
              return (() => {
                var _el$7 = _tmpl$4(),
                  _el$8 = _el$7.firstChild;
                _$insert(_el$8, () => props.openProjectLabel);
                _$insert(_el$7, _$createComponent(Show, {
                  get when() {
                    return _$memo(() => !!!props.mobile)() && !!props.openProjectKeybind();
                  },
                  get children() {
                    var _el$9 = _tmpl$3();
                    _$insert(_el$9, () => props.openProjectKeybind());
                    return _el$9;
                  }
                }), null);
                return _el$7;
              })();
            },
            get children() {
              return _$createComponent(IconButton, {
                icon: "plus",
                variant: "ghost",
                size: "large",
                get onClick() {
                  return props.onOpenProject;
                },
                get ["aria-label"]() {
                  return _$memo(() => typeof props.openProjectLabel === "string")() ? props.openProjectLabel : undefined;
                }
              });
            }
          }), null);
          return _el$4;
        })(), _$createComponent(DragOverlay, {
          get children() {
            return props.renderProjectOverlay();
          }
        })];
      }
    }));
    _$insert(_el$5, _$createComponent(TooltipKeybind, {
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
        return _$createComponent(IconButton, {
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
    _$insert(_el$5, _$createComponent(Tooltip, {
      get placement() {
        return placement();
      },
      get value() {
        return props.helpLabel();
      },
      get children() {
        return _$createComponent(IconButton, {
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
    _$use(el => {
      panel = el;
    }, _el$6);
    _$insert(_el$6, () => props.renderPanel());
    _$effect(_p$ => {
      var _v$ = {
          "flex-1 d-flex h-100 min-h-0 min-w-0 overflow-hidden": true,
          "pointer-events-none": !expanded()
        },
        _v$2 = !expanded();
      _p$.e = _$classList(_el$6, _v$, _p$.e);
      _v$2 !== _p$.t && _$setAttribute(_el$6, "aria-hidden", _p$.t = _v$2);
      return _p$;
    }, {
      e: undefined,
      t: undefined
    });
    return _el$;
  })();
};
_$delegateEvents(["mousemove"]);