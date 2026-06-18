// Vanilla TUI entry (Stage T4 flip + SDK integration). Drop-in for app.js's
// tui(): same input shape, returns a Promise that resolves on exit. Set
// CLOSEDCODE_VANILLA_TUI=1 to route thread.js / attach.js here instead of the
// @opentui app — the immediate-mode shell runs on terminal-kit with ZERO
// @opentui / solid-js / native code in its module graph.
//
// With input.url present this connects to the REAL backend: createConnection
// builds the sdk/v2 HTTP+SSE client and the data layer streams server events
// into the shell (real sessions, prompt submit, providers/agents/commands,
// @-file search). Without a url (or if the client fails to construct) it falls
// back to the self-contained stub shell. Feature parity vs the @opentui app is
// still partial — see docs/milestones/solid-free-tui.md "Remaining work".
/**
 * Vanilla TUI entry — drop-in for app.js's tui(): mounts the immediate-mode shell, optionally wiring the real SDK backend, and resolves on exit.
 * @module closedcode/cli/cmd/tui/vanilla/main
 */
import { mountShell } from "./shell.js";
import { createDataLayer } from "./data/index.js";

/**
 * Launch the vanilla immediate-mode TUI.
 * With input.url present, connects to the real backend (HTTP+SSE client + data
 * layer + persisted selection); otherwise falls back to the self-contained stub shell.
 * @param {Object} [input] - Entry input (same shape as app.js's tui()).
 * @param {Object} [input.args] - CLI args ({ agent, sessionID, prompt, model, continue, fork }).
 * @param {string} [input.url] - Backend URL; when set, the real SDK connection is used.
 * @returns {Promise<void>} Resolves when the TUI exits.
 */
export function tui(input = {}) {
  const args = input.args ?? {};
  return new Promise(async resolve => {
    let data;
    let selectionStorage;
    if (input.url) {
      try {
        // Lazy: keeps the stub path from loading sdk/v2 at all.
        const { createConnection } = await import("./data/connection.js");
        data = createDataLayer(createConnection(input));
        // Persist model/agent/variant + favorites across runs (real backend only;
        // the stub shell has nothing meaningful to persist). Best-effort: resolve
        // the app config dir and hand it to the file-backed adapter.
        const { createSelectionStorage } = await import("./data/selection-storage.js");
        const { Global } = await import("core/global");
        selectionStorage = createSelectionStorage({ dir: Global?.Path?.config });
      } catch { data = data ?? undefined; /* stub fallback / no persistence */ }
    }
    const { app, shell } = mountShell({
      data,
      selectionStorage,
      agent: args.agent,
      initialRoute: args.sessionID ? { type: "session", sessionID: args.sessionID } : undefined,
      onExit: () => { data?.stop(); resolve(); },
    });
    // Prefill the prompt from --prompt (no auto-submit yet). setText so a
    // leading "!" doesn't trip shell mode.
    if (args.prompt) shell.prompt.setText(String(args.prompt));
    app.start();
    // events + bootstrap (no-op in stub mode), then honor the launch flags that
    // need the loaded provider/session lists: --model preselects the model,
    // --continue resumes the most recent session, and --fork opens a fork of the
    // resolved session (an explicit --session already set the initial route above).
    void shell.init().then(async () => {
      if (!data) return;
      // --model provider/model: preselect once providers are loaded.
      if (typeof args.model === "string" && args.model.includes("/")) {
        const slash = args.model.indexOf("/");
        shell.selection?.model.set({ providerID: args.model.slice(0, slash), modelID: args.model.slice(slash + 1) });
      }
      // Resolve the session to open: explicit --session (already the initial
      // route), else --continue resumes the most recent session.
      let target = args.sessionID;
      if (!target && args.continue) {
        const sessions = data.store.sessions?.() ?? [];
        target = sessions[sessions.length - 1]?.id; // sorted ascending by id (time-ordered)
      }
      // --fork: fork the resolved session into a new one and open that instead.
      // (the command layer already enforces that --fork needs --continue/--session.)
      if (args.fork && target) {
        try { target = await data.fork(target); } catch (e) { shell.toast.error(e); }
      }
      if (target && (shell.route().type !== "session" || shell.route().sessionID !== target)) {
        shell.navigate({ type: "session", sessionID: target });
      }
    });
  });
}
