/** @file Reactive spring hook bridging Motion's spring animation to a reactivity signal. */
import { attachSpring, motionValue } from "motion";
import { createEffect, createSignal, onCleanup } from "../../../lib/reactivity.js";
/**
 * Shallow-compare two spring config objects across the fields that affect the spring.
 * @param {Object} a - First spring config (may be nullish).
 * @param {Object} b - Second spring config (may be nullish).
 * @returns {boolean} True when all compared fields (visualDuration, bounce, stiffness, damping, mass, velocity) match.
 */
const eq = (a, b) => a?.visualDuration === b?.visualDuration && a?.bounce === b?.bounce && a?.stiffness === b?.stiffness && a?.damping === b?.damping && a?.mass === b?.mass && a?.velocity === b?.velocity;
/**
 * Create a signal whose value springs toward a reactive target via Motion.
 * Tracks `target` and drives a Motion spring; updating `options` re-attaches the spring with the new config.
 * @param {Function} target - Accessor returning the current target value to spring toward.
 * @param {Object} options - Spring config object, or an accessor returning one. May be omitted for defaults.
 * @returns {Function} Accessor returning the current (animating) spring value.
 */
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