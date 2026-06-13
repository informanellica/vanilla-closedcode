// Node-run tests for the vanilla command registry (buildCommands).
//   node src/cli/cmd/tui/vanilla/commands.test.js
//
// We drive the real dialogs.js widgets through a minimal mock dialog manager
// (same open/close + onClose contract the shell provides), a mock data layer
// whose `sdk` records every call, and a mock toast that records shown messages.
// Each test runs a command's run(), auto-resolves the dialog it opens, then
// asserts the real side effects (sdk calls, navigation, toasts).
import tk from "terminal-kit";
import { makeRegion } from "../runtime/layout.js";
import { buildCommands, relativeTime } from "./commands.js";

let passed = 0, failed = 0;
function eq(a, b, label) {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x === y) passed++; else { failed++; console.error(`FAIL ${label}: got ${x}, want ${y}`); }
}
function ok(c, label) { eq(!!c, true, label); }
const char = () => ({ isCharacter: true });
function rowText(buf, y, w) { let s = ""; for (let i = 0; i < w; i++) s += buf.get({ x: i, y }).char; return s.replace(/\s+$/, ""); }

// Minimal dialog manager mirroring shell.dialog (stack + onClose on close/escape).
function mockDialog() {
  const stack = [];
  return {
    open(spec) { stack.push(spec); },
    close() { const t = stack.pop(); t?.onClose?.(); },
    current: () => stack.at(-1),
    dispatch(name, data) { return stack.at(-1)?.widget.handleKey(name, data); },
    escape() { const t = stack.at(-1); if (t) { stack.pop(); t.onClose?.(); } },
    render(w = 70, h = 18) {
      const buf = new tk.ScreenBuffer({ width: w, height: h }); buf.fill({ char: " " });
      const inner = makeRegion(buf, 2, 2, w - 4, h - 4);
      stack.at(-1)?.widget.draw(inner, { focusCursor: () => {} });
      let s = ""; for (let y = 0; y < h; y++) s += rowText(buf, y, w) + "\n"; return s;
    },
  };
}
const type = (d, str) => { for (const ch of str) d.dispatch(ch, char()); };

// Mock data layer: a fixed store + an sdk that records calls and resolves.
function mockData(overrides = {}) {
  const calls = [];
  const record = name => (args) => { calls.push({ name, args }); return Promise.resolve({ data: {} }); };
  const sessions = overrides.sessions ?? [
    { id: "ses_a", title: "Alpha", time: { created: 1000, updated: 5000 } },
    { id: "ses_b", title: "Beta", time: { created: 2000, updated: 9000 } },
  ];
  const providers = overrides.providers ?? [
    { id: "anthropic", name: "Anthropic", models: { "opus-4.8": { name: "Opus 4.8", variants: ["1m", "thinking"] }, "haiku-4.5": { name: "Haiku 4.5" } } },
  ];
  const agents = overrides.agents ?? [
    { name: "build", mode: "primary" },
    { name: "plan", mode: "primary" },
    { name: "secret", mode: "subagent", hidden: true },
  ];
  const sdk = {
    session: {
      update: record("session.update"),
      delete: record("session.delete"),
      summarize: record("session.summarize"),
      share: (...a) => { calls.push({ name: "session.share", args: a[0] }); return Promise.resolve({ data: { share: { url: "https://x/abc" } } }); },
      unshare: record("session.unshare"),
    },
  };
  return {
    calls, sdk,
    store: {
      sessions: () => sessions,
      providers: () => providers,
      agents: () => agents,
      status: () => "complete",
      sessionStatusText: () => "idle",
    },
  };
}

function mockToast() {
  const shown = [];
  return { shown, show: ({ message, variant }) => shown.push({ message, variant }), error: e => shown.push({ message: String(e?.message ?? e), variant: "error" }) };
}

// Build a ctx with a route + navigation recorder + optional selection sinks.
function mockCtx(extra = {}) {
  const navs = [];
  const sel = { model: { value: undefined, set(m) { this.value = m; }, current() { return this.value; } },
                agent: { value: undefined, set(a) { this.value = a; }, current() { return this.value; } },
                variant: { value: undefined, set(v) { this.value = v; }, current() { return this.value; } } };
  const ctx = {
    data: extra.data ?? mockData(),
    dialog: extra.dialog,
    toast: extra.toast,
    route: extra.route ?? (() => ({ type: "session", sessionID: "ses_a" })),
    navigate: r => navs.push(r),
    selection: sel,
    now: () => 100000,
    onExit: extra.onExit,
  };
  return { ctx, navs, sel };
}

const find = (cmds, value) => cmds.find(c => c.value === value);

// --- registry shape --------------------------------------------------------
{
  const d = mockDialog(), t = mockToast();
  const { ctx } = mockCtx({ dialog: d, toast: t });
  const cmds = buildCommands(ctx);
  ok(cmds.length >= 16, "registry has all commands");
  ok(cmds.every(c => c.label && c.value && typeof c.run === "function"), "every command has label/value/run()");
  ok(find(cmds, "session.rename").slash === "rename", "slash names are present");
  ok(find(cmds, "session.switch").category === "Session", "categories are present");
}

