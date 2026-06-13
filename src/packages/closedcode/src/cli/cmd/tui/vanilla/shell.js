// Vanilla TUI app shell (Stage T3). This replaces the compiled-Solid-JSX app.js
// render model (an @opentui retained Renderable tree + RendererContext) with the
// immediate-mode T2 toolkit: state is signals, the view is a single rootDraw(region)
// composed from layout splits + widgets, and key input is routed through the
// layer-stack key router so an open dialog captures input and Escape closes only
// the top layer.
//
// Stage 1 built the root layout + route switch + a dialog overlay. Stage 2 wires
// in the REAL prompt (multi-line textarea + autocomplete + shell mode + history +
// agent/model meta) and the parts-based message timeline, replacing the stage-1
// placeholders. Later stages add the dialog families and the @opentui renderer
// features; T4 flips the entry from app.js to mountShell. The model (createShell)
// is pure and headless-testable — render its draw() into a detached ScreenBuffer,
// drive it with dispatch() — exactly like runtime.test.mjs.
import { createSignal } from "../runtime/reactivity.js";
import { column, box } from "../runtime/layout.js";
import { createKeyRouter } from "../runtime/focus.js";
import { centerBox } from "../runtime/dialog.js";
import { fit } from "../runtime/text.js";
import { createApp } from "../runtime/screen.js";
import { defaultTheme, attr } from "./theme.js";
import { drawLogo, LOGO_HEIGHT } from "./logo.js";
import { createPrompt, createPromptHistory } from "./prompt.js";
import { createTimeline } from "./timeline.js";
import { createToast } from "./toast.js";
import * as Dialogs from "./dialogs.js";

const STATUS_ROWS = 1;
const HOME_PROMPT_COLS = 75; // matches the live home (maxWidth 75)

// Slash commands surfaced in the prompt autocomplete (and handled on submit).
const SLASH_COMMANDS = [
  { name: "new", description: "Start a new session" },
  { name: "help", description: "Show help" },
  { name: "models", description: "Switch model" },
  { name: "agents", description: "Switch agent" },
  { name: "exit", description: "Exit the app" },
];

