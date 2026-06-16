// First-party reimplementation of the subset of `@solid-primitives/resize-observer`
// used by this app: `createResizeObserver` (and its helper `makeResizeObserver`).
//
// Port/derivative of @solid-primitives/resize-observer (MIT License,
// Copyright (c) 2021 Solid Primitives Working Group). See THIRD-PARTY-NOTICES.md.
//
// Imports only from "../reactivity.js". Behavior matches upstream on the real solid-js runtime.
//
// Scope note: the upstream package also exports `getWindowSize`, `createWindowSize`,
// `useWindowSize`, `getElementSize`, and `createElementSize`; none are used here and
// are intentionally omitted.

/** @file First-party reimplementation of @solid-primitives/resize-observer (createResizeObserver / makeResizeObserver). */

import { createEffect, onCleanup } from "../reactivity.js";

// Upstream `noop`.
/**
 * No-op function.
 *
 * @returns {void}
 */
const noop = () => undefined;

// Upstream `access`: call zero-arg functions, otherwise return the value as-is.
/**
 * Unwrap a value that may be a zero-arg accessor function or a static value.
 *
 * @param {*} v - Accessor function or static value.
 * @returns {*} The resolved value.
 */
const access = v => (typeof v === "function" && !v.length ? v() : v);

// Upstream `asArray`: wrap a single value in an array, keep arrays, drop nullish.
/**
 * Normalize a value into an array: keep arrays, wrap a single value, drop nullish.
 *
 * @param {*} value - Value, array of values, or nullish.
 * @returns {Array} An array of values (possibly empty).
 */
const asArray = value => (Array.isArray(value) ? value : value ? [value] : []);

// Upstream `filterNonNullable`.
/**
 * Filter out null and undefined entries from an array.
 *
 * @param {Array} arr - Source array.
 * @returns {Array} A new array without nullish entries.
 */
const filterNonNullable = arr => arr.filter(i => i != null);

// Upstream `handleDiffArray`: diff two arrays by reference, invoking add/remove
// callbacks for the changed items only.
/**
 * Diff two arrays by reference, invoking the add/remove callbacks only for the
 * items that were added or removed between `prev` and `current`.
 *
 * @param {Array} current - Current array of items.
 * @param {Array} prev - Previous array of items.
 * @param {Function} handleAdded - Called with each newly added item.
 * @param {Function} handleRemoved - Called with each removed item.
 * @returns {void}
 */
function handleDiffArray(current, prev, handleAdded, handleRemoved) {
  const currLength = current.length;
  const prevLength = prev.length;
  let i = 0;
  if (!prevLength) {
    for (; i < currLength; i++) handleAdded(current[i]);
    return;
  }
  if (!currLength) {
    for (; i < prevLength; i++) handleRemoved(prev[i]);
    return;
  }
  for (; i < prevLength; i++) {
    if (prev[i] !== current[i]) break;
  }
  let prevEl;
  let currEl;
  prev = prev.slice(i);
  current = current.slice(i);
  for (prevEl of prev) {
    if (!current.includes(prevEl)) handleRemoved(prevEl);
  }
  for (currEl of current) {
    if (!prev.includes(currEl)) handleAdded(currEl);
  }
}

/**
 * Instantiate a new ResizeObserver that is automatically disconnected on cleanup.
 *
 * @param callback Handler called when an observed element's size changes.
 * @param options ResizeObserver options.
 * @returns `observe` and `unobserve` functions.
 */
export function makeResizeObserver(callback, options) {
  const observer = new ResizeObserver(callback);
  onCleanup(observer.disconnect.bind(observer));
  return {
    observe: ref => observer.observe(ref, options),
    unobserve: observer.unobserve.bind(observer),
  };
}

/**
 * Create a ResizeObserver listening for size changes of the reactive `targets`.
 * `onResize(contentRect, target, entry)` fires only when the rounded width/height
 * actually changes.
 *
 * @param targets Element(s) or accessor returning element(s) to observe.
 * @param onResize Handler triggered on element resize.
 * @param options ResizeObserver options.
 */
export function createResizeObserver(targets, onResize, options) {
  const previousMap = new WeakMap();
  const { observe, unobserve } = makeResizeObserver(entries => {
    for (const entry of entries) {
      const { contentRect, target } = entry;
      const width = Math.round(contentRect.width);
      const height = Math.round(contentRect.height);
      const previous = previousMap.get(target);
      if (!previous || previous.width !== width || previous.height !== height) {
        onResize(contentRect, target, entry);
        previousMap.set(target, { width, height });
      }
    }
  }, options);
  createEffect(prev => {
    const refs = filterNonNullable(asArray(access(targets)));
    handleDiffArray(refs, prev, observe, unobserve);
    return refs;
  }, []);
}
