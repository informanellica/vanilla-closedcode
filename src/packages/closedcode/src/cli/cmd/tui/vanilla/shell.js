/**
 * @file Vanilla TUI app shell (Stage T3 + SDK integration). Immediate-mode
 * replacement for the compiled-Solid app.js: state is signals, the view is a
 * single rootDraw(region), and keys route through the layer-stack key router.
 *
 * DUAL-MODE: when a `data` layer (vanilla/data) is injected, the shell drives a
 * REAL backend — the timeline streams server messages/parts, prompt submit calls
 * session.create/prompt/shell/command, the model/agent dialogs list real
 * providers/agents, `/` autocomplete merges server commands, and `@` queries
 * sdk.find.files. With no `data` it runs the original self-contained stub (so the
 * headless tests need no SDK). The model (createShell) renders into any region
 * and is driven by dispatch() — headless-testable either way.
 */
import { createSignal } from "../runtime/reactivity.js";
import { column, row, box } from "../runtime/layout.js";
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
import { createPermissionPrompt, createQuestionPrompt } from "./prompts.js";
import { createSelection } from "./selection.js";
import { buildCommands } from "./commands.js";
import { createKeybind } from "./keybind.js";
import { createSidebar } from "./sidebar.js";

/**
 * Map a terminal-kit combined key NAME ("CTRL_X","ENTER","PAGE_UP",…) to the
 * {name, ctrl, shift, meta} event shape the keybind resolver expects.
 * @param {string} name - The combined key name from terminal-kit.
 * @param {Object} data - The raw key metadata (isCharacter, ...).
 * @returns {Object} {name, ctrl, shift, meta, isCharacter} normalized event.
 */
function tkToEvent(name, data) {
  let ctrl = false, shift = false, meta = false, n = name;
  if (n.startsWith("CTRL_")) { ctrl = true; n = n.slice(5); }
  else if (n.startsWith("ALT_")) { meta = true; n = n.slice(4); }
  else if (n.startsWith("META_")) { meta = true; n = n.slice(5); }
  else if (n.startsWith("SHIFT_")) { shift = true; n = n.slice(6); }
  const REMAP = { ENTER: "return", ESCAPE: "escape", PAGE_UP: "pageup", PAGE_DOWN: "pagedown", " ": "space" };
  n = REMAP[n] ?? n.toLowerCase();
  return { name: n, ctrl, shift, meta, isCharacter: data?.isCharacter };
}

const STATUS_ROWS = 1;
const HOME_PROMPT_COLS = 75; // matches the live home (maxWidth 75)

// Local slash commands handled IN the TUI (not sent to the server).
const SLASH_COMMANDS = [
  { name: "new", description: "Start a new session" },
  { name: "help", description: "Show help" },
  { name: "models", description: "Switch model" },
  { name: "agents", description: "Switch agent" },
  { name: "exit", description: "Exit the app" },
];

/**
 * Create the headless-testable TUI shell model: route + timeline + prompt +
 * dialogs + selection, all driven by dispatch(name, data) and rendered by
 * draw(region, ctx). Runs against a real backend when `opts.data` is injected,
 * otherwise a self-contained stub.
 * @param {Object} opts - Options.
 * @param {Object} opts.theme - Theme token map (defaults to defaultTheme).
 * @param {Object} opts.data - Optional vanilla/data layer (real backend).
 * @param {Object} opts.keybinds - Custom keybind config for the resolver.
 * @param {Function} opts.now - Clock function for lists/toasts.
 * @param {Object} opts.initialRoute - Starting route (defaults to {type:"home"}).
 * @param {string} opts.diffView - Initial diff display mode ("unified"|"split").
 * @param {Function} opts.onExit - Called when the app should exit.
 * @param {string} opts.agent - Default agent name in stub mode.
 * @param {string} opts.model - Default model display name in stub mode.
 * @param {string} opts.provider - Default provider display name in stub mode.
 * @param {Object} opts.placeholders - {normal, shell} prompt placeholder examples.
 * @param {Object} opts.selectionStorage - Optional persistence for createSelection.
 * @param {Function} opts.listFiles - File lister (stub mode @-autocomplete).
 * @param {Function} opts.scheduleRepaint - Schedule a repaint after a delay.
 * @param {Function} opts.suspend - Hand the TTY to an external editor and back.
 * @param {Function} opts.copyToClipboard - Copy text to the system clipboard.
 * @returns {Object} The shell API (route, navigate, messages, prompt, timeline, toast, dialog, selection, sidebar, dispatch, handleMouse, draw, init, ...).
 */
