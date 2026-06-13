// Node-run tests for the vanilla data store (SDK-integration phase). Feeds a
// synthetic event stream (a real streaming chat turn) and asserts the derived
// timeline + status. No SDK/server.   node src/cli/cmd/tui/vanilla/data/store.test.js
import { createRoot, createRenderEffect } from "../../runtime/reactivity.js";
import { createDataStore } from "./store.js";

let passed = 0, failed = 0;
function eq(a, b, label) {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x === y) passed++; else { failed++; console.error(`FAIL ${label}: got ${x}, want ${y}`); }
}
function ok(c, label) { eq(!!c, true, label); }
const ev = (type, properties) => ({ type, properties });

// ids chosen so ascending string sort == chronological order (as the real
// Identifier.ascending guarantees)
const TURN = [
  ev("session.updated", { info: { id: "ses_001", title: "Test", time: { created: 1 } } }),
  ev("message.updated", { info: { id: "msg_001", sessionID: "ses_001", role: "user", time: { created: 1 } } }),
  ev("message.part.updated", { part: { id: "prt_001", messageID: "msg_001", type: "text", text: "hello" } }),
  ev("message.updated", { info: { id: "msg_002", sessionID: "ses_001", role: "assistant", time: { created: 2 } } }),
  ev("message.part.updated", { part: { id: "prt_002", messageID: "msg_002", type: "text", text: "" } }),
  ev("message.part.delta", { messageID: "msg_002", partID: "prt_002", field: "text", delta: "Hi" }),
  ev("message.part.delta", { messageID: "msg_002", partID: "prt_002", field: "text", delta: " there" }),
  ev("message.part.updated", { part: { id: "prt_003", messageID: "msg_002", type: "tool", tool: "read", state: { status: "running", title: "file.js" } } }),
];

// 1. streaming turn -> derived timeline + working status
{
  const store = createDataStore();
  store.applyBatch(TURN);
  ok(store.sessions().some(s => s.id === "ses_001"), "session recorded");
  eq(store.timeline("ses_001"), [
    { role: "user", parts: [{ type: "text", text: "hello" }] },
    { role: "assistant", parts: [{ type: "text", text: "Hi there" }, { type: "tool", name: "read", title: "file.js", status: "running" }] },
  ], "timeline maps messages+parts; delta concatenated streaming text");
  eq(store.sessionStatusText("ses_001"), "working", "status working while assistant message not completed");

  // tool completes (in-place part update) + assistant message completes
  store.applyBatch([
    ev("message.part.updated", { part: { id: "prt_003", messageID: "msg_002", type: "tool", tool: "read", state: { status: "completed", title: "file.js" } } }),
    ev("message.updated", { info: { id: "msg_002", sessionID: "ses_001", role: "assistant", time: { created: 2, completed: 3 } } }),
  ]);
  eq(store.timeline("ses_001")[1].parts[1].status, "completed", "tool part updated in place to completed");
  eq(store.sessionStatusText("ses_001"), "idle", "status idle once the assistant message completes");
}

// 2. reactivity: applyBatch bumps rev so a render effect re-runs
{
  const store = createDataStore();
  let runs = 0, lastCount = -1;
  createRoot(() => createRenderEffect(() => { runs++; lastCount = store.timeline("ses_x").length; }));
  eq([runs, lastCount], [1, 0], "initial effect run, empty timeline");
  store.applyBatch([
    ev("message.updated", { info: { id: "m1", sessionID: "ses_x", role: "user", time: {} } }),
    ev("message.part.updated", { part: { id: "p1", messageID: "m1", type: "text", text: "yo" } }),
  ]);
  eq([runs, lastCount], [2, 1], "one batch -> one re-run, timeline now has 1 message");
}

// 3. message.removed + session.deleted + part.removed
{
  const store = createDataStore();
  store.applyBatch(TURN);
  store.applyBatch([ev("message.part.removed", { messageID: "msg_002", partID: "prt_003" })]);
  eq(store.timeline("ses_001")[1].parts.length, 1, "part.removed drops the tool part");
  store.applyBatch([ev("message.removed", { sessionID: "ses_001", messageID: "msg_001" })]);
  eq(store.timeline("ses_001").length, 1, "message.removed drops the user message");
  store.applyBatch([ev("session.deleted", { info: { id: "ses_001" } })]);
  ok(!store.sessions().some(s => s.id === "ses_001"), "session.deleted removes the session");
}

// 4. permission + question request lifecycle
{
  const store = createDataStore();
  store.applyBatch([ev("permission.asked", { id: "perm_1", sessionID: "ses_001" })]);
  eq(store.permissions("ses_001").length, 1, "permission.asked recorded");
  store.applyBatch([ev("permission.replied", { sessionID: "ses_001", requestID: "perm_1" })]);
  eq(store.permissions("ses_001").length, 0, "permission.replied clears it");
  store.applyBatch([ev("question.asked", { id: "q_1", sessionID: "ses_001" })]);
  eq(store.questions("ses_001").length, 1, "question.asked recorded");
  store.applyBatch([ev("question.rejected", { sessionID: "ses_001", requestID: "q_1" })]);
  eq(store.questions("ses_001").length, 0, "question.rejected clears it");
}

// 5. todo + diff events feed the sidebar accessors
{
  const store = createDataStore();
  store.applyBatch([
    ev("todo.updated", { sessionID: "ses_001", todos: [{ content: "a", status: "pending" }, { content: "b", status: "completed" }] }),
    ev("session.diff", { sessionID: "ses_001", diff: { files: [{ path: "x.js", additions: 2 }] } }),
  ]);
  eq(store.todos("ses_001").length, 2, "todo.updated stored");
  eq(store.todos("ses_001")[1].status, "completed", "todo content preserved");
  eq(store.diff("ses_001").files[0].path, "x.js", "session.diff stored");
  store.applyBatch([ev("todo.updated", { sessionID: "ses_001", todos: [] })]);
  eq(store.todos("ses_001").length, 0, "todo.updated replaces wholesale");
}

console.log(`tui vanilla data-store tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
