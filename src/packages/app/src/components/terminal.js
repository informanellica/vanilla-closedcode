import { withAlpha, useTheme } from "@/lib/theme.js";
import { showToast } from "@/lib/toast.js";
import { env } from "@/lib/env.js";
import { createEffect, createMemo, createRenderEffect, mergeProps, onCleanup, onMount, splitProps } from "../lib/reactivity.js";
import { SerializeAddon } from "@/addons/serialize.js";
import { matchKeybind, parseKeybind } from "@/context/command.js";
import { useLanguage } from "@/context/language.js";
import { usePlatform } from "@/context/platform.js";
import { terminalFontFamily, useSettings } from "@/context/settings.js";
import { useServerController } from "@/controllers/server.js";
import { disposeIfDisposable, getHoveredLinkText, setOptionIfSupported } from "@/utils/runtime-adapters.js";
import { terminalWriter } from "@/utils/terminal-writer.js";

/** @file Terminal component: a ghostty/xterm-backed PTY view wired to a server WebSocket with reconnect, fit and buffer persistence. */

const TOGGLE_TERMINAL_ID = "terminal.toggle";
const DEFAULT_TOGGLE_TERMINAL_KEYBIND = "ctrl+`";
let shared;
/**
 * Lazily import and load the ghostty-web module + WASM once, caching the result.
 * @returns {Promise<Object>} Resolves to {mod, ghostty}; the cache is cleared on failure so it can retry.
 */
const loadGhostty = () => {
  if (shared) return shared;
  shared = import("ghostty-web").then(async mod => ({
    mod,
    ghostty: await mod.Ghostty.load()
  })).catch(err => {
    shared = undefined;
    throw err;
  });
  return shared;
};
// Fixed xterm.js palettes. The theme system no longer exposes per-theme color
// tokens (theme.themes() is an empty stub), so we ship two sensible palettes —
// one for each Bootstrap color mode ("light" | "dark") — and pick based on the
// resolved mode reported by useTheme().mode().
const TERMINAL_PALETTES = {
  light: {
    background: "#ffffff",
    foreground: "#212529",
    cursor: "#212529",
    cursorAccent: "#ffffff",
    selectionBackground: withAlpha("#212529", 0.2),
    // ANSI 0-7 (normal)
    black: "#21222c",
    red: "#c01c28",
    green: "#26a269",
    yellow: "#a2734c",
    blue: "#2563eb",
    magenta: "#a347ba",
    cyan: "#0e7490",
    white: "#cfcfcf",
    // ANSI 8-15 (bright)
    brightBlack: "#5e5c64",
    brightRed: "#e01b24",
    brightGreen: "#2ec27e",
    brightYellow: "#c88a3f",
    brightBlue: "#3b82f6",
    brightMagenta: "#c061cb",
    brightCyan: "#0891b2",
    brightWhite: "#ffffff"
  },
  dark: {
    background: "#212529",
    foreground: "#dee2e6",
    cursor: "#dee2e6",
    cursorAccent: "#212529",
    selectionBackground: withAlpha("#dee2e6", 0.25),
    // ANSI 0-7 (normal)
    black: "#343a40",
    red: "#ff5555",
    green: "#50fa7b",
    yellow: "#f1fa8c",
    blue: "#6ea8fe",
    magenta: "#ff79c6",
    cyan: "#8be9fd",
    white: "#f8f8f2",
    // ANSI 8-15 (bright)
    brightBlack: "#6c757d",
    brightRed: "#ff6e6e",
    brightGreen: "#69ff94",
    brightYellow: "#ffffa5",
    brightBlue: "#8bb9fe",
    brightMagenta: "#ff92df",
    brightCyan: "#a4ffff",
    brightWhite: "#ffffff"
  }
};
/**
 * Log terminal debug output, only in DEV builds.
 * @param {...*} values - Values to log.
 * @returns {void}
 */
