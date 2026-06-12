// First-party reimplementation of the subset of `@solid-primitives/storage`
// used by this app: `makePersisted`.
//
// Port/derivative of @solid-primitives/storage (MIT License,
// Copyright (c) 2021 Solid Core Team). See THIRD-PARTY-NOTICES.md.
//
// Imports from "solid-js" and "solid-js/store" (the latter is genuinely required:
// the store-backed branch reconciles deserialized data into the store).
// Behavior matches upstream on the real solid-js runtime.
//
// Scope note: the upstream package also exports `storageSync`, `messageSync`,
// `wsSync`, `multiplexSync`, cookie/tauri storage, and tools; none are used here.
// The app always passes a `createStore(...)` tuple (so `signal[0]` is NOT a
// function) and never passes `serialize`/`deserialize`/`sync`/`storageOptions`.
// The function-signal branch and the `sync` plumbing are still ported for faithful
// parity with the signature/return shape.

import { createUniqueId, untrack } from "solid-js";
import { reconcile } from "solid-js/store";

/**
 * Wrap a signal or store tuple so its value is persisted to (and rehydrated from)
 * a storage backend.
 *
 * @param signal A `[get, set]` tuple from `createSignal` or `createStore`.
 * @param options `{ name, storage, storageOptions, serialize, deserialize, sync }`.
 * @returns `[get, set, init]` where `init` is the raw stored value (or a Promise of it).
 */
export function makePersisted(signal, options = {}) {
  const storage = options.storage || globalThis.localStorage;
  const name = options.name || `storage-${createUniqueId()}`;
  if (!storage) {
    return [signal[0], signal[1], null];
  }
  const storageOptions = options.storageOptions;
  const serialize = options.serialize || JSON.stringify.bind(JSON);
  const deserialize = options.deserialize || JSON.parse.bind(JSON);
  const init = storage.getItem(name, storageOptions);
  const set =
    typeof signal[0] === "function"
      ? data => {
          try {
            const value = deserialize(data);
            signal[1](() => value);
          } catch {
            // Upstream warns here only in dev; swallow to match production behavior.
          }
        }
      : data => {
          try {
            const value = deserialize(data);
            signal[1](reconcile(value));
          } catch {
            // Upstream warns here only in dev; swallow to match production behavior.
          }
        };
  let unchanged = true;
  if (init instanceof Promise) init.then(data => unchanged && data && set(data));
  else if (init) set(init);
  if (typeof options.sync?.[0] === "function") {
    const get = typeof signal[0] === "function" ? signal[0] : () => signal[0];
    options.sync[0](data => {
      if (
        data.key !== name ||
        (data.url || globalThis.location.href) !== globalThis.location.href ||
        data.newValue === serialize(untrack(get))
      ) {
        return;
      }
      set(data.newValue);
    });
  }
  return [
    signal[0],
    typeof signal[0] === "function"
      ? value => {
          const output = signal[1](value);
          const serialized = value != null ? serialize(output) : value;
          options.sync?.[1](name, serialized);
          if (serialized != null) storage.setItem(name, serialized, storageOptions);
          else storage.removeItem(name, storageOptions);
          unchanged = false;
          return output;
        }
      : (...args) => {
          signal[1](...args);
          const value = serialize(untrack(() => signal[0]));
          options.sync?.[1](name, value);
          storage.setItem(name, value, storageOptions);
          unchanged = false;
        },
    init,
  ];
}
