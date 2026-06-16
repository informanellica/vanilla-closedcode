/** @file Application titlebar: window drag/maximize regions, OS-specific controls, sidebar/new-session toggles, back/forward history nav, the open-folder label, and the dev/beta channel badge. */
import { createComponent, createEffect, createMemo, createRenderEffect, untrack } from "../lib/reactivity.js";
import { createStore } from "../lib/store.js";
import { useLocation, useNavigate, useParams } from "../lib/router/index.js";
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
import { base64Decode } from "core/util/encode";
const tauriApi = () => window.__TAURI__;
const currentDesktopWindow = () => tauriApi()?.window?.getCurrentWindow?.();
const currentThemeWindow = () => tauriApi()?.webviewWindow?.getCurrentWebviewWindow?.();

// Build a detached element from static HTML (no user/translated strings are
// ever interpolated into these literals).
/**
 * Build a detached DOM element from a static HTML string.
 * @param {string} html - The HTML markup (no untrusted interpolation).
 * @returns {HTMLElement} The first element child of the parsed markup.
 */
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html.trim();
  return wrapper.firstElementChild;
}

// The bs Button/Icon primitives read their `icon`/`name` props once at
// creation, so a reactive getter passed straight through freezes on its first
// value. Rebuild the icon element whenever the reactive name changes instead.
// The effect is owned by whichever scope evaluates the surrounding children
// getter (the component owner or a slot render effect), so it is disposed
// together with the button it decorates.
/**
 * Wrap an Icon in a contents holder that rebuilds the icon whenever the reactive name accessor changes,
 * working around bs Icon/Button reading the icon name only once at creation.
 * @param {Function} name - A zero-argument accessor returning the current icon name.
 * @returns {HTMLElement} A display:contents span that re-renders the icon reactively.
 */
function reactiveIcon(name) {
  const holder = document.createElement("span");
  holder.style.display = "contents";
  createRenderEffect(() => {
    holder.replaceChildren(createComponent(Icon, { name: name(), size: "small" }));
  });
  return holder;
}

// Toggle whitespace-separated class groups. Falsy groups are removed before
// truthy ones are added, matching solid's classList semantics for groups that
// share tokens (e.g. "duration-180 ease-out" vs "duration-180 ease-in").
/**
 * Toggle whitespace-separated class-token groups on an element. Falsy groups are removed first, then
 * truthy groups are added, so groups sharing tokens resolve correctly.
 * @param {HTMLElement} el - The element to mutate.
 * @param {Array} groups - An array of [tokens, on] pairs where tokens is a space-separated class string and on is a boolean.
 * @returns {void}
 */
function toggleClasses(el, groups) {
  for (const [tokens, on] of groups) {
    if (on) continue;
    for (const token of tokens.split(/\s+/)) el.classList.remove(token);
  }
  for (const [tokens, on] of groups) {
    if (!on) continue;
    for (const token of tokens.split(/\s+/)) el.classList.add(token);
  }
}