const debugTerminal = (...values) => {
  if (!env("DEV")) return;
  console.debug("[terminal]", ...values);
};
/**
 * Safely read an error's `name` property as a string.
 * @param {*} err - The error-like value.
 * @returns {string} The error name, or undefined when absent/non-string.
 */
const errorName = err => {
  if (!err || typeof err !== "object") return;
  if (!("name" in err)) return;
  const errorName = err.name;
  return typeof errorName === "string" ? errorName : undefined;
};
/**
 * Wire up the terminal's UI event bindings (copy/paste, pointer focus, link clicks,
 * textarea focus/blur cursor blink), registering matching removers on input.cleanups.
 * @param {Object} input - Binding context ({term, container, cleanups, handlePointerDown, handleLinkClick}).
 * @returns {void}
 */
const useTerminalUiBindings = input => {
  const handleCopy = event => {
    const selection = input.term.getSelection();
    if (!selection) return;
    const clipboard = event.clipboardData;
    if (!clipboard) return;
    event.preventDefault();
    clipboard.setData("text/plain", selection);
  };
  const handlePaste = event => {
    const clipboard = event.clipboardData;
    const text = clipboard?.getData("text/plain") ?? clipboard?.getData("text") ?? "";
    if (!text) return;
    event.preventDefault();
    event.stopPropagation();
    input.term.paste(text);
  };
  const handleTextareaFocus = () => {
    input.term.options.cursorBlink = true;
  };
  const handleTextareaBlur = () => {
    input.term.options.cursorBlink = false;
  };
  input.container.addEventListener("copy", handleCopy, true);
  input.cleanups.push(() => input.container.removeEventListener("copy", handleCopy, true));
  input.container.addEventListener("paste", handlePaste, true);
  input.cleanups.push(() => input.container.removeEventListener("paste", handlePaste, true));
  input.container.addEventListener("pointerdown", input.handlePointerDown);
  input.cleanups.push(() => input.container.removeEventListener("pointerdown", input.handlePointerDown));
  input.container.addEventListener("click", input.handleLinkClick, {
    capture: true
  });
  input.cleanups.push(() => input.container.removeEventListener("click", input.handleLinkClick, {
    capture: true
  }));
  input.term.textarea?.addEventListener("focus", handleTextareaFocus);
  input.term.textarea?.addEventListener("blur", handleTextareaBlur);
  input.cleanups.push(() => input.term.textarea?.removeEventListener("focus", handleTextareaFocus));
  input.cleanups.push(() => input.term.textarea?.removeEventListener("blur", handleTextareaBlur));
};
/**
 * Serialize the terminal buffer and hand a restore snapshot (buffer, cursor, size,
 * scroll position) to the supplied onCleanup callback for later restoration.
 * @param {Object} input - Persist context ({addon, onCleanup, term, id, cursor}).
 * @returns {void}
 */
const persistTerminal = input => {
  if (!input.addon || !input.onCleanup || !input.term) return;
  const buffer = (() => {
    try {
      return input.addon.serialize();
    } catch {
      debugTerminal("failed to serialize terminal buffer");
      return "";
    }
  })();
  input.onCleanup({
    id: input.id,
    buffer,
    cursor: input.cursor,
    rows: input.term.rows,
    cols: input.term.cols,
    scrollY: input.term.getViewportY()
  });
};
// Reactive spread for the root <div>, mirroring the compiled
// spread(el, mergeProps({ style, classList }, others), false, false): re-run
// on any prop change and diff per key against the previous snapshot. classList
// toggles each space-separated class token, style diffs object/string values
// per property — both matching solid-js/web's assign() semantics. `children`
// is skipped (Terminal is never given children; xterm owns the subtree).
/**
 * Diff a classList object against the previous snapshot, toggling each space-separated
 * class token to match solid-js/web's assign() semantics.
 * @param {Element} el - The element to update.
 * @param {Object} value - The next classList map (class keys to booleans).
 * @param {Object} prev - The previous classList map.
 * @returns {Object} A shallow copy of the applied classList map.
 */
