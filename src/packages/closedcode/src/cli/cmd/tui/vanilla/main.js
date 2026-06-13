// Vanilla TUI entry (Stage T4 — the runnable flip). Drop-in for app.js's tui():
// same input shape, returns a Promise that resolves on exit. Set
// CLOSEDCODE_VANILLA_TUI=1 to route thread.js / attach.js here instead of the
// @opentui app — so the immediate-mode shell actually RUNS on terminal-kit with
// ZERO @opentui / solid-js / native code in its module graph (only terminal-kit
// + the first-party runtime).
//
// SCOPE: this boots the T3 view layer (logo / prompt+autocomplete / timeline /
// dialogs / toast). It is NOT yet wired to the SDK/sync (sessions, streaming,
// real model/agent lists) — that integration is the remaining work documented in
// docs/milestones/solid-free-tui.md before @opentui can be removed outright. The
// default path (no flag) stays the fully-featured @opentui app, so nothing
// regresses.
import { mountShell } from "./shell.js";

export function tui(input = {}) {
  const args = input.args ?? {};
  return new Promise(resolve => {
    const { app, shell } = mountShell({
      agent: args.agent ?? "build",
      model: args.model,
      onExit: () => resolve(),
    });
    // Prefill the prompt from --prompt (does not auto-submit: no SDK yet). Use
    // setText so a leading "!" doesn't trip shell mode.
    if (args.prompt) shell.prompt.setText(String(args.prompt));
    app.start();
  });
}
