// First-party reimplementation of the subset of `@solid-primitives/media`
// used by this app: `createMediaQuery`.
//
// Port/derivative of @solid-primitives/media (MIT License,
// Copyright (c) 2021 Solid Primitives Working Group). See THIRD-PARTY-NOTICES.md.
//
// Imports only from "../reactivity.js". Behavior matches upstream on the real solid-js
// runtime in a client (browser) environment.
//
// Scope note: the upstream package also exports `makeMediaQueryListener`,
// `createPrefersDark`, `usePrefersDark`, `createBreakpoints`, and `sortBreakpoints`;
// none are used here and are intentionally omitted.
//
// SSR note: upstream wraps state creation in `createHydratableSignal`, which only
// differs from a plain `createSignal(update())` during SSR / hydration. This app's
// renderer is client-only (build-less native ESM), so the hydratable path is never
// taken and the runtime behavior is identical to upstream.

/** @file First-party reimplementation of @solid-primitives/media's createMediaQuery (reactive media-query accessor). */

import { createSignal, getOwner, onCleanup } from "../reactivity.js";

// Inlined `tryOnCleanup` (Solid's `onCleanup` without the dev-only out-of-owner warning).
/**
 * Register a cleanup if inside a reactive owner, otherwise return the function
 * unregistered (Solid's `onCleanup` without the dev-only out-of-owner warning).
 *
 * @param {Function} fn - Cleanup function to (conditionally) register.
 * @returns {Function} The cleanup function.
 */
const tryOnCleanup = fn => (getOwner() ? onCleanup(fn) : fn);

// Inlined `makeEventListener` (auto-removed on cleanup), matching the upstream helper
// that `createMediaQuery` relies on internally.
/**
 * Attach an event listener that is automatically removed on scope cleanup.
 *
 * @param {EventTarget} target - Object to listen on.
 * @param {string} type - Event type to subscribe to.
 * @param {Function} handler - Event handler.
 * @param {*} options - addEventListener options forwarded to the target.
 * @returns {Function} A function that removes the listener.
 */
const makeEventListener = (target, type, handler, options) => {
  target.addEventListener(type, handler, options);
  return tryOnCleanup(target.removeEventListener.bind(target, type, handler, options));
};

/**
 * Create a reactive boolean accessor reflecting whether a media query matches.
 *
 * @param query Media query string to listen for.
 * @param serverFallback Value returned on the server (unused client-side; kept for
 *   signature parity with upstream). Defaults to `false`.
 * @returns Accessor returning whether the media query currently matches.
 */
export function createMediaQuery(query, serverFallback = false) {
  void serverFallback; // referenced only for signature parity; no SSR in this renderer
  const mql = window.matchMedia(query);
  const [state, setState] = createSignal(mql.matches);
  const update = () => setState(mql.matches);
  makeEventListener(mql, "change", update);
  return state;
}
