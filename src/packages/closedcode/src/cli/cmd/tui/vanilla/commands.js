// Command + dialog registry for the vanilla TUI. This replaces shell.js's inline
// SLASH_COMMANDS array and its hard-coded openCommands()/runCommand() switch with
// a single data-driven list, mirroring the live routes/session command registry
// (which is dozens of compiled-Solid { title, value, slash, category, onSelect }
// entries). buildCommands(ctx) returns plain { label, value, slash?, category?,
// run() } records so the shell can: (a) open the command palette as a
// Dialogs.select over the labels, and (b) map a typed slash command -> run().
//
// Every command's run() is self-contained: it opens its own dialog(s) via the
// promise-returning families in dialogs.js (bound to ctx.dialog) and talks to the
// data layer (ctx.data.store for reads, ctx.data.sdk for raw mutations, plus the
// higher-level ctx.data actions). This keeps the shell free of command bodies and
// makes the whole registry headless-testable with a mock data/dialog/toast.
//
// ctx = {
//   data,        // vanilla/data layer (store + sdk + actions); inject a mock in tests
//   dialog,      // dialog manager { open(spec), close(), current() } for Dialogs.*
//   toast,       // createToast() instance: { show({message,variant}), error(e) }
//   route,       // () => current route ({ type:"home" } | { type:"session", sessionID })
//   navigate,    // (route) => void
//   selection,   // optional { model:{set(m),current()}, agent:{set(name),current()}, variant:{set(v),current()} }
//   onExit,      // optional () => void
//   theme, now,  // optional: passed through to dialogs/toasts (deterministic clock in tests)
// }
import * as Dialogs from "./dialogs.js";