function applyClassList(el, value, prev) {
  const prevObj = prev || {};
  const nextObj = value || {};
  for (const name of Object.keys(prevObj)) {
    if (!name || name in nextObj || !prevObj[name]) continue;
    for (const cls of name.trim().split(/\s+/)) {
      if (cls) el.classList.remove(cls);
    }
  }
  for (const name of Object.keys(nextObj)) {
    const on = !!nextObj[name];
    if (!name || on === !!prevObj[name]) continue;
    for (const cls of name.trim().split(/\s+/)) {
      if (cls) el.classList.toggle(cls, on);
    }
  }
  return { ...nextObj };
}
/**
 * Apply a style value (string cssText or per-property object) to an element, diffing
 * against the previous value.
 * @param {Element} el - The element to update.
 * @param {string} value - The next style (cssText string or property map).
 * @param {*} prev - The previously applied style value.
 * @returns {*} The applied value (string or a shallow copy of the object).
 */
function applyStyle(el, value, prev) {
  if (typeof value === "string") {
    if (value !== prev) el.style.cssText = value;
    return value;
  }
  if (typeof prev === "string") {
    el.style.cssText = "";
    prev = undefined;
  }
  const prevObj = prev || {};
  const nextObj = value || {};
  for (const name of Object.keys(prevObj)) {
    if (!(name in nextObj)) el.style.removeProperty(name);
  }
  for (const name of Object.keys(nextObj)) {
    if (nextObj[name] !== prevObj[name]) el.style.setProperty(name, nextObj[name]);
  }
  return { ...nextObj };
}
/**
 * Set or remove an attribute (removed when the value is null/undefined).
 * @param {Element} el - The element to update.
 * @param {string} name - The attribute name.
 * @param {*} value - The attribute value, or null/undefined to remove it.
 * @returns {void}
 */
function setAttr(el, name, value) {
  if (value == null) el.removeAttribute(name);
  else el.setAttribute(name, value);
}
/**
 * Assign a single prop to an element by key (style, classList, ref, on* listeners,
 * class/className, or a plain attribute), diffing against the previous value.
 * @param {Element} el - The element to update.
 * @param {string} key - The prop name.
 * @param {*} value - The next value for the prop.
 * @param {*} prev - The previously applied value.
 * @param {Map} listeners - Map tracking attached event listeners by prop key.
 * @returns {*} The value to store as the new previous for this key.
 */
function assignProp(el, key, value, prev, listeners) {
  if (key === "style") return applyStyle(el, value, prev);
  if (key === "classList") return applyClassList(el, value, prev);
  if (value === prev) return prev;
  if (key === "ref") {
    if (typeof value === "function") value(el);
    return value;
  }
  if (key.startsWith("on") && key.length > 2) {
    const name = key.startsWith("on:") ? key.slice(3) : key.slice(2).toLowerCase();
    const existing = listeners.get(key);
    if (existing) el.removeEventListener(name, existing);
    let handler;
    if (typeof value === "function") handler = value;
    else if (Array.isArray(value)) handler = event => value[0](value[1], event);
    if (handler) {
      el.addEventListener(name, handler);
      listeners.set(key, handler);
    } else {
      listeners.delete(key);
    }
    return value;
  }
  if (key === "class" || key === "className") {
    if (value == null) el.removeAttribute("class");
    else el.className = value;
    return value;
  }
  setAttr(el, key, value);
  return value;
}
/**
 * Reactively spread a props object onto an element, re-running on any prop change and
 * diffing per key (children are skipped; removed keys are cleared).
 * @param {Element} el - The element to apply props to.
 * @param {Object} props - The reactive props object.
 * @returns {void}
 */
