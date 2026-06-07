import { createEffect, createSignal, on, onCleanup } from "solid-js";
import { debounce } from "@solid-primitives/scheduled";
export function createDebouncedSignal(value, ms) {
  const [get, set] = createSignal(value);
  return [get, debounce(v => set(() => v), ms)];
}
export function createFadeIn(show, enabled) {
  const [alpha, setAlpha] = createSignal(show() ? 1 : 0);
  let revealed = show();
  createEffect(on([show, enabled], ([visible, animate]) => {
    if (!visible) {
      setAlpha(0);
      return;
    }
    if (!animate || revealed) {
      revealed = true;
      setAlpha(1);
      return;
    }
    const start = performance.now();
    revealed = true;
    setAlpha(0);
    const timer = setInterval(() => {
      const progress = Math.min((performance.now() - start) / 160, 1);
      setAlpha(progress * progress * (3 - 2 * progress));
      if (progress >= 1) clearInterval(timer);
    }, 16);
    onCleanup(() => clearInterval(timer));
  }));
  return alpha;
}