export function createShell(opts = {}) {
  const theme = opts.theme ?? defaultTheme;
  const router = createKeyRouter();

  // --- route ---------------------------------------------------------------
  const [route, setRoute] = createSignal(opts.initialRoute ?? { type: "home" });
  const navigate = next => setRoute(next);

  // --- timeline ------------------------------------------------------------
  // message = { role, parts: [{ type:"text"|"reasoning"|"tool"|"file", ... }] }
  const [messages, setMessages] = createSignal([]);
  const pushMessage = m => setMessages(list => [...list, m]);
  const timeline = createTimeline(messages, { theme });
  const toast = createToast({ theme, now: opts.now, scheduleRepaint: opts.scheduleRepaint });

  // Global keys work even while a dialog captures input (grabInput suppresses
  // SIGINT, so without this Ctrl-C would be a dead key behind a modal).
  router.setGlobal((name) => { if (name === "CTRL_C") { opts.onExit?.(); return true; } return false; });

  // --- prompt --------------------------------------------------------------
  const history = createPromptHistory();
  const prompt = createPrompt({
    theme,
    placeholders: opts.placeholders ?? { normal: ["Fix a TODO", "Explain this repo"], shell: ["ls -la", "git status"] },
    commands: SLASH_COMMANDS,
    listFiles: opts.listFiles,
    history,
    agent: opts.agent ?? "build",
    model: opts.model ?? "opus-4.8",
    provider: opts.provider ?? "anthropic",
    onSubmit: (text, { mode }) => onPromptSubmit(text, mode),
  });

  function onPromptSubmit(text, mode) {
    // Slash command on submit (normal mode) -> run it instead of posting.
    if (mode === "normal" && text.startsWith("/")) {
      const cmd = text.slice(1).split(/\s+/)[0];
      if (SLASH_COMMANDS.some(c => c.name === cmd)) { runCommand(slashToValue(cmd)); return; }
    }
    if (route().type === "home") navigate({ type: "session", sessionID: "local" });
    pushMessage({ role: "user", parts: [{ type: "text", text: mode === "shell" ? "! " + text : text }] });
    // Stage-2 placeholder; SDK streaming is wired at the integration stage.
    pushMessage({ role: "assistant", parts: [{ type: "text", text: "(assistant response will stream here)" }] });
    timeline.pin(); // jump to the newest line on the user's own message
  }
  const slashToValue = cmd => ({ new: "session.new", help: "help", exit: "app.exit", models: "models", agents: "agents" }[cmd] ?? "help");

  // --- dialog overlay (layer stack) ----------------------------------------
  const [dialogs, setDialogs] = createSignal([]);
  const dialog = {
    open(spec) {
      const remove = router.pushLayer({
        handleKey: (name, data) => spec.widget.handleKey?.(name, data) ?? false,
        onEscape: () => dialog.close(),
      });
      setDialogs(list => [...list, { ...spec, remove }]);
    },
    close() {
      const top = dialogs().at(-1);
      if (!top) return;
      top.remove?.();
      setDialogs(list => list.slice(0, -1));
      top.onClose?.();
    },
    current: () => dialogs().at(-1),
  };

  // --- command palette (filtered select from the dialog families) ----------
  function openCommands() {
    Dialogs.select(dialog, {
      title: "Commands", theme, now: opts.now,
      options: [
        { label: "New session", value: "session.new" },
        { label: "Go home", value: "route.home" },
        { label: "Switch model", value: "models" },
        { label: "Switch agent", value: "agents" },
        { label: "Help", value: "help" },
        { label: "Exit", value: "app.exit" },
      ],
      onSelect: it => { if (it) runCommand(it.value); },
    });
  }
  function runCommand(value) {
    switch (value) {
      case "session.new": setMessages([]); navigate({ type: "home" }); break;
      case "route.home": navigate({ type: "home" }); break;
      case "help": openHelp(); break;
      case "models": openStub("Models", ["opus-4.8", "sonnet-4.6", "haiku-4.5"])
        .then(o => o && toast.show({ message: `Switched model: ${o.value}`, variant: "success" })); break;
      case "agents": openStub("Agents", ["build", "plan", "general"])
        .then(o => o && toast.show({ message: `Switched agent: ${o.value}`, variant: "success" })); break;
      case "app.exit": opts.onExit?.(); break;
    }
  }
  function openHelp() {
    const lines = [
      "Enter        send the prompt",
      "Shift-Enter  newline",
      "!            shell mode (at line start)",
      "/ , @        command / file autocomplete",
      "Up / Down    prompt history (at edges)",
      "PgUp / PgDn  scroll the timeline",
      "Ctrl-P       command palette",
      "Esc          close dialog / back to home",
      "Ctrl-C       exit",
    ];
    const widget = { draw: r => lines.forEach((l, i) => r.line(i, l, attr(theme, "textMuted"))), handleKey: () => false };
    dialog.open({ title: "Help", width: 48, height: lines.length + 2, widget });
  }
  // Model/agent pickers: a filtered select from the dialog families. The real
  // SDK-backed option lists are injected at the integration stage.
  function openStub(title, options) {
    return Dialogs.select(dialog, { title, theme, now: opts.now, width: 40, options });
  }

  // --- base layer: global hotkeys + timeline scroll + the prompt -----------
  router.pushLayer({
    handleKey: (name, data) => {
      if (name === "CTRL_P") { openCommands(); return true; }
      if (route().type === "session" && (name === "PAGE_UP" || name === "PAGE_DOWN")) return timeline.handleKey(name);
      if (prompt.handleKey(name, data)) return true;
      if (name === "ESCAPE" && route().type === "session") { navigate({ type: "home" }); return true; }
      return false;
    },
  });
  const dispatch = (name, data) => router.dispatch(name, data);

  // --- draw ----------------------------------------------------------------
  function drawHomeBody(region) {
    const blockH = LOGO_HEIGHT + 2;
    const top = Math.max(0, Math.floor((region.height - blockH) / 2));
    drawLogo(region.sub(0, top, region.width, LOGO_HEIGHT), attr(theme, "primary"), { row: 0, center: true });
    region.line(top + LOGO_HEIGHT + 1, "Type a message and press Enter  •  Ctrl-P for commands", attr(theme, "textMuted"), "center");
  }

  function drawStatus(region) {
    const r = route();
    const mode = prompt.mode() === "shell" ? "  · shell" : "";
    const left = (r.type === "home" ? " home" : ` session:${r.sessionID}`) + mode;
    const right = "Ctrl-P commands  Ctrl-C exit ";
    region.line(0, fit(left, Math.max(0, region.width - right.length), "left") + right, attr(theme, "textMuted"));
  }

  function drawDialog(region, ctx) {
    const top = dialog.current();
    if (!top) return;
    const inner = centerBox(region, top.width, top.height, {
      title: top.title, fill: " ", fillAttr: attr(theme, "text"), attr: attr(theme, "primary"),
    });
    top.widget.draw(inner, { ...ctx, attr: attr(theme, "text"), activeAttr: { inverse: true } });
  }

  function drawAutocomplete(region, promptH, promptW, aoffset) {
    const ac = prompt.autocomplete;
    if (!ac.visible()) return;
    const n = Math.min(ac.items().length, 6);
    const overlayH = n + 2;
    const promptTop = region.height - STATUS_ROWS - promptH;
    const top = Math.max(0, promptTop - overlayH);
    const outer = region.sub(aoffset, top, promptW, overlayH);
    const inner = box(outer, { attr: attr(theme, "primary") });
    ac.draw(inner, { attr: attr(theme, "text"), activeAttr: { inverse: true } });
  }

  function draw(region, ctx = {}) {
    const dialogOpen = dialogs().length > 0;
    const home = route().type === "home";
    const promptW = home ? Math.min(HOME_PROMPT_COLS, region.width) : region.width;
    const aoffset = home ? Math.max(0, Math.floor((region.width - promptW) / 2)) : 0;
    const promptH = prompt.height(promptW);
    column(region, [
      { size: "flex", draw: r => (home ? drawHomeBody(r) : timeline.draw(r)) },
      { size: promptH, draw: r => prompt.draw(r.sub(aoffset, 0, promptW, r.height), ctx, { focused: !dialogOpen }) },
      { size: STATUS_ROWS, draw: drawStatus },
    ]);
    drawAutocomplete(region, promptH, promptW, aoffset);
    drawDialog(region, ctx);
    toast.draw(region);
  }

  return { route, navigate, messages, pushMessage, prompt, timeline, dialog, toast, openCommands, openHelp, dispatch, draw, theme };
}

// Wire the shell model into a live terminal-kit app. Returns { app, shell }.
export function mountShell(opts = {}) {
  let app;
  const shell = createShell({
    ...opts,
    onExit: () => { app?.stop(); opts.onExit?.(); },
    // Repaint when a toast is due to expire (an idle screen never re-renders).
    scheduleRepaint: ms => { const t = setTimeout(() => app?.repaint(), ms + 16); t?.unref?.(); },
  });
  app = createApp((region, ctx) => shell.draw(region, ctx), { terminal: opts.terminal, mouse: opts.mouse });
  app.onKey((name, data) => shell.dispatch(name, data));
  return { app, shell };
}
