// Vanilla TUI app shell (Stage T3, stage 1 — "the app shell"). This replaces the
// compiled-Solid-JSX app.js render model (an @opentui retained Renderable tree +
// RendererContext) with the immediate-mode T2 toolkit: state is signals, the view
// is a single rootDraw(region) composed from layout splits + widgets, and key
// input is routed through the layer-stack key router so an open dialog captures
// input and Escape closes only the top layer.
//
// Scope of this stage: the ROOT LAYOUT (body / prompt / status), route switching
// (home <-> session), the prompt input, the message timeline, and a dialog
// overlay demonstrated by a command palette. Later T3 stages fill the body with
// the real timeline/dialog families; T4 flips the entry from app.js to mountShell
// and removes @opentui/solid. The model (createShell) is pure and headless-
// testable — render its draw() into a detached ScreenBuffer, drive it with
// dispatch() — exactly like runtime.test.mjs.
import { createSignal } from "../runtime/reactivity.js";
import { column } from "../runtime/layout.js";
import { box } from "../runtime/layout.js";
import { createTextInput } from "../runtime/input.js";
import { createSelectList } from "../runtime/list.js";
import { createKeyRouter } from "../runtime/focus.js";
import { centerBox } from "../runtime/dialog.js";
import { wordWrap, fit } from "../runtime/text.js";
import { createApp } from "../runtime/screen.js";
import { defaultTheme, attr } from "./theme.js";
import { drawLogo, LOGO_HEIGHT } from "./logo.js";

const PROMPT_ROWS = 3; // bordered box: top + 1 input line + bottom
const STATUS_ROWS = 1;
const HOME_PROMPT_COLS = 75; // matches the live home (maxWidth 75)

