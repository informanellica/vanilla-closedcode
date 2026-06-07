import { template as _$template } from "solid-js/web";
import { use as _$use } from "solid-js/web";
import { spread as _$spread } from "solid-js/web";
import { mergeProps as _$mergeProps } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div data-component=terminal data-prevent-autofocus tabindex=-1>`);
import { withAlpha, useTheme } from "@/lib/theme.js";
import { showToast } from "@/lib/toast.js";
import { env } from "@/lib/env.js";
import { createEffect, createMemo, onCleanup, onMount, splitProps } from "solid-js";
import { SerializeAddon } from "@/addons/serialize.js";
import { matchKeybind, parseKeybind } from "@/context/command.js";
import { useLanguage } from "@/context/language.js";
import { usePlatform } from "@/context/platform.js";
import { terminalFontFamily, useSettings } from "@/context/settings.js";
import { useServerController } from "@/controllers/server.js";
import { disposeIfDisposable, getHoveredLinkText, setOptionIfSupported } from "@/utils/runtime-adapters.js";
import { terminalWriter } from "@/utils/terminal-writer.js";
const TOGGLE_TERMINAL_ID = "terminal.toggle";
const DEFAULT_TOGGLE_TERMINAL_KEYBIND = "ctrl+`";
let shared;
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
const debugTerminal = (...values) => {
  if (!env("DEV")) return;
  console.debug("[terminal]", ...values);
};
const errorName = err => {
  if (!err || typeof err !== "object") return;
  if (!("name" in err)) return;
  const errorName = err.name;
  return typeof errorName === "string" ? errorName : undefined;
};
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
  const getTerminalColors = () => {
    const mode = theme.mode() === "dark" ? "dark" : "light";
    return TERMINAL_PALETTES[mode];
  };
  const terminalColors = createMemo(getTerminalColors);
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
  const focusTerminal = () => {
    const t = term;
    if (!t) return;
    t.focus();
    t.textarea?.focus();
    setTimeout(() => t.textarea?.focus(), 0);
  };
  const handlePointerDown = () => {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && activeElement !== container && !container.contains(activeElement)) {
      activeElement.blur();
    }
    focusTerminal();
  };
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
  return (() => {
    var _el$ = _tmpl$();
    var _ref$ = container;
    typeof _ref$ === "function" ? _$use(_ref$, _el$) : container = _el$;
    _$spread(_el$, _$mergeProps({
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
    }, others), false, false);
    return _el$;
  })();
};