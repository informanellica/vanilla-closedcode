/**
 * @file MCP auth store: persists OAuth tokens, client registration info, PKCE
 * code verifiers and CSRF state per MCP server name in a 0600 JSON file.
 */
import path from "path";
import z from "zod";
import { Global } from "core/global";
import { Effect, Layer, Context } from "effect";
import { AppFileSystem } from "core/filesystem";
/** Zod schema for stored OAuth tokens. */
export const Tokens = z.object({
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  expiresAt: z.number().optional(),
  scope: z.string().optional()
});
/** Zod schema for OAuth client registration info (from dynamic or pre-registered clients). */
export const ClientInfo = z.object({
  clientId: z.string(),
  clientSecret: z.string().optional(),
  clientIdIssuedAt: z.number().optional(),
  clientSecretExpiresAt: z.number().optional()
});
/** Zod schema for a per-MCP-server auth entry (tokens, client info, PKCE verifier, state, server URL). */
export const Entry = z.object({
  tokens: Tokens.optional(),
  clientInfo: ClientInfo.optional(),
  codeVerifier: z.string().optional(),
  oauthState: z.string().optional(),
  serverUrl: z.string().optional()
});
/** Path to the on-disk MCP auth store. */
const filepath = path.join(Global.Path.data, "mcp-auth.json");
/** Effect service tag for the MCP auth store. */
export class Service extends Context.Service()("@closedcode/McpAuth") {}
/** Effect Layer providing the MCP auth store backed by a 0600 JSON file. */
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const fs = yield* AppFileSystem.Service;
  /**
   * Read the entire auth store, returning an empty object if the file is missing/unreadable.
   * @returns {Object} Map of MCP server name to its auth entry.
   */
  const all = Effect.fn("McpAuth.all")(function* () {
    return yield* fs.readJson(filepath).pipe(Effect.map(data => data), Effect.catch(() => Effect.succeed({})));
  });
  /**
   * Get the auth entry for a server name.
   * @param {string} mcpName - MCP server name.
   * @returns {Object} The stored entry, or undefined.
   */
  const get = Effect.fn("McpAuth.get")(function* (mcpName) {
    const data = yield* all();
    return data[mcpName];
  });
  /**
   * Get the auth entry only if it is bound to the given server URL (guards reused credentials).
   * @param {string} mcpName - MCP server name.
   * @param {string} serverUrl - URL the stored credentials must match.
   * @returns {Object} The entry if its serverUrl matches, otherwise undefined.
   */
  const getForUrl = Effect.fn("McpAuth.getForUrl")(function* (mcpName, serverUrl) {
    const entry = yield* get(mcpName);
    if (!entry) return undefined;
    if (!entry.serverUrl) return undefined;
    if (entry.serverUrl !== serverUrl) return undefined;
    return entry;
  });
  /**
   * Persist an auth entry for a server name, optionally tagging it with the server URL.
   * @param {string} mcpName - MCP server name.
   * @param {Object} entry - Auth entry to store.
   * @param {string} serverUrl - Optional server URL to associate with the entry.
   * @returns {void}
   */
  const set = Effect.fn("McpAuth.set")(function* (mcpName, entry, serverUrl) {
    const data = yield* all();
    if (serverUrl) entry.serverUrl = serverUrl;
    yield* fs.writeJson(filepath, {
      ...data,
      [mcpName]: entry
    }, 0o600).pipe(Effect.orDie);
  });
  /**
   * Delete the stored auth entry for a server name.
   * @param {string} mcpName - MCP server name.
   * @returns {void}
   */
  const remove = Effect.fn("McpAuth.remove")(function* (mcpName) {
    const data = yield* all();
    delete data[mcpName];
    yield* fs.writeJson(filepath, data, 0o600).pipe(Effect.orDie);
  });
  /**
   * Build an updater that sets a single field on an entry, creating the entry if needed.
   * @param {string} field - Entry field name to set.
   * @param {string} spanName - Trace span name suffix for the generated function.
   * @returns {Function} An effectful (mcpName, value, serverUrl) updater.
   */
  const updateField = (field, spanName) => Effect.fn(`McpAuth.${spanName}`)(function* (mcpName, value, serverUrl) {
    const entry = (yield* get(mcpName)) ?? {};
    entry[field] = value;
    yield* set(mcpName, entry, serverUrl);
  });
  /**
   * Build a clearer that deletes a single field from an existing entry.
   * @param {string} field - Entry field name to delete.
   * @param {string} spanName - Trace span name suffix for the generated function.
   * @returns {Function} An effectful (mcpName) clearer.
   */
  const clearField = (field, spanName) => Effect.fn(`McpAuth.${spanName}`)(function* (mcpName) {
    const entry = yield* get(mcpName);
    if (entry) {
      delete entry[field];
      yield* set(mcpName, entry);
    }
  });
  /** Store OAuth tokens for a server (effectful (mcpName, tokens, serverUrl)). */
  const updateTokens = updateField("tokens", "updateTokens");
  /** Store OAuth client registration info for a server (effectful (mcpName, clientInfo, serverUrl)). */
  const updateClientInfo = updateField("clientInfo", "updateClientInfo");
  /** Store the PKCE code verifier for a server (effectful (mcpName, codeVerifier, serverUrl)). */
  const updateCodeVerifier = updateField("codeVerifier", "updateCodeVerifier");
  /** Store the OAuth CSRF state for a server (effectful (mcpName, oauthState, serverUrl)). */
  const updateOAuthState = updateField("oauthState", "updateOAuthState");
  /** Remove the stored PKCE code verifier for a server (effectful (mcpName)). */
  const clearCodeVerifier = clearField("codeVerifier", "clearCodeVerifier");
  /** Remove the stored OAuth CSRF state for a server (effectful (mcpName)). */
  const clearOAuthState = clearField("oauthState", "clearOAuthState");
  /**
   * Read the stored OAuth CSRF state for a server.
   * @param {string} mcpName - MCP server name.
   * @returns {string} The stored oauthState, or undefined.
   */
  const getOAuthState = Effect.fn("McpAuth.getOAuthState")(function* (mcpName) {
    const entry = yield* get(mcpName);
    return entry?.oauthState;
  });
  /**
   * Determine whether stored tokens for a server are expired.
   * @param {string} mcpName - MCP server name.
   * @returns {boolean} True if expired, false if valid/no expiry, or null if no tokens are stored.
   */
  const isTokenExpired = Effect.fn("McpAuth.isTokenExpired")(function* (mcpName) {
    const entry = yield* get(mcpName);
    if (!entry?.tokens) return null;
    if (!entry.tokens.expiresAt) return false;
    return entry.tokens.expiresAt < Date.now() / 1000;
  });
  return Service.of({
    all,
    get,
    getForUrl,
    set,
    remove,
    updateTokens,
    updateClientInfo,
    updateCodeVerifier,
    clearCodeVerifier,
    updateOAuthState,
    getOAuthState,
    clearOAuthState,
    isTokenExpired
  });
}));
/** MCP auth store layer wired up with the default AppFileSystem layer. */
export const defaultLayer = layer.pipe(Layer.provide(AppFileSystem.defaultLayer));
export * as McpAuth from "./auth.js";