// --- relative-time labels --------------------------------------------------
// Compact "5m ago" / "3h ago" / "2d ago" using ctx.now (injectable for tests).
export function relativeTime(ts, now = Date.now()) {
  if (!ts && ts !== 0) return "";
  const diff = Math.max(0, now - ts);
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

// Best-effort error -> message string for toasts.
const errMsg = e => (e instanceof Error ? e.message : String(e ?? "error"));

export function buildCommands(ctx = {}) {
  const { data, dialog, toast, navigate, selection, onExit } = ctx;
  const now = ctx.now ?? (() => Date.now());
  const route = ctx.route ?? (() => ({ type: "home" }));
  const theme = ctx.theme;
  // Shared select() options so every dialog uses the same theme/clock.
  const base = { theme, now: now };

  const store = data?.store;
  const sdk = data?.sdk;

  const currentSid = () => { const r = route(); return r && r.type === "session" ? r.sessionID : undefined; };
  const sessionByID = id => (store?.sessions() ?? []).find(s => s.id === id);

  // Resolve the "current" model: prefer an explicit selection, else the first
  // model the connected providers expose. Used by Compact (needs a model id).
  function firstModel() {
    for (const p of store?.providers() ?? []) {
      const mids = Object.keys(p.models ?? {});
      if (mids.length) return { providerID: p.id, modelID: mids[0] };
    }
    return undefined;
  }
  const currentModel = () => selection?.model?.current?.() ?? firstModel();

  const notify = (message, variant = "info") => toast?.show?.({ message, variant });

  // --------------------------------------------------------------------------
  // Command run() bodies. Each is async-friendly but returns a Promise the
  // caller may ignore; tests await the returned value to observe side effects.
  // --------------------------------------------------------------------------

  async function newSession() {
    // Going home starts a fresh session on the next prompt submit (the shell
    // creates the session lazily). This mirrors the live "New session" command.
    navigate?.({ type: "home" });
  }

  async function switchSession() {
    const sessions = store?.sessions() ?? [];
    if (!sessions.length) { notify("No sessions yet", "warning"); return; }
    // Most-recent first by updated time (fallback to id ordering).
    const sorted = [...sessions].sort((a, b) => (b.time?.updated ?? 0) - (a.time?.updated ?? 0));
    const options = sorted.map(s => ({
      label: `${s.title || s.id}  ·  ${relativeTime(s.time?.updated, now())}`,
      value: s.id,
    }));
    await Dialogs.select(dialog, {
      ...base, title: "Switch session", options,
      onSelect: it => { if (it) navigate?.({ type: "session", sessionID: it.value }); },
    });
  }

  async function renameSession() {
    const sid = currentSid();
    if (!sid) { notify("Open a session first", "warning"); return; }
    const session = sessionByID(sid);
    const title = await Dialogs.prompt(dialog, {
      ...base, title: "Rename session", message: "New title", initial: session?.title ?? "",
    });
    if (title == null || title === "") return; // escaped or empty
    try {
      await sdk.session.update({ sessionID: sid, title });
      notify("Session renamed", "success");
    } catch (e) { notify(errMsg(e), "error"); }
  }

  async function deleteSession() {
    const sid = currentSid();
    if (!sid) { notify("Open a session first", "warning"); return; }
    const session = sessionByID(sid);
    const ok = await Dialogs.confirm(dialog, {
      ...base, title: "Delete session",
      message: `Delete "${session?.title || sid}"? This cannot be undone.`,
      confirmLabel: "Delete", cancelLabel: "Cancel",
    });
    if (ok !== true) return;
    try {
      await sdk.session.delete({ sessionID: sid });
      notify("Session deleted", "success");
      navigate?.({ type: "home" });
    } catch (e) { notify(errMsg(e), "error"); }
  }

  async function switchModel() {
    const options = [];
    for (const p of store?.providers() ?? []) {
      for (const [mid, m] of Object.entries(p.models ?? {})) {
        options.push({ label: `${m.name ?? mid}  ·  ${p.name ?? p.id}`, value: { providerID: p.id, modelID: mid } });
      }
    }
    if (!options.length) { notify("No providers connected", "warning"); return; }
    await Dialogs.select(dialog, {
      ...base, title: "Switch model", options,
      onSelect: it => {
        if (!it) return;
        selection?.model?.set?.(it.value);
        notify(`Model: ${it.value.modelID}`, "success");
      },
    });
  }

  async function switchAgent() {
    const agents = (store?.agents() ?? []).filter(a => !a.hidden);
    if (!agents.length) { notify("No agents available", "warning"); return; }
    const options = agents.map(a => ({ label: a.name, value: a.name }));
    await Dialogs.select(dialog, {
      ...base, title: "Switch agent", options,
      onSelect: it => {
        if (!it) return;
        selection?.agent?.set?.(it.value);
        notify(`Agent: ${it.value}`, "success");
      },
    });
  }

  async function switchVariant() {
    const model = currentModel();
    // Variants live on the selected model's provider entry: models[mid].variants.
    let variants = [];
    if (model) {
      const provider = (store?.providers() ?? []).find(p => p.id === model.providerID);
      // model.variants is a Record (object keyed by name), not an array — match
      // selection.js / context/local.js which read it via Object.keys.
      variants = Object.keys(provider?.models?.[model.modelID]?.variants ?? {});
    }
    const options = [{ label: "Default", value: undefined }, ...variants.map(v => ({ label: v, value: v }))];
    await Dialogs.select(dialog, {
      ...base, title: "Switch variant", options,
      onSelect: it => {
        if (!it) return; // escaped
        selection?.variant?.set?.(it.value);
        notify(`Variant: ${it.value ?? "default"}`, "success");
      },
    });
  }

  async function switchTheme() {
    // Placeholder theme list: the real ThemeProvider isn't wired into vanilla yet
    // (see theme.js), so this offers a static set and just toasts the choice.
    const options = ["closedcode", "dark", "light", "system"].map(t => ({ label: t, value: t }));
    await Dialogs.select(dialog, {
      ...base, title: "Switch theme", options,
      onSelect: it => { if (it) notify(`Theme: ${it.value} (preview)`, "info"); },
    });
  }

  async function viewStatus() {
    const sid = currentSid();
    const sessions = store?.sessions() ?? [];
    const providers = store?.providers() ?? [];
    const agents = store?.agents() ?? [];
    const model = currentModel();
    const lines = [
      `Status: ${store?.status?.() ?? "unknown"}`,
      `Sessions: ${sessions.length}`,
      `Providers: ${providers.length}`,
      `Agents: ${agents.length}`,
      `Model: ${model ? `${model.providerID}/${model.modelID}` : "(none)"}`,
      `Agent: ${selection?.agent?.current?.() ?? agents[0]?.name ?? "(default)"}`,
    ];
    if (sid) lines.push(`Session: ${sessionByID(sid)?.title || sid} — ${store?.sessionStatusText?.(sid) ?? "idle"}`);
    await Dialogs.alert(dialog, { ...base, title: "Status", message: lines.join("\n") });
  }

  async function exportSession() {
    // Placeholder: the live export writes a transcript file; here we acknowledge.
    await Dialogs.alert(dialog, {
      ...base, title: "Export",
      message: "Export is not available in this build yet.",
    });
  }

  async function connectProvider() {
    // Placeholder: provider auth/connect is out of scope for the vanilla shell.
    await Dialogs.alert(dialog, {
      ...base, title: "Connect provider",
      message: "Provider connection is configured outside the TUI in this build.",
    });
  }

  async function compact() {
    const sid = currentSid();
    if (!sid) { notify("Open a session first", "warning"); return; }
    const model = currentModel();
    if (!model) { notify("Connect a provider to summarize this session", "warning"); return; }
    try {
      await sdk.session.summarize({ sessionID: sid, modelID: model.modelID, providerID: model.providerID });
      notify("Compacting session…", "info");
    } catch (e) { notify(errMsg(e), "error"); }
  }

  async function share() {
    const sid = currentSid();
    if (!sid) { notify("Open a session first", "warning"); return; }
    // Placeholder-ish: calls the SDK but does not handle clipboard/consent flow.
    try {
      const res = await sdk.session.share({ sessionID: sid });
      const url = res?.data?.share?.url;
      notify(url ? `Shared: ${url}` : "Session shared", "success");
    } catch (e) { notify(errMsg(e), "error"); }
  }

  async function unshare() {
    const sid = currentSid();
    if (!sid) { notify("Open a session first", "warning"); return; }
    try {
      await sdk.session.unshare({ sessionID: sid });
      notify("Session unshared", "success");
    } catch (e) { notify(errMsg(e), "error"); }
  }

  async function help() {
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
    await Dialogs.alert(dialog, { ...base, title: "Help", message: lines.join("\n") });
  }

  // Toggle tool-diff rendering between unified (stacked) and split (side-by-side).
  // The shell owns the diffView signal + toggle; we just flip it and report.
  async function toggleDiffView() {
    ctx.toggleDiffView?.();
    notify(`Diff view: ${ctx.diffView?.() ?? "unified"}`, "info");
  }

  // Run a skill: skills are store commands with source === "skill". Opens a
  // select over them and submits the chosen one as a slash command via the data
  // layer (which creates a session lazily when there is none — see data/index.js
  // submit()). Defensive: no throw if store/submit are absent.
  async function runSkill() {
    const skills = (store?.commands?.() ?? []).filter(c => c.source === "skill");
    if (!skills.length) { notify("No skills available", "warning"); return; }
    const options = skills.map(c => ({
      label: c.name + (c.description ? "  ·  " + c.description : ""),
      value: c.name,
    }));
    await Dialogs.select(dialog, {
      ...base, title: "Run a skill", options,
      onSelect: it => {
        if (!it) return; // escaped
        // submit() creates a session when currentSid() is undefined, so it is safe
        // to call unconditionally; fall back to a toast if the data layer lacks it.
        if (typeof data?.submit === "function") {
          Promise.resolve(data.submit(currentSid(), "/" + it.value, { agent: selection?.agent?.current?.() })).catch(e => notify(errMsg(e), "error"));
        } else {
          notify(`Skill: ${it.value}`, "info");
        }
      },
    });
  }

  // MCP servers: read-only status view. The sdk.mcp.status method may be absent
  // in some builds (optional chaining + .catch), and the response shape is not
  // guaranteed — handle both a name->status object map and an array of records.
  async function mcpStatus() {
    const res = await ctx.data?.sdk?.mcp?.status?.({}).catch(() => undefined);
    const raw = res?.data ?? res;
    const servers = [];
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      // Object map: { [name]: status } where status is a string or a record.
      for (const [name, v] of Object.entries(raw)) {
        const status = typeof v === "string" ? v : (v?.status ?? v?.state ?? (v?.connected ? "connected" : "disconnected"));
        servers.push({ name, status: String(status ?? "unknown") });
      }
    } else if (Array.isArray(raw)) {
      // Array of records: { name|id, status|state|connected }.
      for (const v of raw) {
        const name = v?.name ?? v?.id ?? "(unknown)";
        const status = v?.status ?? v?.state ?? (v?.connected ? "connected" : "disconnected");
        servers.push({ name: String(name), status: String(status ?? "unknown") });
      }
    }
    if (!servers.length) {
      await Dialogs.alert(dialog, { ...base, title: "MCP servers", message: "No MCP servers connected." });
      return;
    }
    const options = servers.map(s => ({ label: `${s.name}  ·  ${s.status}`, value: s.name }));
    await Dialogs.select(dialog, {
      ...base, title: "MCP servers", options,
      onSelect: it => {
        if (!it) return; // escaped
        const s = servers.find(x => x.name === it.value);
        notify(`${it.value}: ${s?.status ?? "unknown"}`, "info");
      },
    });
  }

  async function exit() { onExit?.(); }

  // --------------------------------------------------------------------------
  // The registry. `slash` is the typed name (e.g. /rename); `category` groups
  // entries in the palette; `value` is a stable id for dispatch. Order here is
  // the palette display order.
  // --------------------------------------------------------------------------
  return [
    { label: "New session", value: "session.new", slash: "new", category: "Session", run: newSession },
    { label: "Switch session", value: "session.switch", slash: "sessions", category: "Session", run: switchSession },
    { label: "Rename session", value: "session.rename", slash: "rename", category: "Session", run: renameSession },
    { label: "Delete session", value: "session.delete", slash: "delete", category: "Session", run: deleteSession },
    { label: "Compact session", value: "session.compact", slash: "compact", category: "Session", run: compact },
    { label: "Share session", value: "session.share", slash: "share", category: "Session", run: share },
    { label: "Unshare session", value: "session.unshare", slash: "unshare", category: "Session", run: unshare },
    { label: "Export session", value: "session.export", slash: "export", category: "Session", run: exportSession },
    { label: "Switch model", value: "model.switch", slash: "models", category: "Config", run: switchModel },
    { label: "Switch agent", value: "agent.switch", slash: "agents", category: "Config", run: switchAgent },
    { label: "Switch variant", value: "variant.switch", slash: "variant", category: "Config", run: switchVariant },
    { label: "Switch theme", value: "theme.switch", slash: "theme", category: "Config", run: switchTheme },
    { label: "Connect provider", value: "provider.connect", slash: "connect", category: "Config", run: connectProvider },
    { label: "Toggle split / unified diff", value: "diff.view", slash: "diff", category: "View", run: toggleDiffView },
    { label: "Run a skill", value: "skill.run", slash: "skills", category: "Tools", run: runSkill },
    { label: "MCP servers", value: "mcp.status", slash: "mcp", category: "Tools", run: mcpStatus },
    { label: "View status", value: "app.status", slash: "status", category: "App", run: viewStatus },
    { label: "Help", value: "app.help", slash: "help", category: "App", run: help },
    { label: "Exit", value: "app.exit", slash: "exit", category: "App", run: exit },
  ];
}