function spreadProps(el, props) {
  const prev = {};
  const listeners = new Map();
  createRenderEffect(() => {
    for (const key of Object.keys(prev)) {
      if (key === "children" || key in props) continue;
      assignProp(el, key, null, prev[key], listeners);
      delete prev[key];
    }
    for (const key of Object.keys(props)) {
      if (key === "children") continue;
      prev[key] = assignProp(el, key, props[key], prev[key], listeners);
    }
  });
}
/**
 * Terminal component. Renders a ghostty/xterm terminal into a div, connects it to a
 * server PTY over a WebSocket (with exponential-backoff reconnect), keeps the terminal
 * sized to its container, applies the theme palette/font reactively, and persists the
 * buffer on unmount for later restoration.
 * @param {Object} props - Component props.
 * @param {Object} props.pty - PTY descriptor ({id, buffer, cursor, rows, cols, scrollY}) used to connect/restore.
 * @param {string} props.class - Extra class string for the root element.
 * @param {Object} props.classList - Extra classList map for the root element.
 * @param {boolean} props.autoFocus - Whether to focus the terminal on mount (default true).
 * @param {Function} props.onConnect - Called when the WebSocket connection opens.
 * @param {Function} props.onConnectError - Called with the error when connection fails permanently.
 * @param {Function} props.onSubmit - Called when Enter is pressed in the terminal.
 * @param {Function} props.onCleanup - Receives the persisted buffer snapshot on unmount.
 * @returns {Node} The terminal container element.
 */
