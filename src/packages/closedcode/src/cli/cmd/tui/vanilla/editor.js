// External-editor support for the vanilla TUI prompt: open $VISUAL/$EDITOR on the
// current prompt text and read it back on exit (the classic Ctrl-X Ctrl-E / "edit
// in $EDITOR" flow). The terminal is handed to the child via the injected
// `suspend` (runtime/screen.js suspend()) so the editor owns a clean, non-raw TTY
// and the TUI re-enters fullscreen afterward.
//
// Everything IO is injectable so this is unit-testable under bare node:
//   - opts.suspend(fn): run fn() with the TUI suspended (defaults to calling fn directly)
//   - opts.spawn / opts.editor / opts.tmpdir / opts.fs: override the child + paths
import nodeFs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn as nodeSpawn } from "node:child_process";

// Split a command string into argv, honoring simple double-quoted segments
// (e.g. EDITOR='code --wait' -> ["code", "--wait"]).
export function splitCommand(cmd) {
  const out = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m;
  while ((m = re.exec(String(cmd ?? "")))) out.push(m[1] ?? m[2]);
  return out;
}

// Resolve the editor command (VISUAL > EDITOR > platform default).
export function resolveEditor(env = process.env, platform = process.platform) {
  return env.VISUAL || env.EDITOR || (platform === "win32" ? "notepad" : "vi");
}

// Edit `initial` in the external editor; resolves to the edited text (or the
// original on any failure). Removes the temp file afterward. Never throws.
export async function editInEditor(initial = "", opts = {}) {
  const fs = opts.fs ?? nodeFs;
  const spawn = opts.spawn ?? nodeSpawn;
  const suspend = opts.suspend ?? (fn => fn());
  const editor = opts.editor ?? resolveEditor(opts.env, opts.platform);
  const dir = opts.tmpdir ?? os.tmpdir();
  const file = path.join(dir, opts.filename ?? `closedcode-prompt-${process.pid}-${stamp(opts)}.md`);

  try {
    fs.writeFileSync(file, String(initial ?? ""));
  } catch {
    return initial; // can't stage the temp file — leave the prompt untouched
  }

  const run = () => new Promise((resolve) => {
    const [bin, ...args] = splitCommand(editor);
    if (!bin) { resolve(0); return; }
    let child;
    try {
      child = spawn(bin, [...args, file], { stdio: "inherit" });
    } catch {
      resolve(1); return; // editor not found / spawn failed
    }
    child.on("error", () => resolve(1));
    child.on("exit", (code) => resolve(code ?? 0));
  });

  try {
    const code = await suspend(run);
    // A non-zero editor exit means "discard my edits" (vi :cq, a crash, or an
    // editor not found -> resolve(1)) — git's $EDITOR convention. Keep the original.
    if (code) return initial;
    const edited = fs.readFileSync(file, "utf8");
    if (typeof edited !== "string") return initial;
    // Normalize CRLF/CR -> LF so a Windows editor (notepad, the win32 default)
    // doesn't leave stray carriage returns embedded in every prompt line.
    return edited.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  } catch {
    return initial;
  } finally {
    try { fs.unlinkSync(file); } catch { /* ignore */ }
  }
}

// A monotonic-ish stamp for the temp filename. opts.stamp lets tests pin it
// (Date.now() is avoided so the module stays deterministic where it matters).
function stamp(opts) {
  if (opts.stamp != null) return String(opts.stamp);
  return String(process.hrtime ? process.hrtime.bigint() : process.pid);
}
