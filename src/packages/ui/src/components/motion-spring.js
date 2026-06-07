import { attachSpring, motionValue } from "motion";
import { createEffect, createSignal, onCleanup } from "solid-js";
const eq = (a, b) => a?.visualDuration === b?.visualDuration && a?.bounce === b?.bounce && a?.stiffness === b?.stiffness && a?.damping === b?.damping && a?.mass === b?.mass && a?.velocity === b?.velocity;
export function useSpring(target, options) {
  const read = () => typeof options === "function" ? options() : options;
  const [value, setValue] = createSignal(target());
  const source = motionValue(value());
  const spring = motionValue(value());
  let config = read();
  let stop = attachSpring(spring, source, config);
  let off = spring.on("change", next => setValue(next));
  createEffect(() => {
    source.set(target());
  });
  createEffect(() => {
    if (!options) return;
    const next = read();
    if (eq(config, next)) return;
    config = next;
    stop();
    stop = attachSpring(spring, source, next);
    setValue(spring.get());
  });
  onCleanup(() => {
    off();
    stop();
    spring.destroy();
    source.destroy();
  });
  return value;
}