// First-party reimplementation of the subset of `@solid-primitives/event-listener`
// used by this app: `makeEventListener` and `createEventListener`.
//
// Port/derivative of @solid-primitives/event-listener (MIT License,
// Copyright (c) 2021 Solid Primitives Working Group). See THIRD-PARTY-NOTICES.md.
//
// Imports only from "solid-js" so it follows the import-map flip to a self-written
// reactive core. Behavior matches the upstream package on the real solid-js runtime.
//
// Scope note: the upstream package also exports `createEventSignal` and an
// `eventListener` directive; those are not used here and are intentionally omitted.

import { createEffect, createRenderEffect, getOwner, onCleanup } from "solid-js";

// Upstream uses `tryOnCleanup` from "@solid-primitives/utils": Solid's `onCleanup`
// that does not warn (in dev) when used outside of an owner. Inlined here.
const tryOnCleanup = fn => (getOwner() ? onCleanup(fn) : fn);

// Upstream `access`: call zero-arg functions, otherwise return the value as-is.
const access = v => (typeof v === "function" && !v.length ? v() : v);

// Upstream `asArray`: wrap a single value in an array, keep arrays, drop nullish.
const asArray = value => (Array.isArray(value) ? value : value ? [value] : []);

/**
 * Add an event listener to `target` that is automatically removed on cleanup.
 *
 * @param target EventTarget to attach the listener to.
 * @param type Event type string.
 * @param handler Event handler.
 * @param options addEventListener options.
 * @returns A function that removes the listener (also called on cleanup).
 */
export function makeEventListener(target, type, handler, options) {
  target.addEventListener(type, handler, options);
  return tryOnCleanup(target.removeEventListener.bind(target, type, handler, options));
}

/**
 * Attach event listeners to one or more reactive targets/types.
 * Listeners are cleaned up automatically.
 *
 * @param targets Element(s) or accessor returning element(s).
 * @param type Event type(s) or accessor returning event type(s).
 * @param handler Event handler.
 * @param options addEventListener options.
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
