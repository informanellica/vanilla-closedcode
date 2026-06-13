// Node-run tests for the vanilla data layer actions (SDK-integration phase). A
// mock SDK client records calls; events are driven through an injected in-process
// source.   node src/cli/cmd/tui/vanilla/data/index.test.js
import { createDataLayer } from "./index.js";

let passed = 0, failed = 0;
function eq(a, b, label) { if (JSON.stringify(a) === JSON.stringify(b)) passed++; else { failed++; console.error(`FAIL ${label}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } }
function ok(c, label) { eq(!!c, true, label); }

function mockSdk() {
  const calls = [];
  const responses = {
    "session.create": () => ({ data: { id: "ses_new" } }),
    "session.get": ({ sessionID }) => ({ data: { id: sessionID, title: "T", time: {} } }),
    "session.messages": () => ({ data: [{ info: { id: "m1", sessionID: "ses_1", role: "user", time: {} }, parts: [{ id: "p1", messageID: "m1", type: "text", text: "hi" }] }] }),
    "session.list": () => ({ data: [{ id: "ses_a" }, { id: "ses_b" }] }),
    "config.providers": () => ({ data: { providers: [{ id: "anthropic", models: {} }], default: {} } }),
    "app.agents": () => ({ data: [{ name: "build" }] }),
    "command.list": () => ({ data: [{ name: "help" }] }),
    "find.files": () => ({ data: ["a.js", "b.js"] }),
  };
  const rec = name => async args => { calls.push([name, args]); return responses[name]?.(args) ?? {}; };
  return {
    calls,
    session: { create: rec("session.create"), prompt: rec("session.prompt"), shell: rec("session.shell"), command: rec("session.command"), abort: rec("session.abort"), get: rec("session.get"), messages: rec("session.messages"), list: rec("session.list") },
    find: { files: rec("find.files") },
    config: { providers: rec("config.providers") },
    app: { agents: rec("app.agents") },
    command: { list: rec("command.list") },
  };
}
const sync = fn => fn(); // deterministic batcher flush
const IDS = { message: () => "msg_x", part: () => "prt_x" };

// 1. submit creates a session then prompts; returns the new id
{
  const sdk = mockSdk();
  const data = createDataLayer({ sdk, ids: IDS, schedule: sync });
  const sid = await data.submit(undefined, "hello", { agent: "build", model: { providerID: "anthropic", modelID: "opus" } });
  eq(sid, "ses_new", "submit from no session creates one and returns its id");
  const names = sdk.calls.map(c => c[0]);
  ok(names.includes("session.create") && names.includes("session.prompt"), "called create then prompt");
  const prompt = sdk.calls.find(c => c[0] === "session.prompt")[1];
  eq(prompt.parts[0], { id: "prt_x", type: "text", text: "hello" }, "prompt carries a text part");
}

// 2. shell mode -> session.shell; slash command -> session.command
{
  const sdk = mockSdk();
  const data = createDataLayer({ sdk, ids: IDS, schedule: sync });
  await data.bootstrap(); // loads commands ([{name:"help"}])
  await data.submit("ses_1", "ls -la", { mode: "shell", agent: "build", model: { providerID: "p", modelID: "m" } });
  ok(sdk.calls.some(c => c[0] === "session.shell"), "shell mode routes to session.shell");
  await data.submit("ses_1", "/help arg", { agent: "build", model: { providerID: "p", modelID: "m" } });
  const cmd = sdk.calls.find(c => c[0] === "session.command")[1];
  eq([cmd.command, cmd.arguments], ["help", "arg"], "known slash command routes to session.command (name+args parsed)");
}

// 3. bootstrap populates providers/agents/commands/sessions
{
  const sdk = mockSdk();
  const data = createDataLayer({ sdk, ids: IDS, schedule: sync });
  await data.bootstrap();
  eq(data.store.agents().map(a => a.name), ["build"], "agents loaded");
  eq(data.store.commands().map(c => c.name), ["help"], "commands loaded");
  eq(data.store.sessions().map(s => s.id), ["ses_a", "ses_b"], "sessions loaded (sorted)");
  eq(data.store.status(), "complete", "status complete after bootstrap");
}

// 4. syncSession hydrates message+part history (once)
{
  const sdk = mockSdk();
  const data = createDataLayer({ sdk, ids: IDS, schedule: sync });
  await data.syncSession("ses_1");
  eq(data.store.timeline("ses_1"), [{ role: "user", parts: [{ type: "text", text: "hi" }] }], "syncSession hydrated the timeline");
  await data.syncSession("ses_1"); // second call is a no-op (guarded)
  eq(sdk.calls.filter(c => c[0] === "session.messages").length, 1, "syncSession only fetches once");
}

// 5. findFiles proxies the SDK
{
  const sdk = mockSdk();
  const data = createDataLayer({ sdk, ids: IDS, schedule: sync });
  eq(await data.findFiles("a"), ["a.js", "b.js"], "findFiles returns sdk.find.files data");
}

// 6. injected in-process event source feeds the store
{
  const sdk = mockSdk();
  let handler = null;
  const events = { subscribe: h => { handler = h; return () => {}; } };
  const data = createDataLayer({ sdk, ids: IDS, schedule: sync, events });
  await data.start();
  handler({ type: "message.updated", properties: { info: { id: "m1", sessionID: "ses_1", role: "user", time: {} } } });
  handler({ type: "message.part.updated", properties: { part: { id: "p1", messageID: "m1", type: "text", text: "streamed" } } });
  eq(data.store.timeline("ses_1"), [{ role: "user", parts: [{ type: "text", text: "streamed" }] }], "events from the source land in the store");
}

console.log(`tui vanilla data-layer tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