// --- relativeTime ----------------------------------------------------------
{
  const now = 1000000;
  eq(relativeTime(now, now), "just now", "relativeTime: just now");
  eq(relativeTime(now - 5 * 60000, now), "5m ago", "relativeTime: minutes");
  eq(relativeTime(now - 3 * 3600000, now), "3h ago", "relativeTime: hours");
  eq(relativeTime(now - 2 * 86400000, now), "2d ago", "relativeTime: days");
}

// --- Rename: opens a prompt and calls sdk.session.update -------------------
{
  const d = mockDialog(), t = mockToast();
  const { ctx } = mockCtx({ dialog: d, toast: t });
  const cmds = buildCommands(ctx);
  const p = find(cmds, "session.rename").run();
  ok(d.current(), "rename opened a dialog");
  ok(d.render().includes("Alpha"), "rename prompt seeded with current title");
  type(d, "X"); // append to "Alpha" -> "AlphaX"
  d.dispatch("ENTER");
  await p;
  const upd = ctx.data.calls.find(c => c.name === "session.update");
  ok(upd, "rename called sdk.session.update");
  eq(upd.args.sessionID, "ses_a", "update targets the current session");
  eq(upd.args.title, "AlphaX", "update sends the edited title");
  ok(t.shown.some(s => s.variant === "success"), "rename toasts success");
}

// --- Rename: empty / escaped does NOT call update -------------------------
{
  const d = mockDialog(), t = mockToast();
  const { ctx } = mockCtx({ dialog: d, toast: t });
  const cmds = buildCommands(ctx);
  const p = find(cmds, "session.rename").run();
  d.escape(); // resolve undefined
  await p;
  eq(ctx.data.calls.some(c => c.name === "session.update"), false, "escaped rename does not update");
}

// --- Switch session: lists sessions + navigates ---------------------------
{
  const d = mockDialog(), t = mockToast();
  const { ctx, navs } = mockCtx({ dialog: d, toast: t });
  const cmds = buildCommands(ctx);
  const p = find(cmds, "session.switch").run();
  ok(d.current(), "switch session opened a dialog");
  const screen = d.render();
  ok(screen.includes("Alpha") && screen.includes("Beta"), "switch lists session titles");
  ok(screen.includes("ago") || screen.includes("now"), "switch shows relative time");
  // First option should be Beta (updated=9000 > Alpha 5000): newest-first sort.
  d.dispatch("ENTER");
  await p;
  eq(navs.length, 1, "switch navigated once");
  eq(navs[0].type, "session", "navigated to a session");
  eq(navs[0].sessionID, "ses_b", "switch navigates to the most-recent session first");
}

// --- Delete: confirm -> sdk.session.delete + navigate home ----------------
{
  const d = mockDialog(), t = mockToast();
  const { ctx, navs } = mockCtx({ dialog: d, toast: t });
  const cmds = buildCommands(ctx);
  const p = find(cmds, "session.delete").run();
  ok(d.render().includes("Delete"), "delete shows a confirm");
  d.dispatch("ENTER"); // default active = confirm -> true
  await p;
  const del = ctx.data.calls.find(c => c.name === "session.delete");
  ok(del, "delete called sdk.session.delete");
  eq(del.args.sessionID, "ses_a", "delete targets current session");
  eq(navs.at(-1).type, "home", "delete navigates home after");
}

// --- Delete: cancel does NOT call delete ----------------------------------
{
  const d = mockDialog(), t = mockToast();
  const { ctx } = mockCtx({ dialog: d, toast: t });
  const cmds = buildCommands(ctx);
  const p = find(cmds, "session.delete").run();
  d.dispatch("LEFT"); // confirm -> cancel
  d.dispatch("ENTER");
  await p;
  eq(ctx.data.calls.some(c => c.name === "session.delete"), false, "cancelled delete does nothing");
}

// --- Switch model: lists provider models + sets selection -----------------
{
  const d = mockDialog(), t = mockToast();
  const { ctx, sel } = mockCtx({ dialog: d, toast: t });
  const cmds = buildCommands(ctx);
  const p = find(cmds, "model.switch").run();
  const screen = d.render();
  ok(screen.includes("Opus 4.8") && screen.includes("Anthropic"), "model dialog lists provider models");
  d.dispatch("ENTER"); // pick first (Opus 4.8)
  await p;
  eq(sel.model.current().modelID, "opus-4.8", "switch model sets selection.model");
  ok(t.shown.some(s => s.variant === "success"), "model switch toasts");
}

