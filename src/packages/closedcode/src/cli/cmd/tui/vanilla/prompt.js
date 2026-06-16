/**
 * @file Vanilla prompt (Stage T3, stage 2) — the immediate-mode replacement for
 * component/prompt/index.js (a 1500-line compiled-Solid textarea over @opentui
 * with extmarks/SDK). This keeps the user-facing behavior: a multi-line input
 * (createTextArea), shell mode ("!" at the start), prompt history (Up at start /
 * Down at end), an autocomplete dropdown, and a meta line (agent · model
 * provider). Submission and the data SOURCES are injected (onSubmit, commands,
 * listFiles, history), so it composes into the shell and is headless-testable.
 */
import { createSignal } from "../runtime/reactivity.js";
import { createTextArea } from "../runtime/textarea.js";
import { createAutocomplete } from "./autocomplete.js";
import { attr, defaultTheme } from "./theme.js";
import { fit } from "../runtime/text.js";

const INDENT = 2; // matches the live prompt's paddingLeft
/**
 * Resolve a possibly-callable value: call it if a function, else return as-is.
 * @param {*} v - A value or a zero-arg getter function.
 * @returns {*} The value, or the function's return value.
 */
const resolve = v => (typeof v === "function" ? v() : v);
/**
 * Uppercase the first character of a string.
 * @param {string} s - The input string.
 * @returns {string} The title-cased string (or the input unchanged when empty).
 */
const titlecase = s => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * Create the immediate-mode prompt widget: a multi-line textarea with shell
 * mode, history browsing, autocomplete, and a meta/hint line.
 * @param {Object} opts - Configuration and injected data sources.
 * @param {Object} opts.theme - Theme token map (defaults to defaultTheme).
 * @param {Function} opts.onSubmit - Called with (text, {mode}) on submit.
 * @param {Function} opts.onChange - Forwarded to the textarea's change callback.
 * @param {Array} opts.commands - Slash-command list for autocomplete.
 * @param {Function} opts.listFiles - File lister for @-mention autocomplete.
 * @param {Object} opts.history - Prompt history (createPromptHistory()).
 * @param {Object} opts.placeholders - {normal, shell} arrays of example texts.
 * @param {*} opts.agent - Agent name (value or getter) for the meta line.
 * @param {*} opts.model - Model name (value or getter) for the meta line.
 * @param {*} opts.provider - Provider name (value or getter) for the meta line.
 * @returns {Object} The prompt API (textarea, autocomplete, mode, setMode, value, setText, handleKey, submit, draw, height, placeholder).
 */
