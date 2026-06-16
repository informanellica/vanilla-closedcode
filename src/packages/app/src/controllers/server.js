/** @file Server-connection management controller (MVC): owns add/edit/connect mutations, health/preview checks, default-server helpers and the terminal's server/url/client wiring. */
import { useMutation } from "../lib/query/index.js";
import { useNavigate } from "../lib/router/index.js";
import { createMemo } from "../lib/reactivity.js";
import { useDialog } from "@/lib/dialog.js";
import { showToast } from "@/lib/toast.js";
import { useLanguage } from "@/context/language.js";
import { usePlatform } from "@/context/platform.js";
import { useSDK } from "@/context/sdk.js";
import { normalizeServerUrl, ServerConnection, useServer } from "@/context/server.js";
import { useCheckServerHealth } from "@/utils/server-health.js";

const DEFAULT_USERNAME = "closedcode";

/**
 * Show an error toast for a failed request, using the error message when available.
 * @param {Object} language - The language context (provides `t` for translations).
 * @param {*} err - The thrown error or value.
 */
function showRequestError(language, err) {
  showToast({
    variant: "error",
    title: language.t("common.requestFailed"),
    description: err instanceof Error ? err.message : String(err)
  });
}

// Server-connection management controller.
//
// Orchestrates the server Model (@/context/server.js), the SDK (@/context/sdk.js)
// and server-health checks. Owns add/edit/connect mutations (ServerConnection
// construction + normalizeServerUrl + health verification) and the terminal's
// server/url/client wiring derived from the active ServerConnection.
//
// MUST be invoked inside a component/hook reactive scope (it calls context hooks).
/**
 * Server-connection management controller. Orchestrates the server Model, the SDK
 * and server-health checks. Must be invoked inside a component/hook reactive scope.
 * @returns {Object} State accessors and actions (server/serverKey/list/current, canDefault/getDefault/setDefault, previewStatus/checkHealth, select/replaceServer/removeServer, addMutation/editMutation, terminalConnection, DEFAULT_USERNAME).
 */