// --- Switch agent: hidden agents filtered, sets selection -----------------
{
  const d = mockDialog(), t = mockToast();
  const { ctx, sel } = mockCtx({ dialog: d, toast: t });
  const cmds = buildCommands(ctx);
  const p = find(cmds, "agent.switch").run();
  const screen = d.render();
  ok(screen.includes("build") && screen.includes("plan"), "agent dialog lists visible agents");
  eq(screen.includes("secret"), false, "hidden agents are filtered out");
  d.dispatch("ENTER"); // pick first (build)
  await p;
  eq(sel.agent.current(), "build", "switch agent sets selection.agent");
}

// --- Switch variant: lists model variants + sets selection ----------------
{
  const d = mockDialog(), t = mockToast();
  // Pre-select Opus 4.8 (which has variants) as the current model.
  const { ctx, sel } = mockCtx({ dialog: d, toast: t });
  sel.model.set({ providerID: "anthropic", modelID: "opus-4.8" });
  const cmds = buildCommands(ctx);
  const p = find(cmds, "variant.switch").run();
  const screen = d.render();
  ok(screen.includes("Default") && screen.includes("1m"), "variant dialog lists Default + variants");
  // Move down to the first real variant ("1m") and choose it.
  d.dispatch("DOWN");
  d.dispatch("ENTER");
  await p;
  eq(sel.variant.current(), "1m", "switch variant sets selection.variant");
}

// --- Compact: calls sdk.session.summarize with the current model ----------
{
  const d = mockDialog(), t = mockToast();
  const { ctx } = mockCtx({ dialog: d, toast: t });
  const cmds = buildCommands(ctx);
  await find(cmds, "session.compact").run();
  const sum = ctx.data.calls.find(c => c.name === "session.summarize");
  ok(sum, "compact called sdk.session.summarize");
  eq(sum.args.sessionID, "ses_a", "summarize targets current session");
  eq(sum.args.modelID, "opus-4.8", "summarize uses the resolved model id");
  eq(sum.args.providerID, "anthropic", "summarize uses the resolved provider id");
}

// --- Share / Unshare: call the SDK + toast --------------------------------
{
  const d = mockDialog(), t = mockToast();
  const { ctx } = mockCtx({ dialog: d, toast: t });
  const cmds = buildCommands(ctx);
  await find(cmds, "session.share").run();
  ok(ctx.data.calls.some(c => c.name === "session.share"), "share called sdk.session.share");
  ok(t.shown.some(s => s.message.includes("https://x/abc")), "share toasts the returned url");
  await find(cmds, "session.unshare").run();
  ok(ctx.data.calls.some(c => c.name === "session.unshare"), "unshare called sdk.session.unshare");
}

// --- View status: alert summarizes the store ------------------------------
{
  const d = mockDialog(), t = mockToast();
  const { ctx } = mockCtx({ dialog: d, toast: t });
  const cmds = buildCommands(ctx);
  const p = find(cmds, "app.status").run();
  const screen = d.render();
  ok(screen.includes("Status"), "status alert shows a Status line");
  ok(screen.includes("Sessions"), "status alert shows the session count");
  d.dispatch("ENTER");
  await p;
}

// --- Help / placeholders open an alert ------------------------------------
{
  const d = mockDialog(), t = mockToast();
  const { ctx } = mockCtx({ dialog: d, toast: t });
  const cmds = buildCommands(ctx);
  const p = find(cmds, "app.help").run();
  ok(d.render().includes("command palette"), "help shows keybinding hints");
  d.dispatch("ENTER");
  await p;
  const pe = find(cmds, "session.export").run();
  ok(d.current(), "export opens a placeholder dialog");
  d.dispatch("ENTER");
  await pe;
  const pc = find(cmds, "provider.connect").run();
  ok(d.current(), "connect provider opens a placeholder dialog");
  d.dispatch("ENTER");
  await pc;
}

// --- New session navigates home -------------------------------------------
{
  const d = mockDialog(), t = mockToast();
  const { ctx, navs } = mockCtx({ dialog: d, toast: t });
  const cmds = buildCommands(ctx);
  await find(cmds, "session.new").run();
  eq(navs.at(-1).type, "home", "new session navigates home");
}

// --- Exit calls onExit -----------------------------------------------------
{
  let exited = false;
  const d = mockDialog(), t = mockToast();
  const { ctx } = mockCtx({ dialog: d, toast: t, onExit: () => { exited = true; } });
  const cmds = buildCommands(ctx);
  await find(cmds, "app.exit").run();
  eq(exited, true, "exit calls onExit");
}

// --- Guards: commands needing a session no-op on home ---------------------
{
  const d = mockDialog(), t = mockToast();
  const { ctx } = mockCtx({ dialog: d, toast: t, route: () => ({ type: "home" }) });
  const cmds = buildCommands(ctx);
  await find(cmds, "session.rename").run();
  eq(ctx.data.calls.some(c => c.name === "session.update"), false, "rename on home does not update");
  ok(t.shown.some(s => s.variant === "warning"), "rename on home warns");
}

console.log(`tui vanilla commands tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