export function createShell(opts = {}) {
  const theme = opts.theme ?? defaultTheme;
  const data = opts.data; // optional vanilla/data layer
  const router = createKeyRouter();
  const keymap = createKeybind({ keybinds: opts.keybinds, now: opts.now }); // leader-chord resolver

  // --- route ---------------------------------------------------------------
  const [route, setRoute] = createSignal(opts.initialRoute ?? { type: "home" });
  /**
   * Navigate to a route and (in data mode) start syncing its session.
   * @param {Object} next - The target route ({type:"home"} or {type:"session", sessionID}).
   * @returns {void}
   */
  function navigate(next) { setRoute(next); if (data && next.type === "session") data.syncSession(next.sessionID); }
  const currentSid = () => { const r = route(); return r.type === "session" ? r.sessionID : undefined; };

  // --- timeline ------------------------------------------------------------
  const [localMessages, setLocalMessages] = createSignal([]); // stub-mode timeline
  const pushMessage = m => setLocalMessages(list => [...list, m]);
  const timelineSource = () => (data ? data.store.timeline(currentSid()) : localMessages());
  // Diff display mode for tool diffs: "unified" (stacked) or "split" (side-by-side).
  const [diffView, setDiffView] = createSignal(opts.diffView ?? "unified");
  const toggleDiffView = () => setDiffView(v => (v === "split" ? "unified" : "split"));
  const timeline = createTimeline(timelineSource, { theme, diffView });
  const toast = createToast({ theme, now: opts.now, scheduleRepaint: opts.scheduleRepaint });

  // Global keys work even while a dialog captures input.
  router.setGlobal(name => { if (name === "CTRL_C" && opts.onExit) { opts.onExit(); return true; } return false; });

  // --- selection (model / agent / variant) ---------------------------------
  const selection = data ? createSelection({ data, toast, agent: opts.agent, storage: opts.selectionStorage }) : null;
  const sidebar = data ? createSidebar({ data, theme, sessionID: currentSid }) : null;
  const currentAgentName = () => (selection ? selection.agent.current() : (opts.agent ?? "build"));
  const currentModel = () => (selection ? selection.model.current() : undefined);
  const metaModel = () => (selection ? selection.model.parsed().model : opts.model);
  const metaProvider = () => (selection ? selection.model.parsed().provider : opts.provider);

  // --- prompt --------------------------------------------------------------
  const history = createPromptHistory();
  const promptCommands = () => {
    if (!data) return SLASH_COMMANDS;
    const local = registry.filter(c => c.slash).map(c => ({ name: c.slash, description: c.label }));
    const localNames = new Set(local.map(c => c.name));
    // server commands, minus skills and names already covered by a local slash (dedup)
    const server = data.store.commands().filter(c => c.source !== "skill" && !localNames.has(c.name)).map(c => ({ name: c.name, description: c.description }));
    return [...local, ...server];
  };
  const prompt = createPrompt({
    theme,
    placeholders: opts.placeholders ?? { normal: ["Fix a TODO", "Explain this repo"], shell: ["ls -la", "git status"] },
    commands: promptCommands,
    listFiles: data ? data.findFiles : opts.listFiles,
    history,
    agent: currentAgentName,
    model: metaModel,
    provider: metaProvider,
    onSubmit: (text, { mode }) => onPromptSubmit(text, mode),
  });

  /**
   * Handle a prompt submission: run a local slash command in the TUI, or send
   * the text to the backend (data mode) / echo into the stub timeline.
   * @param {string} text - The submitted (trimmed) prompt text.
   * @param {string} mode - "normal" or "shell".
   * @returns {void}
   */
  function onPromptSubmit(text, mode) {
    // Local slash command -> run in the TUI, do not send to the server.
    if (mode === "normal" && text.startsWith("/")) {
      const slash = text.slice(1).split(/\s+/)[0];
      if (registryBySlash) { const cmd = registryBySlash.get(slash); if (cmd) { cmd.run(); return; } }
      else if (SLASH_COMMANDS.some(c => c.name === slash)) { runCommand(slashToValue(slash)); return; }
    }
    if (data) {
      timeline.pin();
      data.submit(currentSid(), text, { mode, agent: currentAgentName(), model: currentModel(), variant: selection?.variant.current() })
        .then(newSid => { if (route().type === "home") navigate({ type: "session", sessionID: newSid }); else data.syncSession(newSid); })
        .catch(e => toast.error(e));
      return;
    }
    // stub mode (no SDK)
    if (route().type === "home") navigate({ type: "session", sessionID: "local" });
    pushMessage({ role: "user", parts: [{ type: "text", text: mode === "shell" ? "! " + text : text }] });
    pushMessage({ role: "assistant", parts: [{ type: "text", text: "(assistant response will stream here)" }] });
    timeline.pin();
  }
  const slashToValue = cmd => ({ new: "session.new", help: "help", exit: "app.exit", models: "models", agents: "agents" }[cmd] ?? "help");

  // --- dialog overlay (layer stack) ----------------------------------------
  const [dialogs, setDialogs] = createSignal([]);
  const dialog = {
    /**
     * Push a dialog onto the overlay stack and a key-capturing layer.
     * @param {Object} spec - {title, width, height, widget, onClose} dialog spec.
     * @returns {void}
     */
    open(spec) {
      const remove = router.pushLayer({
        handleKey: (name, dt) => spec.widget.handleKey?.(name, dt) ?? false,
        onEscape: () => dialog.close(),
      });
      setDialogs(list => [...list, { ...spec, remove }]);
    },
    /**
     * Close the topmost dialog, remove its key layer, and fire its onClose.
     * @returns {void}
     */
    close() {
      const top = dialogs().at(-1);
      if (!top) return;
      top.remove?.();
      setDialogs(list => list.slice(0, -1));
      top.onClose?.();
    },
    current: () => dialogs().at(-1),
  };

  // --- commands ------------------------------------------------------------
  // Data mode: the full registry (vanilla/commands.js) drives the palette + slash.
  // Stub mode (no SDK, for shell.test.js): the small inline set below.
  const registry = data ? buildCommands({ data, dialog, toast, route, navigate, selection, onExit: opts.onExit, theme, now: opts.now, diffView, toggleDiffView }) : null;
  const registryBySlash = registry ? new Map(registry.filter(c => c.slash).map(c => [c.slash, c])) : null;
  const runRegistry = value => registry?.find(c => c.value === value)?.run();

  /**
   * Open the command palette dialog (full registry in data mode, inline set in stub mode).
   * @returns {void}
   */
  function openCommands() {
    if (registry) {
      Dialogs.select(dialog, {
        title: "Commands", theme, now: opts.now,
        options: registry.map(c => ({ label: c.label, value: c.value, category: c.category })),
        onSelect: it => { if (it) runRegistry(it.value); },
      });
      return;
    }
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
  /**
   * Run a stub-mode command by its value key.
   * @param {string} value - The command value ("session.new", "route.home", "help", "models", "agents", "app.exit").
   * @returns {void}
   */
  function runCommand(value) {
    switch (value) {
      case "session.new": if (!data) setLocalMessages([]); navigate({ type: "home" }); break;
      case "route.home": navigate({ type: "home" }); break;
      case "help": openHelp(); break;
      case "models": openModelDialog(); break;
      case "agents": openAgentDialog(); break;
      case "app.exit": opts.onExit?.(); break;
    }
  }
  /**
   * Open the model picker (real providers/models in data mode, a stub list otherwise).
   * @returns {void}
   */
  function openModelDialog() {
    if (data) {
      const options = [];
      for (const p of data.store.providers()) for (const [mid, m] of Object.entries(p.models ?? {})) options.push({ label: `${m.name ?? mid}  ·  ${p.name ?? p.id}`, value: { providerID: p.id, modelID: mid } });
      if (!options.length) { toast.show({ message: "No providers connected", variant: "warning" }); return; }
      Dialogs.select(dialog, { title: "Models", theme, now: opts.now, options }).then(o => { if (o) { selection.model.set(o.value); toast.show({ message: `Model: ${o.value.modelID}`, variant: "success" }); } });
      return;
    }
    openStub("Models", ["opus-4.8", "sonnet-4.6", "haiku-4.5"]).then(o => o && toast.show({ message: `Switched model: ${o.value}`, variant: "success" }));
  }
  /**
   * Open the agent picker (real agents in data mode, a stub list otherwise).
   * @returns {void}
   */
  function openAgentDialog() {
    if (data) {
      const options = data.store.agents().map(a => ({ label: a.name, value: a.name }));
      if (!options.length) { toast.show({ message: "No agents available", variant: "warning" }); return; }
      Dialogs.select(dialog, { title: "Agents", theme, now: opts.now, options }).then(o => { if (o) { selection.agent.set(o.value); toast.show({ message: `Agent: ${o.value}`, variant: "success" }); } });
      return;
    }
    openStub("Agents", ["build", "plan", "general"]).then(o => o && toast.show({ message: `Switched agent: ${o.value}`, variant: "success" }));
  }
  /**
   * Open the keybindings help dialog.
   * @returns {void}
   */
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
  /**
   * Open a small stub single-select dialog of string options.
   * @param {string} title - The dialog title.
   * @param {Array} options - The string option values.
   * @returns {Promise<Object>} Resolves with the selected {label, value} or null.
   */
  function openStub(title, options) { return Dialogs.select(dialog, { title, theme, now: opts.now, width: 40, options }); }

  // --- permission / question modal (data-driven, not user-opened) ----------
  let pwId = null, pw = null;
  /**
   * The first pending permission/question for the current session, if any.
   * @returns {Object|null} {kind:"permission"|"question", req} or null.
   */
  function pendingRequest() {
    if (!data) return null;
    const sid = currentSid();
    if (!sid) return null;
    const perm = data.store.permissions(sid)[0];
    if (perm) return { kind: "permission", req: perm };
    const q = data.store.questions(sid)[0];
    if (q) return { kind: "question", req: q };
    return null;
  }
  /**
   * The active permission/question widget for the current pending request,
   * rebuilt only when the pending request id changes (to keep stable select state).
   * @returns {Object|null} The prompt widget, or null when nothing is pending.
   */
  function activePrompt() {
    const p = pendingRequest();
    if (!p) { pwId = null; pw = null; return null; }
    if (pwId !== p.req.id) { // rebuild only when the pending request changes (stable select state)
      pwId = p.req.id;
      pw = p.kind === "permission"
        ? createPermissionPrompt(p.req, { theme, now: opts.now, onReply: reply => data.permissionReply(p.req.id, reply) })
        : createQuestionPrompt(p.req, { theme, now: opts.now, onReply: ans => data.questionReply(p.req.id, ans), onReject: () => data.questionReject(p.req.id) });
    }
    return pw;
  }

  // --- base layer: global hotkeys + timeline scroll + the prompt -----------
  router.pushLayer({
    handleKey: (name, dt) => {
      const ap = activePrompt();
      if (ap) return ap.handleKey(name, dt); // a pending request captures all input
      if (name === "CTRL_P") { openCommands(); return true; }
      if (route().type === "session" && (name === "PAGE_UP" || name === "PAGE_DOWN")) return timeline.handleKey(name);
      if (prompt.handleKey(name, dt)) return true;
      if (name === "ESCAPE" && route().type === "session") { navigate({ type: "home" }); return true; }
      return false;
    },
  });
  // Leader-chord actions (default leader Ctrl-X). Only ADDED on top of the raw
  // key flow: a leader keypress arms the chord and the NEXT key resolves an
  // action; everything else (editing, autocomplete Tab, Enter, etc.) passes
  // through unchanged. Maps the resolved action -> a command/dialog.
  /**
   * Map a resolved leader-chord action name to a command / dialog / selection op.
   * @param {string} action - The resolved keybind action name.
   * @returns {void}
   */
  function handleAction(action) {
    const run = registry ? runRegistry : runCommand;
    switch (action) {
      case "command_list": openCommands(); break;
      case "session_new": run("session.new"); break;
      case "session_list": registry ? run("session.switch") : openCommands(); break;
      case "session_rename": registry && run("session.rename"); break;
      case "session_delete": registry && run("session.delete"); break;
      case "session_compact": registry && run("session.compact"); break;
      case "session_export": registry && run("session.export"); break;
      case "model_list": registry ? run("model.switch") : openModelDialog(); break;
      case "agent_list": registry ? run("agent.switch") : openAgentDialog(); break;
      case "variant_cycle": selection?.variant.cycle(); break;
      case "agent_cycle": selection?.agent.cycle(1); break;
      case "agent_cycle_reverse": selection?.agent.cycle(-1); break;
      case "model_cycle_recent": selection?.model.cycle(1); break;
      case "model_cycle_recent_reverse": selection?.model.cycle(-1); break;
      case "theme_list": registry && run("theme.switch"); break;
      case "status_view": registry ? run("app.status") : openHelp(); break;
      case "help_show": registry ? run("app.help") : openHelp(); break;
      case "sidebar_toggle": sidebar?.toggle(); break;
      case "diff_view_toggle": toggleDiffView(); toast.show({ message: `Diff view: ${diffView()}`, variant: "info" }); break;
      case "messages_copy": copyLastMessage(); break;
      case "editor_open": openEditor(); break;
      case "app_exit": opts.onExit?.(); break;
      default: break;
    }
  }
  // Direct (non-leader) bindings safe to fire globally without the prompt seeing
  // the key (Ctrl-T / F2 / Shift-F2 / Shift-Tab). Tab/Enter/Up/Down stay with the
  // widgets, so they're NOT here.
  /**
   * Copy the most recent assistant message's text to the system clipboard (OSC 52).
   * @returns {void}
   */
  function copyLastMessage() {
    const msgs = timelineSource() ?? [];
    let text = "";
    for (let i = msgs.length - 1; i >= 0 && !text; i--) {
      if (msgs[i].role !== "assistant") continue;
      text = (msgs[i].parts ?? []).filter(p => p.type === "text" && p.text).map(p => p.text).join("\n\n").trim();
    }
    if (!text) { toast.show({ message: "No assistant message to copy", variant: "warning" }); return; }
    if (!opts.copyToClipboard) { toast.show({ message: "Clipboard unavailable", variant: "warning" }); return; }
    opts.copyToClipboard(text);
    toast.show({ message: "Copied last message", variant: "success" });
  }

  /**
   * Compose the prompt in $EDITOR: hand the TTY to the editor (opts.suspend),
   * read the edited text back, and load it into the prompt.
   * @returns {Promise<void>}
   */
  async function openEditor() {
    try {
      const { editInEditor } = await import("./editor.js");
      const edited = await editInEditor(prompt.value(), { suspend: opts.suspend });
      if (typeof edited === "string") { prompt.setText(edited.replace(/\n$/, "")); opts.scheduleRepaint?.(0); }
    } catch (e) { toast.error?.(e); }
  }

  /**
   * Mouse routing: wheel scrolls the timeline; clicks pin/keep follow. A modal or
   * open dialog owns the screen, so mouse is ignored while one is up.
   * @param {string} name - The mouse event name (e.g. "MOUSE_WHEEL_UP").
   * @param {Object} data - The mouse event metadata.
   * @returns {boolean} true when the event was consumed.
   */
  function handleMouse(name, data) {
    if (activePrompt() || dialogs().length > 0) return false;
    if (route().type !== "session") return false;
    if (name === "MOUSE_WHEEL_UP") { timeline.scrollBy(-3); return true; }
    if (name === "MOUSE_WHEEL_DOWN") { timeline.scrollBy(3); return true; }
    return false;
  }

  const GLOBAL_DIRECT = new Set(["variant_cycle", "model_cycle_recent", "model_cycle_recent_reverse", "agent_cycle_reverse"]);
  /**
   * Top-level key entry point: handle global Ctrl-C, leader chords, and direct
   * global bindings; otherwise dispatch through the layer-stack router (prompt /
   * widgets / dialogs).
   * @param {string} name - The combined key name.
   * @param {Object} dt - The raw key metadata.
   * @returns {boolean} true when the key was consumed.
   */
  function dispatch(name, dt) {
    // Global escape hatch: Ctrl-C exits even mid-chord / behind a modal.
    if (name === "CTRL_C" && opts.onExit) { keymap.clearLeader?.(); opts.onExit(); return true; }
    // A pending request modal or open dialog owns ALL input — leader chords must
    // NOT bypass the layer stack (clear any half-armed leader first).
    if (activePrompt() || dialogs().length > 0) { keymap.clearLeader?.(); return router.dispatch(name, dt); }
    const ev = tkToEvent(name, dt);
    const wasLeader = keymap.isLeaderActive();
    const action = keymap.resolve(ev.name, ev); // arms/clears leader internally
    if (action && (wasLeader || GLOBAL_DIRECT.has(action))) { handleAction(action); return true; }
    if (wasLeader) return true; // unmatched chord -> cancel leader, swallow (don't leak into the prompt)
    if (keymap.isLeaderActive()) return true; // leader just armed -> swallow the leader key
    return router.dispatch(name, dt); // ordinary raw key -> prompt / widgets / dialogs
  }

  // --- draw ----------------------------------------------------------------
  /**
   * Draw the vertically-centered home screen (logo + hint).
   * @param {Object} region - The drawing region.
   * @returns {void}
   */
  function drawHomeBody(region) {
    const blockH = LOGO_HEIGHT + 2;
    const top = Math.max(0, Math.floor((region.height - blockH) / 2));
    drawLogo(region.sub(0, top, region.width, LOGO_HEIGHT), attr(theme, "primary"), { row: 0, center: true });
    region.line(top + LOGO_HEIGHT + 1, "Type a message and press Enter  •  Ctrl-P for commands", attr(theme, "textMuted"), "center");
  }
  /**
   * Draw the bottom status row (route + mode on the left, hotkey hints on the right).
   * @param {Object} region - The drawing region (one row tall).
   * @returns {void}
   */
  function drawStatus(region) {
    const r = route();
    const mode = prompt.mode() === "shell" ? "  · shell" : "";
    let label = r.type === "home" ? " home" : ` session:${r.sessionID}`;
    if (data && r.type === "session") label += `  ${data.store.sessionStatusText(r.sessionID)}`;
    const right = "Ctrl-P commands  Ctrl-C exit ";
    region.line(0, fit(label + mode, Math.max(0, region.width - right.length), "left") + right, attr(theme, "textMuted"));
  }
  /**
   * Draw the centered permission/question modal box and its widget.
   * @param {Object} region - The full screen region.
   * @param {Object} ap - The active prompt widget ({kind, draw}).
   * @param {Object} ctx - Render context passed to the widget.
   * @returns {void}
   */
  function drawPromptModal(region, ap, ctx) {
    const w = Math.min(100, Math.max(24, region.width - 4));
    const h = Math.min(ap.kind === "permission" ? 24 : 12, Math.max(6, region.height - 4));
    const inner = centerBox(region, w, h, {
      title: ap.kind === "permission" ? "Permission" : "Question",
      fill: " ", fillAttr: attr(theme, "text"), attr: attr(theme, ap.kind === "permission" ? "warning" : "primary"),
    });
    ap.draw(inner, ctx);
  }
  /**
   * Draw the topmost overlay dialog (centered box + its widget), if any.
   * @param {Object} region - The full screen region.
   * @param {Object} ctx - Render context passed to the widget.
   * @returns {void}
   */
  function drawDialog(region, ctx) {
    const top = dialog.current();
    if (!top) return;
    const inner = centerBox(region, top.width, top.height, { title: top.title, fill: " ", fillAttr: attr(theme, "text"), attr: attr(theme, "primary") });
    top.widget.draw(inner, { ...ctx, attr: attr(theme, "text"), activeAttr: { inverse: true } });
  }
  /**
   * Draw the autocomplete dropdown above the prompt, when visible.
   * @param {Object} region - The full screen region.
   * @param {number} promptH - The prompt's height in rows.
   * @param {number} promptW - The prompt's width in columns.
   * @param {number} aoffset - The horizontal offset of the prompt (home centering).
   * @returns {void}
   */
  function drawAutocomplete(region, promptH, promptW, aoffset) {
    const ac = prompt.autocomplete;
    if (!ac.visible()) return;
    const n = Math.min(ac.items().length, 6);
    const overlayH = n + 2;
    const top = Math.max(0, region.height - STATUS_ROWS - promptH - overlayH);
    const inner = box(region.sub(aoffset, top, promptW, overlayH), { attr: attr(theme, "primary") });
    ac.draw(inner, { attr: attr(theme, "text"), activeAttr: { inverse: true } });
  }
  /**
   * Render the whole shell into a region: timeline/home + sidebar, prompt,
   * status row, then any autocomplete / modal / dialog overlays and toasts.
   * @param {Object} region - The full screen region.
   * @param {Object} ctx - Render context (cursor, etc.).
   * @returns {void}
   */
  function draw(region, ctx = {}) {
    const ap = activePrompt();
    const dialogOpen = dialogs().length > 0;
    const home = route().type === "home";
    const promptW = home ? Math.min(HOME_PROMPT_COLS, region.width) : region.width;
    const aoffset = home ? Math.max(0, Math.floor((region.width - promptW) / 2)) : 0;
    const promptH = prompt.height(promptW);
    column(region, [
      {
        size: "flex", draw: r => {
          if (home) return drawHomeBody(r);
          if (sidebar?.visible() && r.width > 50) {
            const sw = Math.min(36, Math.floor(r.width / 3));
            row(r, [{ size: "flex", draw: rr => timeline.draw(rr) }, { size: sw, draw: rr => sidebar.draw(rr) }]);
            return;
          }
          timeline.draw(r);
        },
      },
      { size: promptH, draw: r => prompt.draw(r.sub(aoffset, 0, promptW, r.height), ctx, { focused: !dialogOpen && !ap }) },
      { size: STATUS_ROWS, draw: drawStatus },
    ]);
    if (!ap) drawAutocomplete(region, promptH, promptW, aoffset);
    if (ap) drawPromptModal(region, ap, ctx);
    drawDialog(region, ctx);
    toast.draw(region);
  }

  /**
   * Start the backend (events + bootstrap) and sync the current session. No-op in stub mode.
   * @returns {Promise<void>}
   */
  async function init() {
    if (!data) return;
    try { await data.start(); await data.bootstrap(); if (route().type === "session") data.syncSession(route().sessionID); }
    catch (e) { toast.error(e); }
  }

  return { route, navigate, messages: timelineSource, pushMessage, prompt, timeline, toast, dialog, selection, sidebar, openCommands, openHelp, dispatch, handleMouse, draw, init, theme, data };
}

/**
 * Wire the shell model into a live terminal-kit app: route keys/mouse to the
 * shell, draw on repaint, and supply repaint/suspend/clipboard side effects.
 * @param {Object} opts - createShell options plus {terminal, mouse, onExit}.
 * @returns {Object} {app, shell}.
 */
export function mountShell(opts = {}) {
  let app;
  // Mouse on by default (wheel scroll + click + app drag-selection). Native
  // terminal copy still works via Shift+drag (terminals bypass the app mouse grab
  // while Shift is held). Pass mouse:false to opt out entirely.
  const mouse = opts.mouse ?? true;
  const shell = createShell({
    ...opts,
    onExit: () => { app?.stop(); opts.onExit?.(); },
    scheduleRepaint: ms => { const t = setTimeout(() => app?.repaint(), ms + 16); t?.unref?.(); },
    suspend: fn => app?.suspend(fn),     // hand the TTY to $EDITOR and back
    copyToClipboard: text => app?.term?.write?.(osc52(text)), // OSC 52 system-clipboard copy
  });
  app = createApp((region, ctx) => shell.draw(region, ctx), {
    terminal: opts.terminal, mouse,
    attr: { color: shell.theme.text, bgColor: shell.theme.background }, // clear screen to the theme bg
  });
  app.onKey((name, dt) => shell.dispatch(name, dt));
  app.onMouse((name, data) => shell.handleMouse(name, data));
  return { app, shell };
}

/**
 * OSC 52 "set clipboard" escape: base64 the text into the terminal's clipboard.
 * Works over SSH / tmux-aware terminals where shelling out to pbcopy/xclip can't.
 * @param {string} text - The text to place on the clipboard.
 * @returns {string} The OSC 52 escape sequence.
 */
export function osc52(text) {
  const b64 = Buffer.from(String(text ?? ""), "utf8").toString("base64");
  return `\x1b]52;c;${b64}\x07`;
}
