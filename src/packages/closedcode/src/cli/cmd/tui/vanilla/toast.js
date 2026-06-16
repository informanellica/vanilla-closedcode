/**
 * @file Transient toast notifications for the vanilla TUI (Stage T3, stage 4). The
 * live ui/toast.js stacks variant-colored toasts; this is the immediate-mode
 * version with an injectable clock (so expiry is deterministic in tests). Toasts
 * are drawn as a bottom-right stack over the root region; expired ones drop out
 * on the next show() or via prune().
 */
import { createSignal } from "../runtime/reactivity.js";
import { truncate, width } from "../runtime/text.js";
import { attr, defaultTheme } from "./theme.js";

const VARIANT_TOKEN = { info: "info", success: "success", warning: "warning", error: "error" };

/**
 * Create a toast controller for the vanilla TUI.
 * @param {Object} opts - Options: theme (Theme), now (Function returning a timestamp in ms), scheduleRepaint (Function called with a toast duration).
 * @returns {Object} Controller with { show, error, prune, visible, items, draw }.
 */
export function createToast(opts = {}) {
  const theme = opts.theme ?? defaultTheme;
  const now = opts.now ?? (() => Date.now());
  // Called with the toast's duration so the app can schedule a repaint when it is
  // due to expire — otherwise an idle screen (no key/resize) never re-renders and
  // the toast lingers forever. mountShell wires this to app.repaint.
  const scheduleRepaint = opts.scheduleRepaint;
  const [items, setItems] = createSignal([]); // { id, message, variant, until }
  let seq = 0;

  /**
   * Filter a list down to toasts that have not yet expired.
   * @param {Array} list - Toast items ({ id, message, variant, until }).
   * @returns {Array} Only the items whose until is in the future.
   */
  const live = list => list.filter(i => i.until > now());

  /**
   * Show a new toast, pruning expired ones and scheduling an expiry repaint.
   * @param {Object} arg - Toast spec: message (any, stringified), variant ("info"|"success"|"warning"|"error"), duration (number, ms).
   * @returns {number} The new toast's sequence id.
   */
  function show({ message, variant = "info", duration = 3000 } = {}) {
    const id = ++seq;
    setItems(list => [...live(list), { id, message: String(message ?? ""), variant, until: now() + duration }]);
    scheduleRepaint?.(duration);
    return id;
  }
  /**
   * Show an error-variant toast for the given error.
   * @param {*} e - An Error or any value; its message (or string form) is shown.
   * @returns {number} The new toast's sequence id.
   */
  const error = e => show({ message: e?.message ?? String(e), variant: "error", duration: 5000 });
  /** Drop expired toasts from the live set. @returns {void} */
  const prune = () => setItems(list => live(list));
  /** @returns {Array} The currently non-expired toasts. */
  const visible = () => live(items());

  /**
   * Draw the newest few toasts as a bottom-right stack over the region.
   * @param {Object} region - Render region with { width, height } and a text() surface.
   * @returns {void}
   */
  function draw(region) {
    const shown = visible().slice(-3); // newest 3, stacked bottom-right
    const maxW = Math.min(40, region.width);
    shown.forEach((it, i) => {
      const row = region.height - shown.length + i;
      if (row < 0) return;
      const text = truncate(" " + it.message + " ", maxW);
      // Position by DISPLAY width (fullwidth CJK = 2 cols), not code-unit length,
      // so a Japanese toast isn't pushed off the right edge.
      region.text(region.width - width(text), row, text, attr(theme, VARIANT_TOKEN[it.variant] ?? "info", { inverse: true }));
    });
  }

  return { show, error, prune, visible, items, draw };
}
