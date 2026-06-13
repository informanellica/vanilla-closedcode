// Integration tests: the vanilla shell driven by the REAL data layer against a
// mock SDK + injected event source — the full chat loop (submit -> session.create/
// prompt -> server events stream -> timeline render) without a server or TTY.
//   node src/cli/cmd/tui/vanilla/shell-data.test.js
import tk from "terminal-kit";
import { makeRegion } from "../runtime/layout.js";
import { createShell } from "./shell.js";
import { createDataLayer } from "./data/index.js";

let passed = 0, failed = 0;
function eq(a, b, label) { if (JSON.stringify(a) === JSON.stringify(b)) passed++; else { failed++; console.error(`FAIL ${label}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } }
function ok(c, label) { eq(!!c, true, label); }
const settle = () => new Promise(r => setTimeout(r, 0));
const char = () => ({ isCharacter: true });
const type = (shell, str) => { for (const ch of str) shell.dispatch(ch, char()); };
function screenText(shell, w = 80, h = 24) {
  const buf = new tk.ScreenBuffer({ width: w, height: h });
  buf.fill({ char: " " });
  shell.draw(makeRegion(buf, 0, 0, w, h), { focusCursor: () => {} });
  const rows = [];
  for (let y = 0; y < h; y++) { let s = ""; for (let x = 0; x < w; x++) s += buf.get({ x, y }).char; rows.push(s.replace(/\s+$/, "")); }
  return rows.join("\n");
}

function mockBackend() {
  const calls = [];
  let handler = null;
  const rec = (name, resp) => async args => { calls.push([name, args]); return resp ? resp(args) : {}; };
  const sdk = {
    session: {
      create: rec("session.create", () => ({ data: { id: "ses_real" } })),
      prompt: rec("session.prompt"),
      shell: rec("session.shell"),
      command: rec("session.command"),
      abort: rec("session.abort"),
      get: rec("session.get", ({ sessionID }) => ({ data: { id: sessionID, title: "T", time: {} } })),
      messages: rec("session.messages", () => ({ data: [] })),
      list: rec("session.list", () => ({ data: [] })),
    },
    permission: { reply: rec("permission.reply") },
    question: { reply: rec("question.reply"), reject: rec("question.reject") },
    find: { files: rec("find.files", () => ({ data: ["src/app.js", "src/main.js"] })) },
    config: { providers: rec("config.providers", () => ({ data: { providers: [{ id: "anthropic", name: "Anthropic", models: { "opus-4-8": { name: "Opus 4.8" } } }], default: {} } })) },
    app: { agents: rec("app.agents", () => ({ data: [{ name: "build" }, { name: "plan" }] })) },
    command: { list: rec("command.list", () => ({ data: [{ name: "compact", description: "Compact the session" }, { name: "sk", source: "skill" }] })) },
  };
  const events = { subscribe: h => { handler = h; return () => {}; } };
  const emit = (typeName, properties) => handler({ type: typeName, properties });
  return { sdk, events, emit, calls };
}
const IDS = { message: () => "msg_x", part: () => "prt_x" };
const sync = fn => fn();
function makeShell() {
  const backend = mockBackend();
  const data = createDataLayer({ sdk: backend.sdk, ids: IDS, schedule: sync, events: backend.events });
  const shell = createShell({ data });
  return { shell, data, backend };
}

// 1. full chat loop: submit -> create+prompt -> streamed events -> rendered timeline
{
  const { shell, backend } = makeShell();
  await shell.init(); await settle();
  type(shell, "hello server");
  shell.dispatch("ENTER");
  await settle();
  const names = backend.calls.map(c => c[0]);
  ok(names.includes("session.create"), "submit created a session via the SDK");
  ok(names.includes("session.prompt"), "submit sent the prompt via the SDK");
  eq(shell.route(), { type: "session", sessionID: "ses_real" }, "navigated to the real session id");
  // server streams the turn
  backend.emit("message.updated", { info: { id: "msg_001", sessionID: "ses_real", role: "user", time: { created: 1 } } });
  backend.emit("message.part.updated", { part: { id: "prt_001", messageID: "msg_001", type: "text", text: "hello server" } });
  backend.emit("message.updated", { info: { id: "msg_002", sessionID: "ses_real", role: "assistant", time: { created: 2 } } });
  backend.emit("message.part.updated", { part: { id: "prt_002", messageID: "msg_002", type: "text", text: "" } });
  backend.emit("message.part.delta", { messageID: "msg_002", partID: "prt_002", field: "text", delta: "stream" });
  backend.emit("message.part.delta", { messageID: "msg_002", partID: "prt_002", field: "text", delta: "ed reply" });
  const screen = screenText(shell);
  ok(screen.includes("hello server"), "user message rendered from server events");
  ok(screen.includes("streamed reply"), "assistant deltas concatenated and rendered");
  ok(screen.includes("working"), "status bar shows working while assistant incomplete");
  backend.emit("message.updated", { info: { id: "msg_002", sessionID: "ses_real", role: "assistant", time: { created: 2, completed: 3 } } });
  ok(screenText(shell).includes("idle"), "status bar shows idle after completion");
}

// 2. '/' autocomplete merges server commands (skill source skipped)
{
  const { shell } = makeShell();
  await shell.init(); await settle();
  type(shell, "/comp");
  ok(shell.prompt.autocomplete.visible(), "autocomplete open for /comp");
  const labels = shell.prompt.autocomplete.items().map(i => i.label);
  ok(labels.includes("compact"), "server command 'compact' suggested");
  ok(!labels.includes("sk"), "skill-source command not suggested");
}

// 3. models dialog lists real providers; selection updates the meta line
{
  const { shell } = makeShell();
  await shell.init(); await settle();
  type(shell, "/models");
  shell.prompt.autocomplete.hide();
  shell.dispatch("ENTER");
  ok(screenText(shell).includes("Opus 4.8"), "models dialog lists the provider's model");
  shell.dispatch("ENTER"); // pick it
  await settle();
  ok(screenText(shell).includes("Opus 4.8"), "meta line reflects the selected model (display name)");
}

// 4. '@' file autocomplete queries sdk.find.files
{
  const { shell, backend } = makeShell();
  await shell.init(); await settle();
  type(shell, "@main");
  await settle();
  ok(backend.calls.some(c => c[0] === "find.files"), "@-mention queried sdk.find.files");
  ok(shell.prompt.autocomplete.visible(), "file dropdown opens once the async result lands");
  const labels = shell.prompt.autocomplete.items().map(i => i.label);
  ok(labels.includes("src/main.js"), "file suggestions include the SDK result");
  shell.dispatch("ENTER"); // accept the active suggestion
  ok(shell.prompt.value().startsWith("@src/"), "accepting splices the @path into the prompt");
}

// 5. shell mode routes to session.shell with the real session
{
  const { shell, backend } = makeShell();
  await shell.init(); await settle();
  shell.navigate({ type: "session", sessionID: "ses_real" });
  shell.dispatch("!", char());
  type(shell, "ls");
  shell.dispatch("ENTER");
  await settle();
  const call = backend.calls.find(c => c[0] === "session.shell");
  ok(call, "shell-mode submit called session.shell");
  eq(call[1].command, "ls", "shell command text passed through");
}

// 6. permission request -> modal captures input + replies via the SDK
{
  const { shell, backend } = makeShell();
  await shell.init(); await settle();
  shell.navigate({ type: "session", sessionID: "ses_real" });
  backend.emit("permission.asked", { id: "perm_1", sessionID: "ses_real", tool: "edit",
    metadata: { filepath: "src/app.js", diff: "--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new" } });
  const screen = screenText(shell);
  ok(screen.includes("Permission"), "permission modal shown");
  ok(screen.includes("src/app.js"), "modal shows the filepath");
  ok(screen.includes("+ new") && screen.includes("- old"), "modal renders the diff");
  ok(screen.includes("Allow once") && screen.includes("Reject"), "modal shows the choices");
  // the text prompt is captured: typing does not reach it
  type(shell, "should be ignored");
  eq(shell.prompt.value(), "", "prompt is disabled while a permission is pending");
  shell.dispatch("DOWN"); // Allow once -> Allow always
  shell.dispatch("ENTER");
  await settle();
  const call = backend.calls.find(c => c[0] === "permission.reply");
  ok(call, "permission.reply called");
  eq([call[1].requestID, call[1].reply], ["perm_1", "always"], "replied 'always' for the request");
}

// 7. permission Escape -> reject
{
  const { shell, backend } = makeShell();
  await shell.init(); await settle();
  shell.navigate({ type: "session", sessionID: "ses_real" });
  backend.emit("permission.asked", { id: "perm_2", sessionID: "ses_real", tool: "bash", metadata: {} });
  shell.dispatch("ESCAPE");
  await settle();
  const call = backend.calls.find(c => c[0] === "permission.reply");
  eq(call[1].reply, "reject", "Escape on a permission rejects it");
}

// 8. question request -> options select replies with answers
{
  const { shell, backend } = makeShell();
  await shell.init(); await settle();
  shell.navigate({ type: "session", sessionID: "ses_real" });
  backend.emit("question.asked", { id: "q_1", sessionID: "ses_real",
    questions: [{ text: "Pick one", options: [{ label: "Yes", value: "yes" }, { label: "No", value: "no" }] }] });
  const screen = screenText(shell);
  ok(screen.includes("Question") && screen.includes("Pick one"), "question modal + text shown");
  ok(screen.includes("Yes") && screen.includes("No"), "question options shown");
  shell.dispatch("DOWN"); // Yes -> No
  shell.dispatch("ENTER");
  await settle();
  const call = backend.calls.find(c => c[0] === "question.reply");
  eq([call[1].requestID, call[1].answers], ["q_1", [["no"]]], "question.reply carries the chosen answer");
}

console.log(`tui vanilla shell-data tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
