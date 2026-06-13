// Node-run tests for the vanilla TUI app shell (Stage T3, stage 1). No TTY: the
// shell model's draw() renders into a DETACHED terminal-kit ScreenBuffer and we
// drive it with dispatch(), exactly as runtime.test.mjs does for the toolkit.
//   node src/cli/cmd/tui/vanilla/shell.test.mjs   (from packages/closedcode)
import tk from "terminal-kit";
import { createRoot, createRenderEffect, createSignal } from "../runtime/reactivity.js";
import { makeRegion } from "../runtime/layout.js";
import { createShell } from "./shell.js";

let passed = 0, failed = 0;
function eq(a, b, label) {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x === y) passed++; else { failed++; console.error(`FAIL ${label}: got ${x}, want ${y}`); }
}
function ok(cond, label) { eq(!!cond, true, label); }

function rowText(buf, y, w) {
  let s = "";
  for (let i = 0; i < w; i++) s += buf.get({ x: i, y }).char;
  return s.replace(/\s+$/, "");
}
function screenText(buf, w, h) {
  const rows = [];
  for (let y = 0; y < h; y++) rows.push(rowText(buf, y, w));
  return rows.join("\n");
}
// Render the shell once into a fresh detached buffer and return { buf, w, h }.
function render(shell, w = 80, h = 24) {
  const buf = new tk.ScreenBuffer({ width: w, height: h });
  buf.fill({ char: " " });
  shell.draw(makeRegion(buf, 0, 0, w, h), { focusCursor: () => {} });
  return { buf, w, h };
}
const char = () => ({ isCharacter: true });
const type = (shell, str) => { for (const ch of str) shell.dispatch(ch, char()); };

// 1. home screen: logo + hint + prompt placeholder + status bar
{
  const shell = createShell();
  const { buf, w, h } = render(shell);
  const screen = screenText(buf, w, h);
  ok(screen.includes("Type a message and press Enter"), "home hint rendered");
  ok(screen.includes("Ask anything"), "home prompt placeholder rendered");
  ok(rowText(buf, h - 1, w).includes("home"), "status bar shows route 'home'");
  ok(rowText(buf, h - 1, w).includes("commands"), "status bar shows hints");
  // logo glyph row present (block chars from the wordmark)
  ok(/[█▀▄]/.test(screen), "static logo glyphs rendered");
}

// 2. typing + submit: navigates home->session and records the turn
{
  const shell = createShell();
  type(shell, "hello");
  eq(shell.prompt.value(), "hello", "prompt accumulates typed text");
  shell.dispatch("ENTER");
  eq(shell.route().type, "session", "submit from home navigates to session");
  eq(shell.messages().length, 2, "submit records user + assistant turn");
  eq(shell.messages()[0], { role: "user", parts: [{ type: "text", text: "hello" }] }, "first message is the user prompt (parts)");
  eq(shell.prompt.value(), "", "prompt clears after submit");
  // session body shows the message
  const { buf, w, h } = render(shell);
  ok(screenText(buf, w, h).includes("hello"), "timeline renders the user message");
}

// 3. CJK prompt input survives (code-point editing + width)
{
  const shell = createShell();
  type(shell, "日本語");
  eq(shell.prompt.value(), "日本語", "CJK typed into prompt");
  shell.dispatch("BACKSPACE");
  eq(shell.prompt.value(), "日本", "BACKSPACE removes one fullwidth code point");
}

// 4. command palette: Ctrl-P opens a dialog layer; select navigates
{
  const shell = createShell();
  shell.dispatch("CTRL_P");
  ok(shell.dialog.current(), "Ctrl-P opens a dialog");
  eq(shell.dialog.current().title, "Commands", "dialog is the command palette");
  // dialog draws a centered bordered box with the title + a command label
  const { buf, w, h } = render(shell);
  const screen = screenText(buf, w, h);
  ok(screen.includes("Commands"), "dialog title rendered");
  ok(screen.includes("New session"), "command list item rendered");
  ok(screen.includes("╭"), "dialog border rendered");
  // navigate: Down to "Go home" (index 1), Enter -> runs it + closes
  shell.navigate({ type: "session", sessionID: "x" });
  shell.dispatch("DOWN");
  shell.dispatch("ENTER");
  eq(shell.dialog.current(), undefined, "selecting a command closes the dialog");
  eq(shell.route().type, "home", "'Go home' command navigated home");
}

