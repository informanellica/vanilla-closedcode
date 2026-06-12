import { useGlobalSDK } from "@/context/global-sdk.js";
import { useGlobalSync } from "@/context/global-sync.js";
import { fetchLocalModels } from "@/components/fetch-local-models.js";
import { useQueryClient } from "@/lib/query/index.js";

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
  const refreshProviders = () => queryClient.invalidateQueries({
    predicate: q => Array.isArray(q.queryKey) && q.queryKey[1] === "providers",
  });

  /** Look up a provider record by id, falling back to the global sync list. */
  const findProvider = (id, fromHook) => {
    const fromList = fromHook?.find(x => x.id === id);
    if (fromList) return fromList;
    return globalSync.data.provider.all.find(x => x.id === id);
  };

  /** Cached auth methods for a provider (read-through cache in global sync). */
  const cachedAuth = providerID => globalSync.data.provider_auth[providerID];

  /**
   * Fetch the available auth methods for a provider. Uses the global-sync
   * `provider_auth` cache; on a network fetch it primes the cache. `isAlive`
   * lets the caller bail (and use `fallback`) if its scope was disposed.
   */
  const fetchAuthMethods = async (providerID, { fallback, isAlive } = {}) => {
    const cached = cachedAuth(providerID);
    if (cached) return cached;
    const res = await globalSDK.client.provider.auth();
    if (isAlive && !isAlive()) return fallback ? fallback() : undefined;
    globalSync.set("provider_auth", res.data ?? {});
    return res.data?.[providerID] ?? (fallback ? fallback() : undefined);
  };

  /** Centralized: refresh server state after any credential change. */
  const disposeGlobal = () => globalSDK.client.global.dispose();

  /** Begin OAuth: request an authorization for the chosen method. */
  const authorizeOAuth = (providerID, method, inputs) =>
    globalSDK.client.provider.oauth
      .authorize({ providerID, method, inputs }, { throwOnError: true })
      .then(x => x.data);

  /**
   * Complete an OAuth flow with the provider callback. Returns a discriminated
   * result so the View can render success/error without SDK knowledge. On
   * success the global server state is refreshed.
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
   */
  const connect = async (providerID, apiKey) => {
    await globalSDK.client.auth.set({
      providerID,
      auth: { type: "api", key: apiKey },
    });
    await disposeGlobal();
  };

  /** Discover models exposed by a custom/local provider endpoint. */
  const discover = ({ baseURL, headers, apiKey }) =>
    fetchLocalModels({ baseURL, headers, apiKey });

  /**
   * Save a custom provider: optionally persist its API key, then merge its
   * config (re-enabling it if previously disabled). Returns the input result so
   * the caller can drive success UI.
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

  /** Add a provider id to the disabled list (optimistic, with rollback). */
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

  /** Is this provider id a config-defined custom (openai-compatible) provider? */
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
