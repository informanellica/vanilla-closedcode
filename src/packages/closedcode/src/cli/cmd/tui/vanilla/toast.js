// Transient toast notifications for the vanilla TUI (Stage T3, stage 4). The
// live ui/toast.js stacks variant-colored toasts; this is the immediate-mode
// version with an injectable clock (so expiry is deterministic in tests). Toasts
// are drawn as a bottom-right stack over the root region; expired ones drop out
// on the next show() or via prune().
import { createSignal } from "../runtime/reactivity.js";
import { truncate } from "../runtime/text.js";
import { attr, defaultTheme } from "./theme.js";

const VARIANT_TOKEN = { info: "info", success: "success", warning: "warning", error: "error" };

export function createToast(opts = {}) {
  const theme = opts.theme ?? defaultTheme;
  const now = opts.now ?? (() => Date.now());
  const [items, setItems] = createSignal([]); // { id, message, variant, until }
  let seq = 0;

  const live = list => list.filter(i => i.until > now());

  function show({ message, variant = "info", duration = 3000 } = {}) {
    const id = ++seq;
    setItems(list => [...live(list), { id, message: String(message ?? ""), variant, until: now() + duration }]);
    return id;
  }
  const error = e => show({ message: e?.message ?? String(e), variant: "error", duration: 5000 });
  const prune = () => setItems(list => live(list));
  const visible = () => live(items());

  function draw(region) {
    const shown = visible().slice(-3); // newest 3, stacked bottom-right
    const maxW = Math.min(40, region.width);
    shown.forEach((it, i) => {
      const row = region.height - shown.length + i;
      if (row < 0) return;
      const text = truncate(" " + it.message + " ", maxW);
      region.text(region.width - text.length, row, text, attr(theme, VARIANT_TOKEN[it.variant] ?? "info", { inverse: true }));
    });
  }

  return { show, error, prune, visible, items, draw };
}
