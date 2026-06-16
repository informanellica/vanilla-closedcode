/** @file First-party reimplementation of the `@solid-primitives/event-listener` subset (makeEventListener, createEventListener) with automatic owner-scoped cleanup. */
// First-party reimplementation of the subset of `@solid-primitives/event-listener`
// used by this app: `makeEventListener` and `createEventListener`.
//
// Port/derivative of @solid-primitives/event-listener (MIT License,
// Copyright (c) 2021 Solid Primitives Working Group). See THIRD-PARTY-NOTICES.md.
//
// Imports only from "../reactivity.js" so it follows the import-map flip to a self-written
// reactive core. Behavior matches the upstream package on the real solid-js runtime.
//
// Scope note: the upstream package also exports `createEventSignal` and an
// `eventListener` directive; those are not used here and are intentionally omitted.

import { createEffect, createRenderEffect, getOwner, onCleanup } from "../reactivity.js";

// Upstream uses `tryOnCleanup` from "@solid-primitives/utils": Solid's `onCleanup`
// that does not warn (in dev) when used outside of an owner. Inlined here.
/**
 * Register a cleanup callback only if a reactive owner is present; otherwise return it as-is.
 * @param {Function} fn - Cleanup callback.
 * @returns {Function} The registered (or pass-through) cleanup callback.
 */
const tryOnCleanup = fn => (getOwner() ? onCleanup(fn) : fn);

// Upstream `access`: call zero-arg functions, otherwise return the value as-is.
/**
 * Resolve an accessor: invoke zero-argument functions, otherwise return the value unchanged.
 * @param {*} v - A value or a zero-argument accessor function.
 * @returns {*} The resolved value.
 */
const access = v => (typeof v === "function" && !v.length ? v() : v);

// Upstream `asArray`: wrap a single value in an array, keep arrays, drop nullish.
/**
 * Normalize a value to an array: keep arrays, wrap a single value, drop nullish.
 * @param {*} value - A value, an array, or nullish.
 * @returns {Array} The normalized array.
 */
const asArray = value => (Array.isArray(value) ? value : value ? [value] : []);

/**
 * Add an event listener to `target` that is automatically removed on cleanup.
 *
 * @param {EventTarget} target - EventTarget to attach the listener to.
 * @param {string} type - Event type string.
 * @param {Function} handler - Event handler.
 * @param {*} options - addEventListener options.
 * @returns {Function} A function that removes the listener (also called on cleanup).
 */
export function makeEventListener(target, type, handler, options) {
  target.addEventListener(type, handler, options);
  return tryOnCleanup(target.removeEventListener.bind(target, type, handler, options));
}

/**
 * Attach event listeners to one or more reactive targets/types.
 * Listeners are cleaned up automatically.
 *
 * @param {*} targets - Element(s) or an accessor function returning element(s).
 * @param {*} type - Event type(s) or an accessor function returning event type(s).
 * @param {Function} handler - Event handler.
 * @param {*} options - addEventListener options.
 * @returns {void}
 */
export function createEventListener(targets, type, handler, options) {
  const attachListeners = () => {
    asArray(access(targets)).forEach(el => {
      if (el) asArray(access(type)).forEach(t => makeEventListener(el, t, handler, options));
    });
  };
  // If the target is an accessor, defer attaching to the first effect (onMount-like)
  // so a JSX ref is available. Otherwise attach right away in a render effect.
  if (typeof targets === "function") createEffect(attachListeners);
  else createRenderEffect(attachListeners);
}