export function createPrompt(opts = {}) {
  const theme = opts.theme ?? defaultTheme;
  const [mode, setMode] = createSignal("normal"); // "normal" | "shell"
  const [phIndex, setPhIndex] = createSignal(0);
  const textarea = createTextArea("", { minHeight: 1, maxHeight: 6, onChange: opts.onChange });
  const ac = createAutocomplete({ commands: opts.commands ?? [], listFiles: opts.listFiles });
  const history = opts.history;
  let historyActive = false; // true while browsing history (so Up/Down cycle)

  const refreshAC = () => ac.onInput(textarea.value(), textarea.cursor());
  /**
   * Set the whole prompt text programmatically (e.g. --prompt prefill, a stash
   * restore). Goes through the textarea directly so a leading "!" does NOT trip
   * shell mode the way feeding it key-by-key would.
   * @param {string} str - The full text to set (null/undefined clears it).
   * @returns {void}
   */
  function setText(str) { textarea.setText(str ?? ""); setMode("normal"); historyActive = false; history?.reset?.(); refreshAC(); }

  /**
   * Apply an autocomplete accept splice to the textarea buffer.
   * @param {Object} splice - {from, to, text} replacement over the buffer.
   * @returns {void}
   */
  function applyAccept(splice) {
    const cs = [...textarea.value()];
    const ins = [...splice.text];
    cs.splice(splice.from, splice.to - splice.from, ...ins);
    textarea.setValue(cs.join(""));
    textarea.setCursor(splice.from + ins.length);
    refreshAC();
  }

  /**
   * Submit the current (trimmed) input via onSubmit, append it to history, and
   * reset the prompt. No-op when the input is blank.
   * @returns {boolean} true if a submission occurred, false when input was empty.
   */
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

  /**
   * Route a key event through the prompt's layered handling: autocomplete,
   * shell-mode toggle/exit, submit/newline, history browsing, then editing.
   * @param {string} name - Combined key name (e.g. "ENTER", "UP", "BACKSPACE").
   * @param {Object} data - Key metadata (isCharacter, shift, ...).
   * @returns {boolean} true when the key was consumed.
   */
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
    // 4. submit / newline. terminal-kit emits Shift-Enter / Ctrl-J as DISTINCT key
    //    names (it only sets data.shift on mouse events); handle both, plus the
    //    synthetic ENTER+{shift} form used by tests.
    if (name === "SHIFT_ENTER" || name === "CTRL_J") { textarea.newline(); refreshAC(); return true; }
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
      // An actual edit exits history browsing — and must also reset the history
      // cursor, else the next Up resumes from a stale idx (skipping items and
      // discarding the just-edited buffer).
      if ((data && data.isCharacter) || name === "BACKSPACE" || name === "DELETE") { historyActive = false; history?.reset?.(); }
      refreshAC();
    }
    return handled;
  }

  /**
   * Pick the placeholder text for the current mode, rotating through the
   * configured examples (or a default phrase when none are configured).
   * @returns {string} The placeholder string for the empty input.
   */
  function placeholder() {
    const m = mode();
    const arr = m === "shell" ? (opts.placeholders?.shell ?? []) : (opts.placeholders?.normal ?? []);
    if (!arr.length) return m === "shell" ? "Run a command…" : "Ask anything…";
    const ex = arr[phIndex() % arr.length];
    return m === "shell" ? `Run a command... "${ex}"` : `Ask anything... "${ex}"`;
  }

  /**
   * Total rows the prompt wants for `width` (input area + meta + hint).
   * @param {number} width - Available column width for the prompt.
   * @returns {number} The number of rows the prompt occupies.
   */
  function height(width) { return textarea.height(Math.max(1, width - INDENT)) + 2; }

  /**
   * Draw the prompt into a region: left bar, indented textarea, meta line, hint.
   * @param {Object} region - The drawing region.
   * @param {Object} ctx - Render context (passed to the textarea, e.g. cursor).
   * @param {Object} options - Draw options.
   * @param {boolean} options.focused - Whether the prompt currently has focus.
   * @returns {void}
   */
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

/**
 * Minimal prompt history: Up (dir -1) walks back, Down (dir +1) walks forward and
 * restores the in-progress draft at the end. Mirrors the live history.move() UX.
 * @returns {Object} The history API (append, list, reset, move).
 */
export function createPromptHistory() {
  const items = [];
  let idx = null;
  let draft = "";
  return {
    /**
     * Append a submitted entry to history and reset the browse cursor.
     * @param {Object} entry - {input, mode} of the submitted prompt.
     * @returns {void}
     */
    append(entry) { if (entry?.input?.trim()) items.push({ input: entry.input, mode: entry.mode ?? "normal" }); idx = null; draft = ""; },
    /**
     * The recorded history entries, oldest first.
     * @returns {Array} The {input, mode} entries.
     */
    list: () => items,
    /**
     * Reset to "not browsing" so the next Up captures a fresh draft + starts at latest.
     * @returns {void}
     */
    reset() { idx = null; draft = ""; }, // back to "not browsing" so the next Up captures a fresh draft + starts at latest
    /**
     * Step through history. dir<0 walks back; dir>0 walks forward, restoring the
     * saved in-progress draft once it walks past the newest entry.
     * @param {number} dir - Direction: negative walks back, positive walks forward.
     * @param {string} current - The current buffer text (saved as the draft on first back-step).
     * @returns {Object|undefined} The {input, mode, atDraft} entry to load, or undefined.
     */
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
