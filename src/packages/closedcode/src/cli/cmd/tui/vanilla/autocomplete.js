// Autocomplete dropdown for the vanilla prompt (Stage T3, stage 2). The live
// component/prompt/autocomplete.js is bound to the SDK (file search, commands)
// and @opentui extmarks; this is the immediate-mode view + behavior with the
// data SOURCES injected (commands array + a listFiles(query) callback), so it is
// headless-testable. Two triggers: a leading "/" => slash commands; an "@" token
// => file mentions. Nav keys (Up/Down/Enter/Tab/Escape) are consumed only while
// visible; on accept it returns the splice {from,to,text} for the caller to apply.
import { createSignal } from "../runtime/reactivity.js";
import { truncate, fit } from "../runtime/text.js";

const lower = s => s.toLowerCase();
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

export function createAutocomplete(opts = {}) {
  const commands = opts.commands ?? [];
  const listFiles = opts.listFiles ?? (() => []);
  const [visible, setVisible] = createSignal(false);
  const [items, setItems] = createSignal([]); // { kind:"command"|"file", label, value, description? }
  const [active, setActive] = createSignal(0);
  let from = 0, to = 0; // code-point splice range of the token being completed

  function hide() { setVisible(false); setItems([]); setActive(0); }

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
      const list = rank(commands, query, c => c.name)
        .map(cmd => ({ kind: "command", label: cmd.name, value: cmd.name, description: cmd.description }));
      from = start; to = c;
      setActive(0); setItems(list); setVisible(list.length > 0);
      return;
    }
    if (token.startsWith("@")) {
      const query = token.slice(1);
      const list = (listFiles(query) ?? []).slice(0, 50)
        .map(f => ({ kind: "file", label: typeof f === "string" ? f : f.path, value: typeof f === "string" ? f : f.path }));
      from = start; to = c;
      setActive(0); setItems(list); setVisible(list.length > 0);
      return;
    }
    hide();
  }

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
