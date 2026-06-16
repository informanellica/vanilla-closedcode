/** @file Providers controller (MVC): owns provider auth/credential management (OAuth + API key + custom providers) and the SDK orchestration (dispose/refresh) behind the provider Views. */
import { useGlobalSDK } from "@/context/global-sdk.js";
import { useGlobalSync } from "@/context/global-sync.js";
import { fetchLocalModels } from "@/components/fetch-local-models.js";
import { useQueryClient } from "../lib/query/index.js";

/**
 * Providers controller (MVC).
 *
 * Owns provider auth / credential management and the SDK orchestration that
 * was previously inlined across the provider Views (dialog-connect-provider,
 * dialog-custom-provider, settings-providers). The controller depends only on
 * the Model (@/context/*) and the SDK. It must NOT import View components,
 * @/bs/*, or @/vendor/ui — it renders nothing and touches no DOM/markup.
 *
 * Centralizes `global.dispose()` after any credential change so the Views stop
 * calling globalSDK directly.
 *
 * Must be called within a component / hook reactive setup scope (it invokes
 * context hooks), never at module top-level.
 */
export function useProvidersController() {
  const globalSDK = useGlobalSDK();
  const globalSync = useGlobalSync();
  const queryClient = useQueryClient();
  // The connected-provider list comes from a cached `[dir, "providers"]` query.
  // After a config change + dispose, re-fetch it so newly added/removed
  // providers show up immediately (without a full reload).
  /**
   * Invalidate every cached `[dir, "providers"]` query so the connected-provider
   * list re-fetches after a config change.
   * @returns {Promise} Resolves once the matching queries are invalidated.
   */
  const refreshProviders = () => queryClient.invalidateQueries({
    predicate: q => Array.isArray(q.queryKey) && q.queryKey[1] === "providers",
  });

  /**
   * Look up a provider record by id, falling back to the global sync list.
   * @param {string} id - The provider id.
   * @param {Array} fromHook - An optional provider list to check first.
   * @returns {Object} The provider record, or undefined.
   */
  const findProvider = (id, fromHook) => {
    const fromList = fromHook?.find(x => x.id === id);
    if (fromList) return fromList;
    return globalSync.data.provider.all.find(x => x.id === id);
  };

  /**
   * Cached auth methods for a provider (read-through cache in global sync).
   * @param {string} providerID - The provider id.
   * @returns {Object} The cached auth methods, or undefined.
   */
  const cachedAuth = providerID => globalSync.data.provider_auth[providerID];

  /**
   * Fetch the available auth methods for a provider. Uses the global-sync
   * `provider_auth` cache; on a network fetch it primes the cache. `isAlive`
   * lets the caller bail (and use `fallback`) if its scope was disposed.
   * @param {string} providerID - The provider id.
   * @param {Object} options - Has `fallback` (function for the bail/missing value) and `isAlive` (function returning whether the scope is still live).
   * @returns {Promise} Resolves to the provider's auth methods (or the fallback).
   */
  const fetchAuthMethods = async (providerID, { fallback, isAlive } = {}) => {
    const cached = cachedAuth(providerID);
    if (cached) return cached;
    const res = await globalSDK.client.provider.auth();
    if (isAlive && !isAlive()) return fallback ? fallback() : undefined;
    globalSync.set("provider_auth", res.data ?? {});
    return res.data?.[providerID] ?? (fallback ? fallback() : undefined);
  };

  /**
   * Centralized: refresh server state after any credential change (disposes the
   * global instance so it rebuilds).
   * @returns {Promise} Resolves once the dispose request completes.
   */
  const disposeGlobal = () => globalSDK.client.global.dispose();

  /**
   * Begin OAuth: request an authorization for the chosen method.
   * @param {string} providerID - The provider id.
   * @param {string} method - The chosen auth method id.
   * @param {Object} inputs - Method-specific authorization inputs.
   * @returns {Promise} Resolves to the authorization data.
   */
  const authorizeOAuth = (providerID, method, inputs) =>
    globalSDK.client.provider.oauth
      .authorize({ providerID, method, inputs }, { throwOnError: true })
      .then(x => x.data);

  /**
   * Complete an OAuth flow with the provider callback. Returns a discriminated
   * result so the View can render success/error without SDK knowledge. On
   * success the global server state is refreshed.
   * @param {string} providerID - The provider id.
   * @param {string} method - The auth method id.
   * @param {string} code - The OAuth callback code.
   * @returns {Promise<Object>} Resolves to `{ ok: true }` or `{ ok: false, error }`.
   */
  const completeOAuth = async (providerID, method, code) => {
    const result = await globalSDK.client.provider.oauth
      .callback({ providerID, method, code })
      .then(value => (value.error ? { ok: false, error: value.error } : { ok: true }))
      .catch(error => ({ ok: false, error }));
    if (result.ok) await disposeGlobal();
    return result;
  };

  /**
   * Connect via an API key: persist the credential then refresh server state.
   * @param {string} providerID - The provider id.
   * @param {string} apiKey - The API key to store.
   * @returns {Promise} Resolves once the credential is saved and state refreshed.
   */
  const connect = async (providerID, apiKey) => {
    await globalSDK.client.auth.set({
      providerID,
      auth: { type: "api", key: apiKey },
    });
    await disposeGlobal();
  };

  /**
   * Discover models exposed by a custom/local provider endpoint.
   * @param {Object} config - Has `baseURL`, `headers`, and `apiKey`.
   * @returns {Promise} Resolves to the discovered local models.
   */
  const discover = ({ baseURL, headers, apiKey }) =>
    fetchLocalModels({ baseURL, headers, apiKey });

  /**
   * Save a custom provider: optionally persist its API key, then merge its
   * config (re-enabling it if previously disabled). Returns the input result so
   * the caller can drive success UI.
   * @param {Object} result - Has `providerID`, `config`, and an optional `key`.
   * @returns {Promise<Object>} Resolves to the passed-in `result`.
   */
  const saveCustom = async result => {
    const disabledProviders = globalSync.data.config.disabled_providers ?? [];
    const nextDisabled = disabledProviders.filter(id => id !== result.providerID);
    if (result.key) {
      await globalSDK.client.auth.set({
        providerID: result.providerID,
        auth: { type: "api", key: result.key },
      });
    }
    await globalSync.updateConfig({
      provider: { [result.providerID]: result.config },
      disabled_providers: nextDisabled,
    });
    // Refresh server state so the newly added/edited provider registers, then
    // re-fetch the (cached) provider list so it shows up immediately.
    await disposeGlobal();
    await refreshProviders();
    return result;
  };

  /**
   * Add a provider id to the disabled list (optimistic, with rollback on failure).
   * @param {string} providerID - The provider id to disable.
   * @returns {Promise} Resolves once the config update persists (rolls back and rethrows on error).
   */
  const disableProvider = async providerID => {
    const before = globalSync.data.config.disabled_providers ?? [];
    const next = before.includes(providerID) ? before : [...before, providerID];
    globalSync.set("config", "disabled_providers", next);
    try {
      await globalSync.updateConfig({ disabled_providers: next });
    } catch (err) {
      globalSync.set("config", "disabled_providers", before);
      throw err;
    }
  };

  /**
   * Is this provider id a config-defined custom (openai-compatible) provider?
   * @param {string} providerID - The provider id.
   * @returns {boolean} True when the provider is a config-custom openai-compatible provider.
   */
  const isConfigCustom = providerID => {
    const provider = globalSync.data.config.provider?.[providerID];
    if (!provider) return false;
    if (provider.npm !== "@ai-sdk/openai-compatible") return false;
    // A user-added openai-compatible provider is config-custom regardless of how
    // many models it has. A freshly added local provider (e.g. Ollama) may have
    // zero models until they are pulled, but it must still be treated as custom
    // so its edit (pencil) button shows and removeProvider takes the config
    // branch (disable + drop from config) — otherwise its trash button no-ops.
    return true;
  };

  /**
   * Remove / disconnect a provider's credential. Config-custom providers are
   * also disabled in config; everything else refreshes server state via
   * dispose. Returns { configCustom } so the View can branch its toast.
   * @param {string} providerID - The provider id to remove.
   * @returns {Promise<Object>} Resolves to `{ configCustom }` indicating which branch ran.
   */
  const removeProvider = async providerID => {
    if (isConfigCustom(providerID)) {
      await globalSDK.client.auth.remove({ providerID }).catch(() => undefined);
      await disableProvider(providerID);
      // updateConfig (in disableProvider) only persists config + refetches the
      // bootstrap; it does NOT rebuild the backend provider state, so the cached
      // list still includes the now-disabled provider. Dispose to force a rebuild
      // (same as the add path), otherwise the trash/disconnect action no-ops.
      await disposeGlobal();
      await refreshProviders();
      return { configCustom: true };
    }
    await globalSDK.client.auth.remove({ providerID });
    await disposeGlobal();
    await refreshProviders();
    return { configCustom: false };
  };

  return {
    // derived state accessors
    findProvider,
    cachedAuth,
    isConfigCustom,
    getCustom: providerID => globalSync.data.config.provider?.[providerID],
    // actions
    fetchAuthMethods,
    authorizeOAuth,
    completeOAuth,
    connect,
    discover,
    saveCustom,
    disableProvider,
    removeProvider,
  };
}
