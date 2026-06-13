// Session sidebar for the vanilla TUI — a togglable right-hand panel showing the
// current session's TODOs and changed files (from vanilla/data: todos(sid) +
// diff(sid)). Mirrors routes/session/sidebar.js at a basic level. Toggled by the
// sidebar_toggle keybind (Ctrl-X b); the shell row-splits the timeline when open.
import { createSignal } from "../runtime/reactivity.js";
import { truncate, fit } from "../runtime/text.js";
import { attr, defaultTheme } from "./theme.js";

const TODO_MARK = { completed: "✓ ", in_progress: "▶ ", pending: "○ " };
const TODO_TOKEN = { completed: "success", in_progress: "warning", pending: "textMuted" };

// Normalize the session diff into a [{ path, ... }] file list. Accepts a unified
// diff string, an array of paths, or a { files: [...] } object.
export function diffFiles(diff) {
  if (!diff) return [];
  if (Array.isArray(diff)) return diff.map(f => (typeof f === "string" ? { path: f } : f));
  if (typeof diff === "object" && Array.isArray(diff.files)) return diff.files;
  if (typeof diff === "string") {
    const out = [];
    for (const line of diff.split("\n")) {
      const m = line.match(/^\+\+\+ b\/(.+)$/) || line.match(/^diff --git a\/\S+ b\/(.+)$/);
      if (m && !out.some(f => f.path === m[1])) out.push({ path: m[1] });
    }
    return out;
  }
  return [];
}

export function createSidebar(opts = {}) {
  const theme = opts.theme ?? defaultTheme;
  const data = opts.data;
  const sid = () => (typeof opts.sessionID === "function" ? opts.sessionID() : opts.sessionID);
  const [open, setOpen] = createSignal(false);

  function toggle() { setOpen(v => !v); }

  function draw(region) {
    const W = region.width;
    // left separator + padded content area
    for (let r = 0; r < region.height; r++) region.text(0, r, "│", attr(theme, "border"));
    const body = region.sub(2, 0, Math.max(0, W - 2), region.height);
    const w = body.width;
    let row = 0;
    const line = (text, token, extra) => { if (row < body.height) body.line(row++, truncate(text, w), attr(theme, token, extra)); };

    line("Session", "primary", { bold: true });
    row++;

    const todos = data?.store.todos(sid()) ?? [];
    line(`Todos (${todos.length})`, "textMuted");
    if (!todos.length) line("  none", "textMuted", { dim: true });
    for (const t of todos) {
      if (row >= body.height - 3) { line(`  … +${todos.length - row + 2} more`, "textMuted", { dim: true }); break; }
      line((TODO_MARK[t.status] ?? "· ") + (t.content ?? t.text ?? ""), TODO_TOKEN[t.status] ?? "text");
    }
    row++;

    const files = diffFiles(data?.store.diff(sid()));
    line(`Changed files (${files.length})`, "textMuted");
    if (!files.length) line("  none", "textMuted", { dim: true });
    for (const f of files) {
      if (row >= body.height) break;
      const stat = (f.additions != null || f.deletions != null) ? `  +${f.additions ?? 0} -${f.deletions ?? 0}` : "";
      line(fit(truncate(f.path ?? String(f), Math.max(1, w - stat.length)), Math.max(1, w - stat.length), "left") + stat, "secondary");
    }
  }

  return { visible: open, setOpen, toggle, draw };
}
