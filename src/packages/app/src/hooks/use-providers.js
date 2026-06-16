/** @file Reactive hook exposing the available, default, popular, connected, and paid AI providers for the current project (or global) scope. */

import { useGlobalSync } from "@/context/global-sync.js";
import { decode64 } from "@/utils/base64.js";
import { useParams } from "../lib/router/index.js";
import { createMemo } from "../lib/reactivity.js";
/**
 * Provider IDs considered "popular" and surfaced first in selection UIs.
 * @type {Array<string>}
 */
export const popularProviders = ["lmstudio", "ollama"];
const popularProviderSet = new Set(popularProviders);
/**
 * Reactive hook that derives provider lists from the current routed project's
 * store (when ready) or falls back to the global provider state.
 *
 * Must be invoked inside a component / hook reactive setup scope (it calls
 * context hooks and reactive primitives).
 *
 * @returns {Object} Accessor functions: `all` (all providers), `default` (the default provider), `popular` (providers in the popular set), `connected` (providers the user has connected), and `paid` (connected providers that expose paid models).
 */
export function useProviders() {
  const globalSync = useGlobalSync();
  const params = useParams();
  const dir = createMemo(() => decode64(params.dir) ?? "");
  const providers = () => {
    if (dir()) {
      const [projectStore] = globalSync.child(dir());
      if (projectStore.provider_ready) return projectStore.provider;
    }
    return globalSync.data.provider;
  };
  return {
    all: () => providers().all,
    default: () => providers().default,
    popular: () => providers().all.filter(p => popularProviderSet.has(p.id)),
    connected: () => {
      const connected = new Set(providers().connected);
      return providers().all.filter(p => connected.has(p.id));
    },
    paid: () => {
      const connected = new Set(providers().connected);
      return providers().all.filter(p => connected.has(p.id) && (p.id !== "opencode" || Object.values(p.models).some(m => m.cost?.input)));
    }
  };
}