// Build the shell MODEL: state + key routing + a draw(region, ctx). No terminal
// dependency, so it renders into any region (a detached ScreenBuffer in tests).
export function createShell(opts = {}) {
  const theme = opts.theme ?? defaultTheme;
  const router = createKeyRouter();

  // --- route ---------------------------------------------------------------
  const [route, setRoute] = createSignal(opts.initialRoute ?? { type: "home" });
  function navigate(next) {
    setRoute(next);
  }

  // --- timeline ------------------------------------------------------------
  const [messages, setMessages] = createSignal([]); // { role: "user"|"assistant", text }
  const pushMessage = m => setMessages(list => [...list, m]);

  // --- prompt --------------------------------------------------------------
  const prompt = createTextInput("", { onSubmit: text => submit(text) });
  function submit(text) {
    const value = text.trim();
    if (!value) return;
    if (route().type === "home") navigate({ type: "session", sessionID: "local" });
    pushMessage({ role: "user", text: value });
    prompt.setValue("");
    prompt.setCursor(0);
    // Stage-1 placeholder: the real assistant stream is wired in a later stage.
    pushMessage({ role: "assistant", text: "(assistant response will stream here)" });
  }

  // --- dialog overlay (layer stack) ----------------------------------------
  // A dialog is { title, width, height, widget } where widget has
  // draw(region, ctx) + handleKey(name, data). Opening pushes a key-router layer
  // whose onEscape closes it; closing pops both the signal entry and the layer.
  const [dialogs, setDialogs] = createSignal([]);
  const dialog = {
    open(spec) {
      const remove = router.pushLayer({
        handleKey: (name, data) => spec.widget.handleKey?.(name, data) ?? false,
        onEscape: () => dialog.close(),
      });
      const entry = { ...spec, remove };
      setDialogs(list => [...list, entry]);
      return entry;
    },
    close() {
      setDialogs(list => {
        const top = list[list.length - 1];
        top?.remove?.();
        return list.slice(0, -1);
      });
    },
    current: () => dialogs().at(-1),
  };

  // --- command palette (demonstrates list + dialog + layer) ----------------
  function openCommands() {
    const items = [
      { label: "New session", value: "session.new" },
      { label: "Go home", value: "route.home" },
      { label: "Help", value: "help" },
      { label: "Exit", value: "app.exit" },
    ];
    const list = createSelectList(items, {
      now: opts.now,
      onSelect: it => {
        dialog.close();
        runCommand(it.value);
      },
    });
    dialog.open({ title: "Commands", width: 40, height: items.length + 2, widget: list });
  }
  function runCommand(value) {
    switch (value) {
      case "session.new": setMessages([]); navigate({ type: "home" }); break;
      case "route.home": navigate({ type: "home" }); break;
      case "help": openHelp(); break;
      case "app.exit": opts.onExit?.(); break;
    }
  }
  function openHelp() {
    const lines = [
      "Enter      send the prompt",
      "Ctrl-P     command palette",
      "Esc        close dialog / back to home",
      "Ctrl-C     exit",
    ];
    const widget = {
      draw: region => lines.forEach((l, i) => region.line(i, l, attr(theme, "textMuted"))),
      handleKey: () => false, // any non-Escape key is swallowed by the layer
    };
    dialog.open({ title: "Help", width: 44, height: lines.length + 2, widget });
  }

  // --- base layer: prompt by default + global hotkeys ----------------------
  router.pushLayer({
    handleKey: (name, data) => {
      if (name === "CTRL_P") { openCommands(); return true; }
      if (name === "CTRL_C") { opts.onExit?.(); return true; }
      if (name === "ESCAPE") {
        if (route().type === "session" && prompt.value() === "") { navigate({ type: "home" }); return true; }
        return false;
      }
      return prompt.handleKey(name, data);
    },
  });

  function dispatch(name, data) {
    return router.dispatch(name, data);
  }

  // --- draw ----------------------------------------------------------------
  function drawPrompt(region, ctx, { focused }) {
    const inner = box(region, { attr: attr(theme, focused ? "primary" : "textMuted") });
    prompt.draw(inner, {
      focused,
      ctx,
      attr: attr(theme, "text"),
      placeholder: route().type === "home" ? "Ask anything, or run a command with Ctrl-P" : "Reply…",
    });
  }

  function drawHomeBody(region) {
    // Center the logo block (logo + a hint) vertically in the body.
    const blockH = LOGO_HEIGHT + 2;
    const top = Math.max(0, Math.floor((region.height - blockH) / 2));
    drawLogo(region.sub(0, top, region.width, LOGO_HEIGHT), attr(theme, "primary"), { row: 0, center: true });
    region.line(top + LOGO_HEIGHT + 1, "Type a message and press Enter  •  Ctrl-P for commands",
      attr(theme, "textMuted"), "center");
  }

  function drawSessionBody(region) {
    // Build colored, wrapped timeline lines; bottom-pin to the latest.
    const lines = [];
    for (const m of messages()) {
      const isUser = m.role === "user";
      const a = attr(theme, isUser ? "primary" : "text");
      const prefix = isUser ? "› " : "  ";
      for (const l of wordWrap(prefix + m.text, region.width)) lines.push({ str: l, a });
    }
    const h = region.height;
    const start = Math.max(0, lines.length - h);
    for (let i = 0; i + start < lines.length && i < h; i++) {
      const ln = lines[start + i];
      region.line(i, ln.str, ln.a);
    }
  }

  function drawStatus(region) {
    const r = route();
    const left = r.type === "home" ? " home" : ` session:${r.sessionID}`;
    const right = "Ctrl-P commands  Ctrl-C exit ";
    region.line(0, fit(left, region.width - right.length, "left") + right, attr(theme, "textMuted"));
  }

  function drawDialog(region, ctx) {
    const top = dialog.current();
    if (!top) return;
    const inner = centerBox(region, top.width, top.height, {
      title: top.title,
      fill: " ",
      fillAttr: attr(theme, "text"),
      attr: attr(theme, "primary"),
    });
    top.widget.draw(inner, { ...ctx, attr: attr(theme, "text"), activeAttr: { inverse: true } });
  }

  function draw(region, ctx = {}) {
    const dialogOpen = dialogs().length > 0;
    const home = route().type === "home";
    column(region, [
      { size: "flex", draw: r => (home ? drawHomeBody(r) : drawSessionBody(r)) },
      {
        size: PROMPT_ROWS,
        draw: r => {
          // On home the prompt is width-capped and centered (like the live home).
          const p = home ? r.sub(Math.max(0, Math.floor((r.width - HOME_PROMPT_COLS) / 2)), 0,
            Math.min(HOME_PROMPT_COLS, r.width), r.height) : r;
          drawPrompt(p, ctx, { focused: !dialogOpen });
        },
      },
      { size: STATUS_ROWS, draw: drawStatus },
    ]);
    drawDialog(region, ctx);
  }

  return { route, navigate, messages, pushMessage, prompt, dialog, openCommands, openHelp, dispatch, draw, theme };
}

// Wire the shell model into a live terminal-kit app. Returns { app, shell }.
export function mountShell(opts = {}) {
  let app;
  const shell = createShell({ ...opts, onExit: () => { app?.stop(); opts.onExit?.(); } });
  app = createApp((region, ctx) => shell.draw(region, ctx), { terminal: opts.terminal, mouse: opts.mouse });
  app.onKey((name, data) => shell.dispatch(name, data));
  return { app, shell };
}
