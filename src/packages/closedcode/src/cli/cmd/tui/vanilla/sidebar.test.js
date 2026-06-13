// Node-run tests for the session sidebar.   node src/cli/cmd/tui/vanilla/sidebar.test.js
import tk from "terminal-kit";
import { makeRegion } from "../runtime/layout.js";
import { createSidebar, diffFiles } from "./sidebar.js";

let passed = 0, failed = 0;
function eq(a, b, label) { if (JSON.stringify(a) === JSON.stringify(b)) passed++; else { failed++; console.error(`FAIL ${label}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } }
function ok(c, label) { eq(!!c, true, label); }
function screen(sb, w = 30, h = 14) {
  const buf = new tk.ScreenBufferHD({ width: w, height: h }); buf.fill({ char: " " });
  sb.draw(makeRegion(buf, 0, 0, w, h));
  const rows = []; for (let y = 0; y < h; y++) { let s = ""; for (let x = 0; x < w; x++) s += buf.get({ x, y }).char; rows.push(s.replace(/\s+$/, "")); }
  return rows.join("\n");
}
function mockData({ todos = [], diff } = {}) {
  return { store: { todos: () => todos, diff: () => diff } };
}

// --- diffFiles parsing -----------------------------------------------------
{
  eq(diffFiles("--- a/x.js\n+++ b/src/a.js\n@@\n+++ b/src/b.js").map(f => f.path), ["src/a.js", "src/b.js"], "unified diff -> file paths");
  eq(diffFiles(["a.js", "b.js"]).map(f => f.path), ["a.js", "b.js"], "array of paths");
  eq(diffFiles({ files: [{ path: "c.js", additions: 3, deletions: 1 }] })[0].additions, 3, "object {files}");
  eq(diffFiles(undefined), [], "no diff -> []");
}

// --- render: todos + files -------------------------------------------------
{
  const data = mockData({
    todos: [{ content: "write tests", status: "completed" }, { content: "fix bug", status: "in_progress" }, { content: "ship", status: "pending" }],
    diff: { files: [{ path: "src/app.js", additions: 5, deletions: 2 }] },
  });
  const sb = createSidebar({ data, sessionID: () => "ses_1" });
  const s = screen(sb);
  ok(s.includes("Session"), "sidebar header");
  ok(s.includes("Todos (3)"), "todo count");
  ok(s.includes("✓ write tests"), "completed todo with check");
  ok(s.includes("▶ fix bug"), "in-progress todo");
  ok(s.includes("○ ship"), "pending todo");
  ok(s.includes("Changed files (1)"), "files count");
  ok(s.includes("src/app.js"), "changed file path");
  ok(s.includes("+5 -2"), "file add/del stats");
}

// --- toggle ---------------------------------------------------------------
{
  const sb = createSidebar({ data: mockData(), sessionID: () => "x" });
  eq(sb.visible(), false, "hidden by default");
  sb.toggle(); eq(sb.visible(), true, "toggle shows");
  sb.toggle(); eq(sb.visible(), false, "toggle hides");
}

// --- empty state ----------------------------------------------------------
{
  const sb = createSidebar({ data: mockData(), sessionID: () => "x" });
  const s = screen(sb);
  ok(s.includes("Todos (0)") && s.includes("none"), "empty todos show 'none'");
}

console.log(`tui vanilla sidebar tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
