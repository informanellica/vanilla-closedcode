import { template as _$template } from "solid-js/web";
import { delegateEvents as _$delegateEvents } from "solid-js/web";
import { classList as _$classList } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { setStyleProperty as _$setStyleProperty } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div class="h-full shrink-0">`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div class="xl:hidden w-10 shrink-0 d-flex align-items-center justify-content-center">`),
  _tmpl$3 = /*#__PURE__*/_$template(`<div class="xl:hidden w-[48px] shrink-0 d-flex align-items-center justify-content-center">`),
  _tmpl$4 = /*#__PURE__*/_$template(`<div class="d-flex align-items-center shrink-0 w-8 mr-1"><div class=transition-opacity>`),
  _tmpl$5 = /*#__PURE__*/_$template(`<div class="d-flex align-items-center gap-0 transition-transform">`),
  _tmpl$6 = /*#__PURE__*/_$template(`<div data-tauri-decorum-tb class="d-flex flex-row">`),
  _tmpl$7 = /*#__PURE__*/_$template(`<header class="h-10 shrink-0 bg-body relative grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center"data-tauri-drag-region><div><div class="d-flex align-items-center gap-1 shrink-0"><div class="hidden xl:flex align-items-center shrink-0"><div class="d-flex align-items-center shrink-0"><div id=closedcode-titlebar-left class="d-flex align-items-center gap-3 min-w-0 px-2"></div></div></div></div></div><div class="min-w-0 d-flex align-items-center justify-content-center pointer-events-none"><div id=closedcode-titlebar-center class="pointer-events-auto min-w-0 d-flex justify-content-center w-fit max-w-full"></div></div><div data-tauri-drag-region><div id=closedcode-titlebar-right class="d-flex align-items-center gap-1 shrink-0 justify-content-end">`),
  _tmpl$8 = /*#__PURE__*/_$template(`<div class="bg-primary text-[#FFF] font-medium px-2 rounded-1 uppercase font-mono">`),
  _tmpl$9 = /*#__PURE__*/_$template(`<div class="w-36 shrink-0">`);
