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
import { mountShell } from "./shell.js";
import { createDataLayer } from "./data/index.js";

export function tui(input = {}) {
  const args = input.args ?? {};
  return new Promise(async resolve => {
    let data;
    if (input.url) {
      try {
        // Lazy: keeps the stub path from loading sdk/v2 at all.
        const { createConnection } = await import("./data/connection.js");
        data = createDataLayer(createConnection(input));
      } catch { data = undefined; /* stub fallback */ }
    }
    const { app, shell } = mountShell({
      data,
      agent: args.agent,
      initialRoute: args.sessionID ? { type: "session", sessionID: args.sessionID } : undefined,
      onExit: () => { data?.stop(); resolve(); },
    });
    // Prefill the prompt from --prompt (no auto-submit yet). setText so a
    // leading "!" doesn't trip shell mode.
    if (args.prompt) shell.prompt.setText(String(args.prompt));
    app.start();
    void shell.init(); // events + bootstrap (no-op in stub mode)
  });
}
