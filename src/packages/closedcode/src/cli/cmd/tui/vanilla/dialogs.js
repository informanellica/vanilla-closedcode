// Dialog families for the vanilla TUI (Stage T3, stage 3). The live dialogs are
// dozens of compiled-Solid components, but the milestone notes most reduce to a
// few shapes: a filtered SELECT list, a CONFIRM (yes/no), an ALERT (message), and
// a text PROMPT. These are promise-returning helpers bound to the shell's dialog
// manager (dialog.open/close with an onClose hook), so the SDK-backed dialogs
// (model/agent/session/theme/…) become thin callers that supply options + an
// onSelect. Widgets are { draw(region, ctx), handleKey(name, data) } and are
// headless-testable.
//
// Close protocol (so stacked dialogs don't double-pop): the WIDGET's own action
// (Enter/select) records the result and calls dialog.close() exactly ONCE; the
// manager's onClose hook ONLY resolves the promise — it never calls close again.
// Escape goes manager.onEscape -> close -> onClose -> resolve(undefined). Earlier,
// a finish() that both resolved AND called close from inside onClose popped two
// layers on a single Escape when dialogs were stacked.
import { createSignal } from "../runtime/reactivity.js";
import { createTextInput } from "../runtime/input.js";
import { createSelectList } from "../runtime/list.js";
import { wordWrap, fit, truncate } from "../runtime/text.js";
import { attr, defaultTheme } from "./theme.js";

const normalizeOption = o => (typeof o === "string" ? { label: o, value: o } : o);

// Filtered single-select. Resolves with the chosen option (or undefined on esc).
export function select(dialog, opts = {}) {
  const theme = opts.theme ?? defaultTheme;
  const filterOn = opts.filter !== false;
  const maxRows = opts.maxRows ?? 10;
  const options = (opts.options ?? []).map(normalizeOption);
  return new Promise(resolve => {
    let done = false;
    let result; // undefined = escaped/dismissed
    const resolveOnce = () => { if (done) return; done = true; resolve(result); };
    const filterInput = filterOn ? createTextInput("", { onChange: () => list.setActive(0) }) : null;
    function filtered() {
      if (!filterInput) return options;
      const q = filterInput.value().toLowerCase();
      if (!q) return options;
      const starts = [], inc = [];
      for (const o of options) {
        const hay = (o.label + " " + (o.category ?? "")).toLowerCase();
        if (o.label.toLowerCase().startsWith(q)) starts.push(o);
        else if (hay.includes(q)) inc.push(o);
      }
      return [...starts, ...inc];
    }
    const list = createSelectList(filtered, {
      now: opts.now,
      onSelect: it => { result = it; dialog.close(); opts.onSelect?.(it); }, // close THIS dialog before the callback may open another
    });
    const widget = {
      handleKey(name, data) {
        switch (name) {
          case "UP": case "DOWN": case "HOME": case "END": case "ENTER": return list.handleKey(name, data);
          case "PAGE_UP": list.setActive(a => Math.max(0, a - maxRows)); return true;
          case "PAGE_DOWN": list.setActive(a => Math.min(filtered().length - 1, a + maxRows)); return true;
          default:
            if (filterInput) return filterInput.handleKey(name, data);
            return list.handleKey(name, data); // typeahead when no filter
        }
      },
      draw(region, ctx) {
        let top = 0;
        if (filterInput) {
          filterInput.draw(region.sub(0, 0, region.width, 1), { focused: true, ctx, attr: attr(theme, "text"), placeholder: opts.placeholder ?? "Search" });
          top = 1;
        }
        if (filtered().length === 0) { region.line(top, "No results", attr(theme, "textMuted")); return; }
        list.draw(region.sub(0, top, region.width, region.height - top), { attr: attr(theme, "text"), activeAttr: { inverse: true } });
      },
    };
    const listRows = Math.min(Math.max(options.length, 1), maxRows);
    dialog.open({
      title: opts.title ?? "Select",
      width: opts.width ?? 50,
      height: listRows + (filterOn ? 1 : 0) + 2,
      widget,
      onClose: resolveOnce,
    });
  });
}

