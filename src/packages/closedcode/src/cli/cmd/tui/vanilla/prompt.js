// Vanilla prompt (Stage T3, stage 2) — the immediate-mode replacement for
// component/prompt/index.js (a 1500-line compiled-Solid textarea over @opentui
// with extmarks/SDK). This keeps the user-facing behavior: a multi-line input
// (createTextArea), shell mode ("!" at the start), prompt history (Up at start /
// Down at end), an autocomplete dropdown, and a meta line (agent · model
// provider). Submission and the data SOURCES are injected (onSubmit, commands,
// listFiles, history), so it composes into the shell and is headless-testable.
import { createSignal } from "../runtime/reactivity.js";
import { createTextArea } from "../runtime/textarea.js";
import { createAutocomplete } from "./autocomplete.js";
import { attr, defaultTheme } from "./theme.js";
import { fit } from "../runtime/text.js";

const INDENT = 2; // matches the live prompt's paddingLeft
const resolve = v => (typeof v === "function" ? v() : v);
const titlecase = s => (s ? s[0].toUpperCase() + s.slice(1) : s);

export function createPrompt(opts = {}) {
  const theme = opts.theme ?? defaultTheme;
  const [mode, setMode] = createSignal("normal"); // "normal" | "shell"
  const [phIndex, setPhIndex] = createSignal(0);
  const textarea = createTextArea("", { minHeight: 1, maxHeight: 6, onChange: opts.onChange });
  const ac = createAutocomplete({ commands: opts.commands ?? [], listFiles: opts.listFiles });
  const history = opts.history;
  let historyActive = false; // true while browsing history (so Up/Down cycle)

  const refreshAC = () => ac.onInput(textarea.value(), textarea.cursor());
  // Set the whole prompt text programmatically (e.g. --prompt prefill, a stash
  // restore). Goes through the textarea directly so a leading "!" does NOT trip
  // shell mode the way feeding it key-by-key would.
  function setText(str) { textarea.setText(str ?? ""); historyActive = false; refreshAC(); }

  function applyAccept(splice) {
    const cs = [...textarea.value()];
    const ins = [...splice.text];
    cs.splice(splice.from, splice.to - splice.from, ...ins);
    textarea.setValue(cs.join(""));
    textarea.setCursor(splice.from + ins.length);
    refreshAC();
  }

  function submit() {
    const raw = textarea.value();
    const text = raw.trim();
    if (!text) return false;
    const m = mode();
    history?.append?.({ input: raw, mode: m });
    opts.onSubmit?.(text, { mode: m });
    textarea.setText("");
    setMode("normal");
    historyActive = false;
    ac.hide();
    return true;
  }

  function handleKey(name, data) {
    // 1. autocomplete owns nav/accept/escape while visible
    if (ac.visible()) {
      const r = ac.handleKey(name);
      if (r.accept) applyAccept(r.accept);
      if (r.consumed) return true;
    }
    // 2. shell mode toggle: "!" at the very start of an empty-ish input
    if (data && data.isCharacter && name === "!" && textarea.cursor() === 0 && mode() === "normal") {
      setMode("shell"); setPhIndex(i => i + 1); return true;
    }
    // 3. shell mode exit: Escape, or Backspace at offset 0
    if (mode() === "shell" && (name === "ESCAPE" || (name === "BACKSPACE" && textarea.cursor() === 0))) {
      setMode("normal"); return true;
    }
    // 4. submit / newline
    if (name === "ENTER") {
      if (data && data.shift) { textarea.newline(); refreshAC(); return true; }
      submit(); return true;
    }
    // 5. history: Up walks back (from the line start, or while already browsing);
    //    Down walks forward while browsing and restores the in-progress draft at
    //    the end. Tracking `historyActive` makes the Up<->Down round-trip work
    //    regardless of where the recalled text left the cursor.
    if (history && name === "UP" && (historyActive || textarea.cursor() === 0)) {
      const item = history.move?.(-1, textarea.value());
      if (item) { textarea.setText(item.input); textarea.setCursor(0); setMode(item.mode ?? "normal"); historyActive = true; }
      return true;
    }
    if (history && name === "DOWN" && historyActive) {
      const item = history.move?.(1, textarea.value());
      if (item) { textarea.setText(item.input); setMode(item.mode ?? "normal"); if (item.atDraft) historyActive = false; }
      return true;
    }
    // 6. default: edit, then refresh suggestions; an actual edit exits browsing
    const handled = textarea.handleKey(name, data);
    if (handled) {
      if ((data && data.isCharacter) || name === "BACKSPACE" || name === "DELETE") historyActive = false;
      refreshAC();
    }
    return handled;
  }

  function placeholder() {
    const m = mode();
    const arr = m === "shell" ? (opts.placeholders?.shell ?? []) : (opts.placeholders?.normal ?? []);
    if (!arr.length) return m === "shell" ? "Run a command…" : "Ask anything…";
    const ex = arr[phIndex() % arr.length];
    return m === "shell" ? `Run a command... "${ex}"` : `Ask anything... "${ex}"`;
  }

  // Total rows the prompt wants for `width` (input area + meta + hint).
  function height(width) { return textarea.height(Math.max(1, width - INDENT)) + 2; }

  function draw(region, ctx, { focused } = {}) {
    const m = mode();
    const barAttr = attr(theme, m === "shell" ? "primary" : "border");
    for (let r = 0; r < region.height; r++) region.text(0, r, "▌", barAttr);
    const content = region.sub(INDENT, 0, region.width - INDENT, region.height);
    const cw = content.width;
    const tH = textarea.height(cw);
    textarea.draw(content.sub(0, 0, cw, tH), {
      focused, ctx, attr: attr(theme, "text"),
      placeholder: textarea.value() === "" ? placeholder() : undefined,
    });
    // meta line: Agent · model provider
    const agent = resolve(opts.agent);
    const model = resolve(opts.model);
    const provider = resolve(opts.provider);
    const meta = m === "shell" ? "Shell"
      : [titlecase(agent) || "", [model, provider].filter(Boolean).join(" ")].filter(Boolean).join("  ·  ");
    content.line(tH, meta, attr(theme, m === "shell" ? "primary" : "textMuted"));
    // hint line
    const hint = m === "shell" ? "esc  exit shell mode" : "↵ send   / commands   ! shell";
    content.line(tH + 1, hint, attr(theme, "textMuted"));
  }

  return { textarea, autocomplete: ac, mode, setMode, value: () => textarea.value(), setText, handleKey, submit, draw, height, placeholder };
}

// Minimal prompt history: Up (dir -1) walks back, Down (dir +1) walks forward and
// restores the in-progress draft at the end. Mirrors the live history.move() UX.
export function createPromptHistory() {
  const items = [];
  let idx = null;
  let draft = "";
  return {
    append(entry) { if (entry?.input?.trim()) items.push({ input: entry.input, mode: entry.mode ?? "normal" }); idx = null; },
    list: () => items,
    move(dir, current) {
      if (items.length === 0) return;
      if (dir < 0) {
        if (idx === null) { draft = current ?? ""; idx = items.length - 1; }
        else if (idx > 0) idx--;
        else return;
        return items[idx];
      }
      if (idx === null) return;
      if (idx < items.length - 1) { idx++; return items[idx]; }
      idx = null;
      return { input: draft, mode: "normal", atDraft: true };
    },
  };
}
