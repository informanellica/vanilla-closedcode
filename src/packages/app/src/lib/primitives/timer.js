// First-party reimplementation of the subset of `@solid-primitives/timer`
// used by this app: `makeTimer`.
//
// Port/derivative of @solid-primitives/timer (MIT License,
// Copyright (c) 2021 Solid Primitives Working Group). See THIRD-PARTY-NOTICES.md.
//
// Imports only from "solid-js". Behavior matches upstream on the real solid-js runtime.
//
// Scope note: the upstream package also exports `createTimer`, `createTimeoutLoop`,
// `createPolled`, and `createIntervalCounter`; none are used here and are omitted.

import { onCleanup } from "solid-js";

/**
 * Create a timer (via the supplied `timer`, e.g. `setTimeout` or `setInterval`)
 * that is automatically cleared when the reactive scope is disposed.
 *
 * Note: upstream clears both timeout and interval ids with `clearInterval`, which
 * is valid because timeout/interval ids share the same handle space; preserved here.
 *
 * @param fn Function to call after/every `delay`.
 * @param delay Time between executions of `fn` in ms.
 * @param timer The timer factory to use: `setTimeout` or `setInterval`.
 * @returns Function to manually clear the timer.
 */
export const makeTimer = (fn, delay, timer) => {
  const intervalId = timer(fn, delay);
  const clear = () => clearInterval(intervalId);
  return onCleanup(clear);
};