// 5. layer stack: Escape closes only the top dialog, not the app
{
  const shell = createShell();
  shell.navigate({ type: "session", sessionID: "x" });
  shell.dispatch("CTRL_P");
  ok(shell.dialog.current(), "dialog open");
  shell.dispatch("ESCAPE");
  eq(shell.dialog.current(), undefined, "Escape closes the dialog");
  eq(shell.route().type, "session", "Escape on a dialog does NOT also leave the session");
}

// 6. Escape on a session with an empty prompt returns home
{
  const shell = createShell();
  shell.navigate({ type: "session", sessionID: "x" });
  shell.dispatch("ESCAPE");
  eq(shell.route().type, "home", "Escape (empty prompt) backs out to home");
}

// 7. reactivity: a render effect repaints when shell state changes (createApp model)
{
  const buf = new tk.ScreenBuffer({ width: 80, height: 24 });
  const shell = createShell();
  let paints = 0;
  createRoot(() => {
    createRenderEffect(() => {
      paints++;
      buf.fill({ char: " " });
      shell.draw(makeRegion(buf, 0, 0, 80, 24), { focusCursor: () => {} });
    });
  });
  const before = paints;
  shell.dispatch("CTRL_P"); // opens dialog -> dialogs() signal changes -> repaint
  ok(paints > before, "opening a dialog triggers a reactive repaint");
  ok(screenText(buf, 80, 24).includes("Commands"), "repaint reflects the new dialog");
}

// 8. prompt autocomplete: "/" opens command suggestions; Down+Enter accepts
{
  const shell = createShell();
  type(shell, "/");
  ok(shell.prompt.autocomplete.visible(), "'/' opens command autocomplete");
  ok(shell.prompt.autocomplete.items().some(i => i.label === "help"), "command suggestions include 'help'");
  const { buf, w, h } = render(shell);
  ok(screenText(buf, w, h).includes("new"), "autocomplete dropdown rendered above the prompt");
  shell.dispatch("DOWN"); // new -> help
  shell.dispatch("ENTER"); // accept
  eq(shell.prompt.value(), "/help ", "accepting a suggestion replaces the token");
  eq(shell.prompt.autocomplete.visible(), false, "autocomplete closes after accept");
}

// 9. shell mode: "!" at the start toggles shell mode; Escape exits it
{
  const shell = createShell();
  shell.dispatch("!", char());
  eq(shell.prompt.mode(), "shell", "'!' at offset 0 enters shell mode");
  eq(shell.prompt.value(), "", "'!' is consumed, not inserted");
  shell.dispatch("ESCAPE");
  eq(shell.prompt.mode(), "normal", "Escape exits shell mode (does not leave the screen)");
}

// 10. prompt history: submit, then Up recalls the previous prompt
{
  const shell = createShell();
  type(shell, "first question");
  shell.dispatch("ENTER");
  eq(shell.prompt.value(), "", "prompt cleared after submit");
  shell.dispatch("UP"); // at offset 0 -> history
  eq(shell.prompt.value(), "first question", "Up recalls the previous prompt from history");
}

// 11. slash command on submit runs the command instead of posting
{
  const shell = createShell();
  type(shell, "/help");
  shell.prompt.autocomplete.hide(); // ensure Enter submits rather than accepts
  shell.dispatch("ENTER");
  ok(shell.dialog.current()?.title === "Help", "submitting /help runs the Help command");
  eq(shell.messages().length, 0, "slash command did not post a message");
}

// 12. timeline scroll: PageUp scrolls back when content overflows
{
  const shell = createShell();
  shell.navigate({ type: "session", sessionID: "x" });
  for (let i = 0; i < 40; i++) shell.pushMessage({ role: "assistant", parts: [{ type: "text", text: "line " + i }] });
  render(shell, 80, 12); // establishes the viewport height
  eq(shell.timeline.offset(), 0, "timeline starts bottom-pinned");
  shell.dispatch("PAGE_UP");
  render(shell, 80, 12);
  ok(shell.timeline.offset() > 0, "PageUp scrolls the timeline back");
}

// 13. toast overlay renders over the shell
{
  const shell = createShell();
  shell.toast.show({ message: "ping", variant: "info", duration: 9999 });
  const { buf, w, h } = render(shell);
  ok(screenText(buf, w, h).includes("ping"), "shell composites the toast overlay");
}

// 14. Ctrl-C exits even while a dialog captures input (global key)
{
  let exited = false;
  const shell = createShell({ onExit: () => (exited = true) });
  shell.dispatch("CTRL_P"); // open command palette (captures all input)
  ok(shell.dialog.current(), "dialog open and capturing");
  shell.dispatch("CTRL_C");
  ok(exited, "Ctrl-C still exits with a dialog open (was a dead key before)");
}

console.log(`tui vanilla shell tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
