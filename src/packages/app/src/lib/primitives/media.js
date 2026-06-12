// First-party reimplementation of the subset of `@solid-primitives/media`
// used by this app: `createMediaQuery`.
//
// Imports only from "solid-js". Behavior matches upstream on the real solid-js
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

import { createSignal, getOwner, onCleanup } from "solid-js";

// Inlined `tryOnCleanup` (Solid's `onCleanup` without the dev-only out-of-owner warning).
const tryOnCleanup = fn => (getOwner() ? onCleanup(fn) : fn);

// Inlined `makeEventListener` (auto-removed on cleanup), matching the upstream helper
// that `createMediaQuery` relies on internally.
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