export const Terminal = props => {
  const platform = usePlatform();
  const settings = useSettings();
  const theme = useTheme();
  const language = useLanguage();
  const controller = useServerController();
  const connection = controller.terminalConnection();
  const directory = connection.directory;
  const client = connection.client;
  const url = connection.url;
  const username = connection.username;
  const password = connection.password;
  const sameOrigin = connection.sameOrigin;
  let container;
  const [local, others] = splitProps(props, ["pty", "class", "classList", "autoFocus", "onConnect", "onConnectError"]);
  const id = local.pty.id;
  const restore = typeof local.pty.buffer === "string" ? local.pty.buffer : "";
  const restoreSize = restore && typeof local.pty.cols === "number" && Number.isSafeInteger(local.pty.cols) && local.pty.cols > 0 && typeof local.pty.rows === "number" && Number.isSafeInteger(local.pty.rows) && local.pty.rows > 0 ? {
    cols: local.pty.cols,
    rows: local.pty.rows
  } : undefined;
  const scrollY = typeof local.pty.scrollY === "number" ? local.pty.scrollY : undefined;
  let ws;
  let term;
  let _ghostty;
  let serializeAddon;
  let fitAddon;
  let handleResize;
  let fitFrame;
  let sizeTimer;
  let pendingSize;
  let lastSize;
  let disposed = false;
  const cleanups = [];
  const start = typeof local.pty.cursor === "number" && Number.isSafeInteger(local.pty.cursor) ? local.pty.cursor : undefined;
  let cursor = start ?? 0;
  let seek = start !== undefined ? start : restore ? -1 : 0;
  let output;
  let drop;
  let reconn;
  let tries = 0;
  /**
   * Run and clear all registered cleanup callbacks in reverse order.
   * @returns {void}
   */
  const cleanup = () => {
    if (!cleanups.length) return;
    const fns = cleanups.splice(0).reverse();
    for (const fn of fns) {
      try {
        fn();
      } catch (err) {
        debugTerminal("cleanup failed", err);
      }
    }
  };
  /**
   * Send the current terminal size to the server PTY (errors are logged, not thrown).
   * @param {number} cols - Column count.
   * @param {number} rows - Row count.
   * @returns {Promise} Resolves once the update request settles.
   */
  const pushSize = (cols, rows) => {
    return client.pty.update({
      ptyID: id,
      size: {
        cols,
        rows
      }
    }).catch(err => {
      debugTerminal("failed to sync terminal size", err);
    });
  };
  // Pick a fixed palette based on the resolved Bootstrap color mode. Reading
  // theme.mode() inside the memo keeps the terminal colors reactive: when the
  // mode flips (light <-> dark, including live system changes), the memo
  // recomputes and the createEffect below re-applies the theme on the terminal.
  /**
   * Pick the xterm color palette for the resolved Bootstrap color mode (reactive).
   * @returns {Object} The light or dark terminal palette.
   */
  const getTerminalColors = () => {
    const mode = theme.mode() === "dark" ? "dark" : "light";
    return TERMINAL_PALETTES[mode];
  };
  const terminalColors = createMemo(getTerminalColors);
  /**
   * Schedule a single fit-addon resize on the next animation frame (coalesced).
   * @returns {void}
   */
  const scheduleFit = () => {
    if (disposed) return;
    if (!fitAddon) return;
    if (fitFrame !== undefined) return;
    fitFrame = requestAnimationFrame(() => {
      fitFrame = undefined;
      if (disposed) return;
      fitAddon.fit();
    });
  };
  /**
   * Debounce-push a new terminal size to the server (immediate for the first size,
   * then throttled), skipping unchanged sizes.
   * @param {number} cols - Column count.
   * @param {number} rows - Row count.
   * @returns {void}
   */
  const scheduleSize = (cols, rows) => {
    if (disposed) return;
    if (lastSize?.cols === cols && lastSize?.rows === rows) return;
    pendingSize = {
      cols,
      rows
    };
    if (!lastSize) {
      lastSize = pendingSize;
      void pushSize(cols, rows);
      return;
    }
    if (sizeTimer !== undefined) return;
    sizeTimer = setTimeout(() => {
      sizeTimer = undefined;
      const next = pendingSize;
      if (!next) return;
      pendingSize = undefined;
      if (disposed) return;
      if (lastSize?.cols === next.cols && lastSize?.rows === next.rows) return;
      lastSize = next;
      void pushSize(next.cols, next.rows);
    }, 100);
  };
  createEffect(() => {
    const colors = terminalColors();
    if (!term) return;
    setOptionIfSupported(term, "theme", colors);
  });
  createEffect(() => {
    const font = terminalFontFamily(settings.appearance.terminalFont());
    if (!term) return;
    setOptionIfSupported(term, "fontFamily", font);
    scheduleFit();
  });
  let zoom = platform.webviewZoom?.();
  createEffect(() => {
    const next = platform.webviewZoom?.();
    if (next === undefined) return;
    if (next === zoom) return;
    zoom = next;
    scheduleFit();
  });
  /**
   * Focus the terminal and its hidden textarea (twice, to win focus races).
   * @returns {void}
   */
  const focusTerminal = () => {
    const t = term;
    if (!t) return;
    t.focus();
    t.textarea?.focus();
    setTimeout(() => t.textarea?.focus(), 0);
  };
  /**
   * On pointer-down inside the terminal, blur any outside focused element and focus
   * the terminal.
   * @returns {void}
   */
  const handlePointerDown = () => {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && activeElement !== container && !container.contains(activeElement)) {
      activeElement.blur();
    }
    focusTerminal();
  };
  /**
   * Open the hovered terminal link in the platform browser on a modified left-click.
   * @param {MouseEvent} event - The click event.
   * @returns {void}
   */
  const handleLinkClick = event => {
    if (!event.shiftKey && !event.ctrlKey && !event.metaKey) return;
    if (event.altKey) return;
    if (event.button !== 0) return;
    const t = term;
    if (!t) return;
    const text = getHoveredLinkText(t);
    if (!text) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    platform.openLink(text);
  };
  onMount(() => {
    const run = async () => {
      const loaded = await loadGhostty();
      if (disposed) return;
      const mod = loaded.mod;
      const g = loaded.ghostty;
      const t = new mod.Terminal({
        cursorBlink: true,
        cursorStyle: "bar",
        cols: restoreSize?.cols,
        rows: restoreSize?.rows,
        fontSize: 14,
        fontFamily: terminalFontFamily(settings.appearance.terminalFont()),
        allowTransparency: false,
        convertEol: false,
        theme: terminalColors(),
        scrollback: 10_000,
        ghostty: g
      });
      cleanups.push(() => t.dispose());
      if (disposed) {
        cleanup();
        return;
      }
      _ghostty = g;
      term = t;
      output = terminalWriter((data, done) => t.write(data, () => {
        done?.();
      }));
      t.attachCustomKeyEventHandler(event => {
        const key = event.key.toLowerCase();
        if (event.ctrlKey && event.shiftKey && !event.metaKey && key === "c") {
          document.execCommand("copy");
          return true;
        }

        // allow for toggle terminal keybinds in parent
        const config = settings.keybinds.get(TOGGLE_TERMINAL_ID) ?? DEFAULT_TOGGLE_TERMINAL_KEYBIND;
        const keybinds = parseKeybind(config);
        return matchKeybind(keybinds, event);
      });
      const fit = new mod.FitAddon();
      const serializer = new SerializeAddon();
      cleanups.push(() => disposeIfDisposable(fit));
      t.loadAddon(serializer);
      t.loadAddon(fit);
      fitAddon = fit;
      serializeAddon = serializer;
      t.open(container);
      useTerminalUiBindings({
        container,
        term: t,
        cleanups,
        handlePointerDown,
        handleLinkClick
      });
      if (local.autoFocus !== false) focusTerminal();
      if (typeof document !== "undefined" && document.fonts) {
        void document.fonts.ready.then(scheduleFit);
      }
      const onResize = t.onResize(size => {
        scheduleSize(size.cols, size.rows);
      });
      cleanups.push(() => disposeIfDisposable(onResize));
      const onData = t.onData(data => {
        if (ws?.readyState === WebSocket.OPEN) ws.send(data);
      });
      cleanups.push(() => disposeIfDisposable(onData));
      const onKey = t.onKey(key => {
        if (key.key == "Enter") {
          props.onSubmit?.();
        }
      });
      cleanups.push(() => disposeIfDisposable(onKey));
      const startResize = () => {
        fit.observeResize();
        handleResize = scheduleFit;
        window.addEventListener("resize", handleResize);
        cleanups.push(() => window.removeEventListener("resize", handleResize));
      };
      const write = data => new Promise(resolve => {
        if (!output) {
          resolve();
          return;
        }
        output.push(data);
        output.flush(resolve);
      });
      if (restore && restoreSize) {
        await write(restore);
        fit.fit();
        scheduleSize(t.cols, t.rows);
        if (scrollY !== undefined) t.scrollToLine(scrollY);
        startResize();
      } else {
        fit.fit();
        scheduleSize(t.cols, t.rows);
        if (restore) {
          await write(restore);
          if (scrollY !== undefined) t.scrollToLine(scrollY);
        }
        startResize();
      }
      const once = {
        value: false
      };
      const decoder = new TextDecoder();
      const fail = err => {
        if (disposed) return;
        if (once.value) return;
        once.value = true;
        local.onConnectError?.(err);
      };
      const gone = () => client.pty.get({
        ptyID: id
      }).then(() => false).catch(err => {
        if (errorName(err) === "NotFoundError") return true;
        debugTerminal("failed to inspect terminal session", err);
        return false;
      });
      const retry = err => {
        if (disposed) return;
        if (reconn !== undefined) return;
        const ms = Math.min(250 * 2 ** Math.min(tries, 4), 4_000);
        reconn = setTimeout(async () => {
          reconn = undefined;
          if (disposed) return;
          if (await gone()) {
            if (disposed) return;
            fail(err);
            return;
          }
          if (disposed) return;
          tries += 1;
          open();
        }, ms);
      };
      const open = () => {
        if (disposed) return;
        drop?.();
        const next = new URL(url + `/pty/${id}/connect`);
        next.searchParams.set("directory", directory);
        next.searchParams.set("cursor", String(seek));
        next.protocol = next.protocol === "https:" ? "wss:" : "ws:";
        if (!sameOrigin && password) {
          next.searchParams.set("auth_token", btoa(`${username}:${password}`));
          // For same-origin requests, let the browser reuse the page's existing auth.
          next.username = username;
          next.password = password;
        }
        const socket = new WebSocket(next);
        socket.binaryType = "arraybuffer";
        ws = socket;
        const handleOpen = () => {
          if (disposed) return;
          tries = 0;
          local.onConnect?.();
          scheduleSize(t.cols, t.rows);
        };
        const handleMessage = event => {
          if (disposed) return;
          if (event.data instanceof ArrayBuffer) {
            const bytes = new Uint8Array(event.data);
            if (bytes[0] !== 0) return;
            const json = decoder.decode(bytes.subarray(1));
            try {
              const meta = JSON.parse(json);
              const next = meta?.cursor;
              if (typeof next === "number" && Number.isSafeInteger(next) && next >= 0) {
                cursor = next;
                seek = next;
              }
            } catch (err) {
              debugTerminal("invalid websocket control frame", err);
            }
            return;
          }
          const data = typeof event.data === "string" ? event.data : "";
          if (!data) return;
          output?.push(data);
          cursor += data.length;
          seek = cursor;
        };
        const handleError = error => {
          if (disposed) return;
          debugTerminal("websocket error", error);
        };
        const stop = () => {
          socket.removeEventListener("open", handleOpen);
          socket.removeEventListener("message", handleMessage);
          socket.removeEventListener("error", handleError);
          socket.removeEventListener("close", handleClose);
          if (ws === socket) ws = undefined;
          if (drop === stop) drop = undefined;
          if (socket.readyState !== WebSocket.CLOSED && socket.readyState !== WebSocket.CLOSING) socket.close(1000);
        };
        const handleClose = event => {
          if (ws === socket) ws = undefined;
          if (drop === stop) drop = undefined;
          socket.removeEventListener("open", handleOpen);
          socket.removeEventListener("message", handleMessage);
          socket.removeEventListener("error", handleError);
          socket.removeEventListener("close", handleClose);
          if (disposed) return;
          if (event.code === 1000) return;
          retry(new Error(language.t("terminal.connectionLost.abnormalClose", {
            code: event.code
          })));
        };
        drop = stop;
        socket.addEventListener("open", handleOpen);
        socket.addEventListener("message", handleMessage);
        socket.addEventListener("error", handleError);
        socket.addEventListener("close", handleClose);
      };
      open();
    };
    void run().catch(err => {
      if (disposed) return;
      showToast({
        variant: "error",
        title: language.t("terminal.connectionLost.title"),
        description: err instanceof Error ? err.message : language.t("terminal.connectionLost.description")
      });
      local.onConnectError?.(err);
    });
  });
  onCleanup(() => {
    disposed = true;
    if (fitFrame !== undefined) cancelAnimationFrame(fitFrame);
    if (sizeTimer !== undefined) clearTimeout(sizeTimer);
    if (reconn !== undefined) clearTimeout(reconn);
    drop?.();
    if (ws && ws.readyState !== WebSocket.CLOSED && ws.readyState !== WebSocket.CLOSING) ws.close(1000);
    const finalize = () => {
      persistTerminal({
        term,
        addon: serializeAddon,
        cursor,
        id,
        onCleanup: props.onCleanup
      });
      cleanup();
    };
    if (!output) {
      finalize();
      return;
    }
    output.flush(finalize);
  });
  // Static skeleton: <div data-component=terminal data-prevent-autofocus
  // tabindex=-1>. The compiled output captured this element as the local
  // `container` ref (always a plain variable here, never a function) and
  // applied a reactive spread; reproduce both. xterm renders into this div
  // once onMount's async setup calls term.open(container).
  const el = document.createElement("div");
  el.setAttribute("data-component", "terminal");
  el.setAttribute("data-prevent-autofocus", "");
  el.setAttribute("tabindex", "-1");
  container = el;
  spreadProps(el, mergeProps({
    get style() {
      return {
        "background-color": terminalColors().background
      };
    },
    get classList() {
      return {
        ...local.classList,
        "select-text": true,
        "size-full px-6 py-3 font-mono relative overflow-hidden": true,
        [local.class ?? ""]: !!local.class
      };
    }
  }, others));
  return el;
};