export function useServerController() {
  const navigate = useNavigate();
  const dialog = useDialog();
  const server = useServer();
  const platform = usePlatform();
  const language = useLanguage();
  const checkServerHealth = useCheckServerHealth();

  // --- default-server (platform-backed) helpers ----------------------------
  /**
   * Memo: whether the platform supports get/set of a default server.
   * @returns {boolean} True when both platform default-server hooks exist.
   */
  const canDefault = createMemo(() => !!platform.getDefaultServer && !!platform.setDefaultServer);
  /**
   * Read the platform's stored default-server key.
   * @returns {*} The default-server key (or undefined when unsupported/unset).
   */
  const getDefault = () => platform.getDefaultServer?.();
  /**
   * Persist the platform's default-server key, surfacing a toast on failure.
   * @param {*} key - The server key to set as default.
   * @returns {Promise} Resolves once persisted (rethrows on failure).
   */
  const setDefault = async key => {
    try {
      await platform.setDefaultServer?.(key);
    } catch (err) {
      showRequestError(language, err);
      throw err;
    }
  };

  // --- preview / health ------------------------------------------------------
  /**
   * Heuristic: does a typed server value look complete enough to probe? Localhost
   * counts; otherwise the host must contain a dot or a port.
   * @param {string} value - The raw server URL/host value.
   * @returns {boolean} True when the value looks like a probeable server.
   */
  const looksComplete = value => {
    const normalized = normalizeServerUrl(value);
    if (!normalized) return false;
    const host = normalized.replace(/^https?:\/\//, "").split("/")[0];
    if (!host) return false;
    if (host.includes("localhost") || host.startsWith("127.0.0.1")) return true;
    return host.includes(".") || host.includes(":");
  };
  /**
   * Probe a typed server's health for live preview (returns undefined when the
   * value does not yet look complete or cannot be normalized).
   * @param {string} value - The raw server URL/host value.
   * @param {string} username - Optional basic-auth username.
   * @param {string} password - Optional basic-auth password.
   * @returns {Promise} Resolves to the health boolean, or undefined.
   */
  const previewStatus = async (value, username, password) => {
    if (!looksComplete(value)) return undefined;
    const normalized = normalizeServerUrl(value);
    if (!normalized) return undefined;
    const http = { url: normalized };
    if (username) http.username = username;
    if (password) http.password = password;
    const result = await checkServerHealth(http);
    return result.healthy;
  };
  /**
   * Check a server's health.
   * @param {Object} http - The HTTP connection descriptor (url + optional auth).
   * @returns {Promise} Resolves to the health-check result.
   */
  const checkHealth = http => checkServerHealth(http);

  // --- connect orchestration -------------------------------------------------
  // select(conn, persist): connect to a server. When not persisting, refuses
  // connecting to a server already known to be unhealthy (caller passes the
  // pre-checked healthy flag).
  /**
   * Connect to a server connection and navigate home. When `persist` and the
   * connection is HTTP, the server is added to the saved list; otherwise it is
   * set active transiently. When not persisting, refuses an already-known-unhealthy
   * server.
   * @param {Object} conn - The server connection descriptor.
   * @param {boolean} persist - Whether to save the server to the list.
   * @param {boolean} knownHealthy - The caller's pre-checked health flag.
   * @returns {Promise} Resolves once the connect/navigate completes.
   */
  const select = async (conn, persist, knownHealthy) => {
    if (!persist && knownHealthy === false) return;
    dialog.close();
    if (persist && conn.type === "http") {
      server.add(conn);
      navigate("/");
      return;
    }
    navigate("/");
    queueMicrotask(() => server.setActive(ServerConnection.key(conn)));
  };

  /**
   * Replace a saved server with a new connection, preserving the active selection
   * (re-pointing it at the replacement when the original was active), then remove
   * the original.
   * @param {Object} original - The server connection being replaced.
   * @param {Object} next - The replacement server connection.
   */
  const replaceServer = (original, next) => {
    const active = server.key;
    const newConn = server.add(next);
    if (!newConn) return;
    const nextActive = active === ServerConnection.key(original) ? ServerConnection.key(newConn) : active;
    if (nextActive) server.setActive(nextActive);
    server.remove(ServerConnection.key(original));
  };

  /**
   * Remove a saved server by key, clearing it as the platform default if it was set.
   * @param {*} key - The server key to remove.
   * @returns {Promise} Resolves once removal (and default-clearing) completes.
   */
  const removeServer = async key => {
    server.remove(key);
    if ((await platform.getDefaultServer?.()) === key) {
      void platform.setDefaultServer?.(null);
    }
  };

  // --- add / edit mutations --------------------------------------------------
  // mutate input shape: { url, name, username, password } (raw form values).
  /**
   * Mutation that adds a new HTTP server: normalizes the URL, health-checks it,
   * and on success connects+persists. Resolves to `{ ok: true }` or
   * `{ ok: false, error }`. Mutate input shape: `{ url, name, username, password }`.
   */
  const addMutation = useMutation(() => ({
    mutationFn: async input => {
      const normalized = normalizeServerUrl(input.url);
      if (!normalized) return { ok: true };
      const conn = {
        type: "http",
        http: { url: normalized }
      };
      const name = input.name?.trim();
      if (name) conn.displayName = name;
      if (input.password) conn.http.password = input.password;
      if (input.password && input.username) conn.http.username = input.username;
      const result = await checkServerHealth(conn.http);
      if (!result.healthy) {
        return { ok: false, error: language.t("dialog.server.add.error") };
      }
      await select(conn, true);
      return { ok: true };
    }
  }));

  // mutate input shape: { original, value, name, username, password }.
  /**
   * Mutation that edits an existing HTTP server: no-ops when nothing changed,
   * otherwise health-checks and either re-adds (same URL) or replaces it.
   * Resolves to `{ ok: true }` or `{ ok: false, error }`. Mutate input shape:
   * `{ original, value, name, username, password }`.
   */
  const editMutation = useMutation(() => ({
    mutationFn: async input => {
      if (input.original.type !== "http") return { ok: true };
      const normalized = normalizeServerUrl(input.value);
      if (!normalized) return { ok: true };
      const name = input.name?.trim() || undefined;
      const username = input.username || undefined;
      const password = input.password || undefined;
      const existingName = input.original.displayName;
      if (
        normalized === input.original.http.url &&
        name === existingName &&
        username === input.original.http.username &&
        password === input.original.http.password
      ) {
        return { ok: true };
      }
      const conn = {
        type: "http",
        displayName: name,
        http: { url: normalized, username, password }
      };
      const result = await checkServerHealth(conn.http);
      if (!result.healthy) {
        return { ok: false, error: language.t("dialog.server.add.error") };
      }
      if (normalized === input.original.http.url) {
        server.add(conn);
      } else {
        replaceServer(input.original, conn);
      }
      return { ok: true };
    }
  }));

  // --- terminal wiring (derived from active ServerConnection) ----------------
  // A lazy factory (NOT a createMemo): a createMemo runs its computation
  // eagerly at controller construction, which would call useSDK() immediately
  // and throw on routes without an SDKProvider (e.g. the home route's
  // server-selection dialog, which constructs this controller). Exposing a
  // function defers useSDK() to the caller. The only caller is components/
  // terminal.js, which is project-scoped and always mounted under SDKProvider,
  // so useSDK() resolves there. On the home route the function is never called,
  // so useSDK() never runs.
  /**
   * Lazy factory (NOT a memo) deriving the terminal's connection wiring from the
   * active ServerConnection + SDK. Must only be called from within an SDKProvider
   * scope. Falls back to DEFAULT_USERNAME / empty password when no auth is set.
   * @returns {Object} `{ client, url, directory, username, password, sameOrigin }`.
   */
  const terminalConnection = () => {
    const sdk = useSDK();
    const auth = server.current?.http;
    const url = sdk.url;
    const username = auth?.username ?? DEFAULT_USERNAME;
    const password = auth?.password ?? "";
    const sameOrigin = new URL(url, location.href).origin === location.origin;
    return {
      client: sdk.client,
      url,
      directory: sdk.directory,
      username,
      password,
      sameOrigin
    };
  };

  return {
    // model passthrough (state accessors)
    server,
    get serverKey() {
      return server.key;
    },
    list: () => server.list,
    current: () => server.current,
    // default-server
    canDefault,
    getDefault,
    setDefault,
    // health / preview
    previewStatus,
    checkHealth,
    // actions
    select,
    replaceServer,
    removeServer,
    addMutation,
    editMutation,
    // terminal wiring
    terminalConnection,
    DEFAULT_USERNAME
  };
}