import { createEffect, createMemo, Show, untrack } from "solid-js";
import { createStore } from "solid-js/store";
import { useLocation, useNavigate, useParams } from "@solidjs/router";
import { IconButton } from "@/bs/icon-button.js";
import { Icon } from "@/bs/icon.js";
import { Button } from "@/bs/button.js";
import { Tooltip, TooltipKeybind } from "@/bs/tooltip.js";
import { env } from "@/lib/env.js";
import { useTheme } from "@/lib/theme.js";
import { useLayout } from "@/context/layout.js";
import { usePlatform } from "@/context/platform.js";
import { useCommand } from "@/context/command.js";
import { useLanguage } from "@/context/language.js";
import { useSettings } from "@/context/settings.js";
import { applyPath, backPath, forwardPath } from "./titlebar-history.js";
const tauriApi = () => window.__TAURI__;
const currentDesktopWindow = () => tauriApi()?.window?.getCurrentWindow?.();
const currentThemeWindow = () => tauriApi()?.webviewWindow?.getCurrentWebviewWindow?.();
export function Titlebar() {
  const layout = useLayout();
  const platform = usePlatform();
  const command = useCommand();
  const language = useLanguage();
  const settings = useSettings();
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const mac = createMemo(() => platform.platform === "desktop" && platform.os === "macos");
  const windows = createMemo(() => platform.platform === "desktop" && platform.os === "windows");
  const web = createMemo(() => platform.platform === "web");
  const zoom = () => platform.webviewZoom?.() ?? 1;
  const minHeight = () => mac() ? `${40 / zoom()}px` : undefined;
  const [history, setHistory] = createStore({
    stack: [],
    index: 0,
    action: undefined
  });
  const path = () => `${location.pathname}${location.search}${location.hash}`;
  const creating = createMemo(() => {
    if (!params.dir) return false;
    if (params.id) return false;
    const parts = location.pathname.replace(/\/+$/, "").split("/");
    return parts.at(-1) === "session";
  });
  createEffect(() => {
    const current = path();
    untrack(() => {
      const next = applyPath(history, current);
      if (next === history) return;
      setHistory(next);
    });
  });
  const canBack = createMemo(() => history.index > 0);
  const canForward = createMemo(() => history.index < history.stack.length - 1);
  const hasProjects = createMemo(() => layout.projects.list().length > 0);
  const nav = createMemo(() => env("VITE_CLOSEDCODE_CHANNEL") !== "beta" || settings.general.showNavigation());
  const back = () => {
    const next = backPath(history);
    if (!next) return;
    setHistory(next.state);
    navigate(next.to);
  };
  const forward = () => {
    const next = forwardPath(history);
    if (!next) return;
    setHistory(next.state);
    navigate(next.to);
  };
  command.register(() => [{
    id: "common.goBack",
    title: language.t("common.goBack"),
    category: language.t("command.category.view"),
    keybind: "mod+[",
    onSelect: back
  }, {
    id: "common.goForward",
    title: language.t("common.goForward"),
    category: language.t("command.category.view"),
    keybind: "mod+]",
    onSelect: forward
  }]);
  const getWin = () => {
    if (platform.platform !== "desktop") return;
    return currentDesktopWindow();
  };
  createEffect(() => {
    if (platform.platform !== "desktop") return;
    const scheme = theme.colorScheme();
    const value = scheme === "system" ? null : scheme;
    const win = currentThemeWindow();
    if (!win?.setTheme) return;
    void win.setTheme(value).catch(() => undefined);
  });
  const interactive = target => {
    if (!(target instanceof Element)) return false;
    const selector = "button, a, input, textarea, select, option, [role='button'], [role='menuitem'], [contenteditable='true'], [contenteditable='']";
    return !!target.closest(selector);
  };
  const drag = e => {
    if (platform.platform !== "desktop") return;
    if (e.buttons !== 1) return;
    if (interactive(e.target)) return;
    const win = getWin();
    if (!win?.startDragging) return;
    e.preventDefault();
    void win.startDragging().catch(() => undefined);
  };
  const maximize = e => {
    if (platform.platform !== "desktop") return;
    if (interactive(e.target)) return;
    if (e.target instanceof Element && e.target.closest("[data-tauri-decorum-tb]")) return;
    const win = getWin();
    if (!win?.toggleMaximize) return;
    e.preventDefault();
    void win.toggleMaximize().catch(() => undefined);
  };
  return (() => {
    var _el$ = _tmpl$7(),
      _el$2 = _el$.firstChild,
      _el$6 = _el$2.firstChild,
      _el$7 = _el$6.firstChild,
      _el$0 = _el$7.firstChild,
      _el$10 = _el$0.firstChild,
      _el$11 = _el$2.nextSibling,
      _el$12 = _el$11.nextSibling,
      _el$13 = _el$12.firstChild;
    _el$.$$dblclick = maximize;
    _el$.$$mousedown = drag;
    _$insert(_el$2, _$createComponent(Show, {
      get when() {
        return mac();
      },
      get children() {
        return [(() => {
          var _el$3 = _tmpl$();
          _$effect(_$p => _$setStyleProperty(_el$3, "width", `${72 / zoom()}px`));
          return _el$3;
        })(), (() => {
          var _el$4 = _tmpl$2();
          _$insert(_el$4, _$createComponent(IconButton, {
            icon: "menu",
            variant: "ghost",
            "class": "titlebar-icon rounded-2",
            get onClick() {
              return layout.mobileSidebar.toggle;
            },
            get ["aria-label"]() {
              return language.t("sidebar.menu.toggle");
            },
            get ["aria-expanded"]() {
              return layout.mobileSidebar.opened();
            }
          }));
          return _el$4;
        })()];
      }
    }), _el$6);
    _$insert(_el$2, _$createComponent(Show, {
      get when() {
        return !mac();
      },
      get children() {
        var _el$5 = _tmpl$3();
        _$insert(_el$5, _$createComponent(IconButton, {
          icon: "menu",
          variant: "ghost",
          "class": "titlebar-icon rounded-2",
          get onClick() {
            return layout.mobileSidebar.toggle;
          },
          get ["aria-label"]() {
            return language.t("sidebar.menu.toggle");
          },
          get ["aria-expanded"]() {
            return layout.mobileSidebar.opened();
          }
        }));
        return _el$5;
      }
    }), _el$6);
    _$insert(_el$6, _$createComponent(TooltipKeybind, {
      get ["class"]() {
        return web() ? "d-none xl:flex shrink-0 ml-14" : "d-none xl:flex shrink-0 ml-2";
      },
      placement: "bottom",
      get title() {
        return language.t("command.sidebar.toggle");
      },
      get keybind() {
        return command.keybind("sidebar.toggle");
      },
      get children() {
        return _$createComponent(Button, {
          variant: "ghost",
          "class": "group/sidebar-toggle titlebar-icon w-8 h-6 p-0 box-border",
          get onClick() {
            return layout.sidebar.toggle;
          },
          get ["aria-label"]() {
            return language.t("command.sidebar.toggle");
          },
          get ["aria-expanded"]() {
            return layout.sidebar.opened();
          },
          get children() {
            return _$createComponent(Icon, {
              size: "small",
              get name() {
                return layout.sidebar.opened() ? "sidebar-active" : "sidebar";
              }
            });
          }
        });
      }
    }), _el$7);
    _$insert(_el$7, _$createComponent(Show, {
      get when() {
        return params.dir;
      },
      get children() {
        var _el$8 = _tmpl$4(),
          _el$9 = _el$8.firstChild;
        _$insert(_el$9, _$createComponent(TooltipKeybind, {
          placement: "bottom",
          get title() {
            return language.t("command.session.new");
          },
          get keybind() {
            return command.keybind("session.new");
          },
          openDelay: 2000,
          get children() {
            return _$createComponent(Button, {
              variant: "ghost",
              get icon() {
                return creating() ? "new-session-active" : "new-session";
              },
              "class": "titlebar-icon w-8 h-6 p-0 box-border",
              get disabled() {
                return layout.sidebar.opened();
              },
              get tabIndex() {
                return layout.sidebar.opened() ? -1 : undefined;
              },
              onClick: () => {
                if (!params.dir) return;
                navigate(`/${params.dir}/session`);
              },
              get ["aria-label"]() {
                return language.t("command.session.new");
              },
              get ["aria-current"]() {
                return creating() ? "page" : undefined;
              }
            });
          }
        }));
        _$effect(_p$ => {
          var _v$ = layout.sidebar.opened() ? "true" : undefined,
            _v$2 = {
              "opacity-100 duration-120 ease-out": !layout.sidebar.opened(),
              "opacity-0 duration-120 ease-in delay-0 pointer-events-none": layout.sidebar.opened()
            };
          _v$ !== _p$.e && _$setAttribute(_el$8, "aria-hidden", _p$.e = _v$);
          _p$.t = _$classList(_el$9, _v$2, _p$.t);
          return _p$;
        }, {
          e: undefined,
          t: undefined
        });
        return _el$8;
      }
    }), _el$0);
    _$insert(_el$0, _$createComponent(Show, {
      get when() {
        return _$memo(() => !!hasProjects())() && nav();
      },
      get children() {
        var _el$1 = _tmpl$5();
        _$insert(_el$1, _$createComponent(Tooltip, {
          placement: "bottom",
          get value() {
            return language.t("common.goBack");
          },
          openDelay: 2000,
          get children() {
            return _$createComponent(Button, {
              variant: "ghost",
              icon: "chevron-left",
              "class": "titlebar-icon w-6 h-6 p-0 box-border",
              get disabled() {
                return !canBack();
              },
              onClick: back,
              get ["aria-label"]() {
                return language.t("common.goBack");
              }
            });
          }
        }), null);
        _$insert(_el$1, _$createComponent(Tooltip, {
          placement: "bottom",
          get value() {
            return language.t("common.goForward");
          },
          openDelay: 2000,
          get children() {
            return _$createComponent(Button, {
              variant: "ghost",
              icon: "chevron-right",
              "class": "titlebar-icon w-6 h-6 p-0 box-border",
              get disabled() {
                return !canForward();
              },
              onClick: forward,
              get ["aria-label"]() {
                return language.t("common.goForward");
              }
            });
          }
        }), null);
        return _el$1;
      }
    }), _el$10);
    _$insert(_el$0, (() => {
      var _c$ = _$memo(() => !!["beta", "dev"].includes(env("VITE_CLOSEDCODE_CHANNEL")));
      return () => _c$() && (() => {
        var _el$15 = _tmpl$8();
        _$insert(_el$15, () => env("VITE_CLOSEDCODE_CHANNEL").toUpperCase());
        return _el$15;
      })();
    })(), null);
    _el$12.$$mousedown = drag;
    _$insert(_el$12, _$createComponent(Show, {
      get when() {
        return windows();
      },
      get children() {
        return [_$memo(() => _$memo(() => !!!tauriApi())() && _tmpl$9()), _tmpl$6()];
      }
    }), null);
    _$effect(_p$ => {
      var _v$3 = minHeight(),
        _v$4 = {
          "d-flex align-items-center min-w-0": true,
          "pl-2": !mac()
        },
        _v$5 = {
          "-translate-x-[36px]": layout.sidebar.opened() && !!params.dir,
          "duration-180 ease-out": !layout.sidebar.opened(),
          "duration-180 ease-in": layout.sidebar.opened()
        },
        _v$6 = {
          "d-flex align-items-center min-w-0 justify-content-end": true,
          "pr-2": !windows()
        };
      _v$3 !== _p$.e && _$setStyleProperty(_el$, "min-height", _p$.e = _v$3);
      _p$.t = _$classList(_el$2, _v$4, _p$.t);
      _p$.a = _$classList(_el$0, _v$5, _p$.a);
      _p$.o = _$classList(_el$12, _v$6, _p$.o);
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
_$delegateEvents(["mousedown", "dblclick"]);