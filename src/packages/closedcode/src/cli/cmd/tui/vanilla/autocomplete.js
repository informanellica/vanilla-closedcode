/**
 * @file Autocomplete dropdown for the vanilla prompt (Stage T3, stage 2). The live
 * component/prompt/autocomplete.js is bound to the SDK (file search, commands) and
 * @opentui extmarks; this is the immediate-mode view + behavior with the data
 * SOURCES injected (commands array + a listFiles(query) callback), so it is
 * headless-testable. Two triggers: a leading "/" => slash commands; an "@" token =>
 * file mentions. Nav keys (Up/Down/Enter/Tab/Escape) are consumed only while
 * visible; on accept it returns the splice {from,to,text} for the caller to apply.
 */
// Autocomplete dropdown for the vanilla prompt (Stage T3, stage 2). The live
// component/prompt/autocomplete.js is bound to the SDK (file search, commands)
// and @opentui extmarks; this is the immediate-mode view + behavior with the
// data SOURCES injected (commands array + a listFiles(query) callback), so it is
// headless-testable. Two triggers: a leading "/" => slash commands; an "@" token
// => file mentions. Nav keys (Up/Down/Enter/Tab/Escape) are consumed only while
// visible; on accept it returns the splice {from,to,text} for the caller to apply.
import { createSignal } from "../runtime/reactivity.js";
import { truncate, fit } from "../runtime/text.js";

/** Lowercase a string (for case-insensitive ranking). */
const lower = s => s.toLowerCase();
/**
 * Rank items against a query: startsWith matches before substring matches,
 * preserving input order within each group. Non-matches are dropped.
 * @param {Array} items - The candidate items.
 * @param {string} query - The query to match (empty returns items unchanged).
 * @param {Function} keyOf - Maps an item to the string to match against.
 * @returns {Array} The ranked, filtered items.
 */
// Rank: startsWith matches before substring matches; preserve input order within.
function rank(items, query, keyOf) {
  if (!query) return items;
  const q = lower(query);
  const starts = [], includes = [];
  for (const it of items) {
    const k = lower(keyOf(it));
    if (k.startsWith(q)) starts.push(it);
    else if (k.includes(q)) includes.push(it);
  }
  return [...starts, ...includes];
}

/**
 * Create the prompt autocomplete model: state signals plus the onInput/handleKey/draw
 * behavior, with command and file data sources injected for headless testing.
 * @param {Object} opts - `{commands, listFiles}`: commands is a static array or an accessor returning {name, description}; listFiles(query) returns (or resolves to) file paths/records.
 * @returns {Object} A model exposing signals (visible, items, active), state setters (setActive, hide), and behavior (onInput, handleKey, draw).
 */
export function createAutocomplete(opts = {}) {
  // commands may be a static array or an accessor (it grows after SDK bootstrap)
  const getCommands = typeof opts.commands === "function" ? opts.commands : () => opts.commands ?? [];
  const listFiles = opts.listFiles ?? (() => []);
  const [visible, setVisible] = createSignal(false);
  const [items, setItems] = createSignal([]); // { kind:"command"|"file", label, value, description? }
  const [active, setActive] = createSignal(0);
  let from = 0, to = 0; // code-point splice range of the token being completed
  let fileReq = 0; // stale-async-guard: only the latest listFiles result applies

  /**
   * Hide the dropdown, clear items, and invalidate any in-flight file request.
   * @returns {void}
   */
  function hide() { fileReq++; setVisible(false); setItems([]); setActive(0); }

  /**
   * Recompute suggestions from the current input value and cursor position.
   * Triggers slash-command completion on a leading "/" token, or file-mention
   * completion on an "@" token; otherwise hides the dropdown.
   * @param {string} value - The full prompt text.
   * @param {number} cursor - The cursor as a code-point offset into `value`.
   * @returns {void}
   */
  // Recompute suggestions from the current value + cursor (code-point offset).
  function onInput(value, cursor) {
    const cs = [...value];
    const c = Math.max(0, Math.min(cursor, cs.length));
    // token under cursor = back to previous whitespace/newline
    let start = c;
    while (start > 0 && !/\s/.test(cs[start - 1])) start--;
    const token = cs.slice(start, c).join("");
    if (token.startsWith("/") && start === 0) {
      const query = token.slice(1);
      const list = rank(getCommands(), query, c => c.name)
        .map(cmd => ({ kind: "command", label: cmd.name, value: cmd.name, description: cmd.description }));
      from = start; to = c;
      setActive(0); setItems(list); setVisible(list.length > 0);
      return;
    }
    if (token.startsWith("@")) {
      const query = token.slice(1);
      from = start; to = c;
      // listFiles may be sync (array) or async (e.g. sdk.find.files -> Promise).
      // Async results apply only if no newer request/hide superseded them.
      const apply = files => {
        const list = (files ?? []).slice(0, 50)
          .map(f => ({ kind: "file", label: typeof f === "string" ? f : f.path, value: typeof f === "string" ? f : f.path }));
        setActive(0); setItems(list); setVisible(list.length > 0);
      };
      const result = listFiles(query);
      if (result && typeof result.then === "function") {
        const req = ++fileReq;
        result.then(files => { if (req === fileReq) apply(files); }, () => { if (req === fileReq) apply([]); });
      } else {
        apply(result);
      }
      return;
    }
    hide();
  }

  /**
   * Handle a navigation key while the dropdown is visible (Up/Down/Escape/Enter/Tab).
   * @param {string} name - The key name.
   * @returns {Object} `{consumed}` and, on accept, `{accept: {from, to, text}}` — the code-point splice the caller should apply.
   */
  // Returns { consumed, accept? }. accept = { from, to, text } splice to apply.
  function handleKey(name) {
    if (!visible()) return { consumed: false };
    const n = items().length;
    switch (name) {
      case "UP": setActive(a => (a - 1 + n) % n); return { consumed: true };
      case "DOWN": setActive(a => (a + 1) % n); return { consumed: true };
      case "ESCAPE": hide(); return { consumed: true };
      case "ENTER": case "TAB": {
        const it = items()[active()];
        hide();
        if (!it) return { consumed: true };
        const text = (it.kind === "command" ? "/" + it.value : "@" + it.value) + " ";
        return { consumed: true, accept: { from, to, text } };
      }
      default: return { consumed: false };
    }
  }

  /**
   * Draw the dropdown into `region`, scrolling to keep the active item visible.
   * @param {Object} region - Render region with `width`, `height`, and `line(i, text, attr)`.
   * @param {Object} options - `{attr, activeAttr, descAttr}` cell attributes for normal, active, and description text.
   * @returns {void}
   */
  // Draw the dropdown into `region` (callers anchor it above/below the prompt).
  function draw(region, { attr, activeAttr, descAttr } = {}) {
    const its = items();
    const h = region.height;
    const a = active();
    const start = a >= h ? a - h + 1 : 0;
    for (let i = 0; i < h && start + i < its.length; i++) {
      const idx = start + i;
      const it = its[idx];
      const isActive = idx === a;
      let label = (isActive ? "› " : "  ") + it.label;
      if (it.description) label = fit(label, Math.max(0, Math.floor(region.width * 0.5)), "left") + " " + it.description;
      region.line(i, truncate(label, region.width), isActive ? (activeAttr ?? { inverse: true }) : (it.kind === "file" ? attr : attr));
    }
  }

  return { visible, items, active, setActive, onInput, handleKey, draw, hide };
}