// Yes/No. Resolves true (confirm) / false (cancel) / undefined (escape).
export function confirm(dialog, opts = {}) {
  const theme = opts.theme ?? defaultTheme;
  const confirmLabel = opts.confirmLabel ?? "Confirm";
  const cancelLabel = opts.cancelLabel ?? "Cancel";
  const message = opts.message ?? "";
  return new Promise(resolve => {
    let done = false;
    let result; // undefined on escape
    const resolveOnce = () => { if (done) return; done = true; resolve(result); };
    const [active, setActive] = createSignal("confirm");
    const widget = {
      handleKey(name) {
        if (name === "LEFT" || name === "RIGHT") { setActive(a => (a === "confirm" ? "cancel" : "confirm")); return true; }
        if (name === "ENTER") { result = active() === "confirm"; dialog.close(); return true; }
        return false;
      },
      draw(region) {
        const lines = wordWrap(message, region.width);
        lines.slice(0, region.height - 1).forEach((l, i) => region.line(i, l, attr(theme, "textMuted")));
        const c = active();
        const btn = (label, key) => (key === c ? "▌" + label + " " : " " + label + " ");
        const bar = btn(cancelLabel, "cancel") + "  " + btn(confirmLabel, "confirm");
        region.line(region.height - 1, fit(bar, region.width, "right"), attr(theme, "text"));
      },
    };
    const h = Math.min(wordWrap(message, (opts.width ?? 50) - 4).length, 6) + 1;
    dialog.open({ title: opts.title ?? "Confirm", width: opts.width ?? 50, height: h + 2, widget, onClose: resolveOnce });
  });
}

// Message + dismiss (Enter/Esc). Resolves when closed.
export function alert(dialog, opts = {}) {
  const theme = opts.theme ?? defaultTheme;
  const message = opts.message ?? "";
  return new Promise(resolve => {
    let done = false;
    const resolveOnce = () => { if (done) return; done = true; resolve(); };
    const widget = {
      handleKey(name) { if (name === "ENTER") { dialog.close(); return true; } return false; },
      draw(region) {
        const lines = wordWrap(message, region.width);
        lines.slice(0, region.height - 1).forEach((l, i) => region.line(i, l, attr(theme, "text")));
        region.line(region.height - 1, "enter / esc to dismiss", attr(theme, "textMuted"));
      },
    };
    const h = Math.min(wordWrap(message, (opts.width ?? 50) - 4).length, 8) + 1;
    dialog.open({ title: opts.title ?? "Alert", width: opts.width ?? 50, height: h + 2, widget, onClose: resolveOnce });
  });
}

// Single-line text prompt. Resolves with the entered string (or undefined).
export function prompt(dialog, opts = {}) {
  const theme = opts.theme ?? defaultTheme;
  return new Promise(resolve => {
    let done = false;
    let result; // undefined on escape
    const resolveOnce = () => { if (done) return; done = true; resolve(result); };
    const input = createTextInput(opts.initial ?? "");
    const widget = {
      handleKey(name, data) {
        if (name === "ENTER") { result = input.value(); dialog.close(); return true; }
        return input.handleKey(name, data);
      },
      draw(region, ctx) {
        if (opts.message) region.line(0, truncate(opts.message, region.width), attr(theme, "textMuted"));
        const row = opts.message ? 1 : 0;
        input.draw(region.sub(0, row, region.width, 1), { focused: true, ctx, attr: attr(theme, "text"), placeholder: opts.placeholder ?? "" });
      },
    };
    dialog.open({ title: opts.title ?? "Input", width: opts.width ?? 50, height: (opts.message ? 1 : 0) + 1 + 2, widget, onClose: resolveOnce });
  });
}