/**
 * Application titlebar component. Renders the drag region and maximize-on-doubleclick behavior, OS-specific
 * window controls (macOS traffic-light spacer, Windows decorum controls), the sidebar/new-session toggles,
 * back/forward history navigation, the centered open-folder label, and the dev/beta channel badge. Also
 * registers the goBack/goForward commands and keeps the native window theme in sync.
 * @returns {HTMLElement} The titlebar header element.
 */
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
  // Truthiness gates, mirroring Show's non-keyed `when` semantics: the gated
  // content rebuilds only when the condition flips, not on every dir change.
  const hasDir = createMemo(() => !!params.dir);
  const showHistoryNav = createMemo(() => !!(hasProjects() && nav()));
  /**
   * Navigate one step back through the internal history stack.
   * @returns {void}
   */
  const back = () => {
    const next = backPath(history);
    if (!next) return;
    setHistory(next.state);
    navigate(next.to);
  };
  /**
   * Navigate one step forward through the internal history stack.
   * @returns {void}
   */
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
  /**
   * Get the current Tauri desktop window, or undefined when not running on desktop.
   * @returns {Object} The desktop window handle, or undefined.
   */
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
  /**
   * Whether an event target is an interactive control (so drag/maximize should be suppressed on it).
   * @param {EventTarget} target - The event target to test.
   * @returns {boolean} True when the target is or is inside an interactive element.
   */
  const interactive = target => {
    if (!(target instanceof Element)) return false;
    const selector = "button, a, input, textarea, select, option, [role='button'], [role='menuitem'], [contenteditable='true'], [contenteditable='']";
    return !!target.closest(selector);
  };
  /**
   * Start native window dragging on a primary-button mousedown over a non-interactive titlebar region.
   * @param {MouseEvent} e - The mousedown event.
   * @returns {void}
   */
  const drag = e => {
    if (platform.platform !== "desktop") return;
    if (e.buttons !== 1) return;
    if (interactive(e.target)) return;
    const win = getWin();
    if (!win?.startDragging) return;
    e.preventDefault();
    void win.startDragging().catch(() => undefined);
  };
  /**
   * Toggle window maximize on double-click over a non-interactive titlebar region.
   * @param {MouseEvent} e - The dblclick event.
   * @returns {void}
   */
  const maximize = e => {
    if (platform.platform !== "desktop") return;
    if (interactive(e.target)) return;
    if (e.target instanceof Element && e.target.closest("[data-tauri-decorum-tb]")) return;
    const win = getWin();
    if (!win?.toggleMaximize) return;
    e.preventDefault();
    void win.toggleMaximize().catch(() => undefined);
  };

  // The hamburger button rendered on both the mac and non-mac sides.
  /**
   * Build the mobile hamburger menu button that toggles the mobile sidebar.
   * @returns {Node} The IconButton component instance.
   */
  const mobileMenuButton = () => createComponent(IconButton, {
    icon: "menu",
    variant: "ghost",
    class: "titlebar-icon rounded-2",
    get onClick() {
      return layout.mobileSidebar.toggle;
    },
    get ["aria-label"]() {
      return language.t("sidebar.menu.toggle");
    },
    get ["aria-expanded"]() {
      return layout.mobileSidebar.opened();
    }
  });

  // New-session button, shown only while a project dir is open. The wrapper
  // fades out (and goes inert) while the sidebar is open.
  /**
   * Build the new-session button (with tooltip + keybind) that navigates to a new session for the open dir.
   * The wrapper fades out and goes inert while the sidebar is open.
   * @returns {HTMLElement} The new-session wrapper element.
   */
  const buildNewSession = () => {
    const wrap = template(`<div class="d-flex align-items-center shrink-0 w-8 mr-1"><div class="transition-opacity"></div></div>`);
    const fade = wrap.firstElementChild;
    fade.appendChild(createComponent(TooltipKeybind, {
      placement: "bottom",
      get title() {
        return language.t("command.session.new");
      },
      get keybind() {
        return command.keybind("session.new");
      },
      openDelay: 2000,
      get children() {
        return createComponent(Button, {
          variant: "ghost",
          // bs Button reads `icon` once, so the creating() flip is delivered
          // through children that track the name themselves.
          get children() {
            return reactiveIcon(() => creating() ? "new-session-active" : "new-session");
          },
          class: "titlebar-icon w-8 h-6 p-0 box-border",
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
    createRenderEffect(() => {
      const opened = layout.sidebar.opened();
      if (opened) wrap.setAttribute("aria-hidden", "true");
      else wrap.removeAttribute("aria-hidden");
      toggleClasses(fade, [["opacity-100 duration-120 ease-out", !opened], ["opacity-0 duration-120 ease-in delay-0 pointer-events-none", opened]]);
    });
    return wrap;
  };

  // Back/forward history buttons, shown once at least one project exists.
  /**
   * Build the back/forward history navigation buttons (each with a tooltip, disabled when unavailable).
   * @returns {HTMLElement} The history-nav wrapper element.
   */
  const buildHistoryNav = () => {
    const wrap = template(`<div class="d-flex align-items-center gap-0 transition-transform"></div>`);
    wrap.appendChild(createComponent(Tooltip, {
      placement: "bottom",
      get value() {
        return language.t("common.goBack");
      },
      openDelay: 2000,
      get children() {
        return createComponent(Button, {
          variant: "ghost",
          icon: "chevron-left",
          class: "titlebar-icon w-6 h-6 p-0 box-border",
          get disabled() {
            return !canBack();
          },
          onClick: back,
          get ["aria-label"]() {
            return language.t("common.goBack");
          }
        });
      }
    }));
    wrap.appendChild(createComponent(Tooltip, {
      placement: "bottom",
      get value() {
        return language.t("common.goForward");
      },
      openDelay: 2000,
      get children() {
        return createComponent(Button, {
          variant: "ghost",
          icon: "chevron-right",
          class: "titlebar-icon w-6 h-6 p-0 box-border",
          get disabled() {
            return !canForward();
          },
          onClick: forward,
          get ["aria-label"]() {
            return language.t("common.goForward");
          }
        });
      }
    }));
    return wrap;
  };

  // Static skeleton. The display:contents slots are filled by the render
  // effects below; #closedcode-titlebar-left/center/right are portal mounts
  // used by other components (e.g. session-header) and must keep their ids.
  const root = template(`
    <header class="h-10 shrink-0 bg-body relative grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center" data-tauri-drag-region>
      <div class="d-flex align-items-center min-w-0" data-slot="left">
        <div style="display: contents" data-slot="mac-controls"></div>
        <div style="display: contents" data-slot="menu-button"></div>
        <div class="d-flex align-items-center gap-1 shrink-0" data-slot="left-group">
          <div class="hidden xl:flex align-items-center shrink-0" data-slot="toggle-row">
            <div style="display: contents" data-slot="new-session"></div>
            <div class="d-flex align-items-center shrink-0" data-slot="nav-row">
              <div style="display: contents" data-slot="history-nav"></div>
              <div id="closedcode-titlebar-left" class="d-flex align-items-center gap-3 min-w-0 px-2"></div>
              <div style="display: contents" data-slot="channel-badge"></div>
            </div>
          </div>
        </div>
      </div>
      <div class="min-w-0 d-flex align-items-center justify-content-center pointer-events-none">
        <div id="closedcode-titlebar-center" class="pointer-events-auto min-w-0 d-flex justify-content-center w-fit max-w-full">
          <div style="display: contents" data-slot="folder"></div>
        </div>
      </div>
      <div class="d-flex align-items-center min-w-0 justify-content-end" data-tauri-drag-region data-slot="right">
        <div id="closedcode-titlebar-right" class="d-flex align-items-center gap-1 shrink-0 justify-content-end"></div>
        <div style="display: contents" data-slot="windows-controls"></div>
      </div>
    </header>`);
  const leftEl = root.querySelector('[data-slot="left"]');
  const macSlot = root.querySelector('[data-slot="mac-controls"]');
  const menuSlot = root.querySelector('[data-slot="menu-button"]');
  const leftGroup = root.querySelector('[data-slot="left-group"]');
  const toggleRow = root.querySelector('[data-slot="toggle-row"]');
  const newSessionSlot = root.querySelector('[data-slot="new-session"]');
  const navRow = root.querySelector('[data-slot="nav-row"]');
  const historyNavSlot = root.querySelector('[data-slot="history-nav"]');
  const badgeSlot = root.querySelector('[data-slot="channel-badge"]');
  const folderSlot = root.querySelector('[data-slot="folder"]');
  const rightEl = root.querySelector('[data-slot="right"]');
  const windowsSlot = root.querySelector('[data-slot="windows-controls"]');

  root.addEventListener("dblclick", maximize);
  root.addEventListener("mousedown", drag);
  rightEl.addEventListener("mousedown", drag);

  // Show which folder is open, centered in the titlebar. Session routes carry
  // the project directory base64-encoded in the :dir route param; home has no
  // dir, so nothing is shown there.
  createRenderEffect(() => {
    const show = hasDir();
    untrack(() => {
      if (!show) {
        folderSlot.replaceChildren();
        return;
      }
      const folder = document.createElement("div");
      folder.className = "small fw-normal text-secondary text-truncate px-2";
      const decoded = () => {
        try {
          return base64Decode(params.dir);
        } catch {
          return "";
        }
      };
      createRenderEffect(() => {
        folder.textContent = decoded();
      });
      createRenderEffect(() => folder.setAttribute("title", decoded()));
      folderSlot.replaceChildren(folder);
    });
  });

  // macOS: traffic-light spacer (zoom-compensated) + mobile menu button.
  createRenderEffect(() => {
    const isMac = mac();
    untrack(() => {
      if (!isMac) {
        macSlot.replaceChildren();
        return;
      }
      const spacer = template(`<div class="h-full shrink-0"></div>`);
      createRenderEffect(() => spacer.style.setProperty("width", `${72 / zoom()}px`));
      const wrap = template(`<div class="xl:hidden w-10 shrink-0 d-flex align-items-center justify-content-center"></div>`);
      wrap.appendChild(mobileMenuButton());
      macSlot.replaceChildren(spacer, wrap);
    });
  });

  // Non-mac: mobile menu button only.
  createRenderEffect(() => {
    const isMac = mac();
    untrack(() => {
      if (isMac) {
        menuSlot.replaceChildren();
        return;
      }
      const wrap = template(`<div class="xl:hidden w-[48px] shrink-0 d-flex align-items-center justify-content-center"></div>`);
      wrap.appendChild(mobileMenuButton());
      menuSlot.replaceChildren(wrap);
    });
  });

  // Sidebar toggle (always present), placed before the xl-only toggle row.
  leftGroup.insertBefore(createComponent(TooltipKeybind, {
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
      return createComponent(Button, {
        variant: "ghost",
        class: "group/sidebar-toggle titlebar-icon w-8 h-6 p-0 box-border",
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
          // bs Icon reads `name` once, so the opened() flip is delivered by
          // rebuilding the icon element reactively.
          return reactiveIcon(() => layout.sidebar.opened() ? "sidebar-active" : "sidebar");
        }
      });
    }
  }), toggleRow);

  createRenderEffect(() => {
    const show = hasDir();
    untrack(() => {
      if (!show) {
        newSessionSlot.replaceChildren();
        return;
      }
      newSessionSlot.replaceChildren(buildNewSession());
    });
  });

  createRenderEffect(() => {
    const show = showHistoryNav();
    untrack(() => {
      if (!show) {
        historyNavSlot.replaceChildren();
        return;
      }
      historyNavSlot.replaceChildren(buildHistoryNav());
    });
  });

  // DEV/BETA channel badge next to the left portal mount. The channel string
  // goes through textContent, never into the HTML literal.
  createRenderEffect(() => {
    const channel = env("VITE_CLOSEDCODE_CHANNEL");
    if (!["beta", "dev"].includes(channel)) {
      badgeSlot.replaceChildren();
      return;
    }
    const badge = template(`<div class="bg-primary text-[#FFF] font-medium px-2 rounded-1 uppercase font-mono"></div>`);
    badge.textContent = channel.toUpperCase();
    badgeSlot.replaceChildren(badge);
  });

  // Windows: spacer (web only, no tauri) + native decorum controls mount.
  createRenderEffect(() => {
    const isWindows = windows();
    untrack(() => {
      if (!isWindows) {
        windowsSlot.replaceChildren();
        return;
      }
      const nodes = [];
      if (!tauriApi()) nodes.push(template(`<div class="w-36 shrink-0"></div>`));
      nodes.push(template(`<div data-tauri-decorum-tb class="d-flex flex-row"></div>`));
      windowsSlot.replaceChildren(...nodes);
    });
  });

  // Dynamic style/class bindings on the skeleton itself.
  createRenderEffect(() => {
    const value = minHeight();
    if (value == null) root.style.removeProperty("min-height");
    else root.style.setProperty("min-height", value);
  });
  createRenderEffect(() => toggleClasses(leftEl, [["pl-2", !mac()]]));
  createRenderEffect(() => {
    const opened = layout.sidebar.opened();
    toggleClasses(navRow, [["-translate-x-[36px]", opened && !!params.dir], ["duration-180 ease-out", !opened], ["duration-180 ease-in", opened]]);
  });
  createRenderEffect(() => toggleClasses(rightEl, [["pr-2", !windows()]]));

  return root;
}
