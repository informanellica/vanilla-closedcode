import path from "path";
import z from "zod";
import { Global } from "core/global";
import { Effect, Layer, Context } from "effect";
import { AppFileSystem } from "core/filesystem";
export const Tokens = z.object({
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  expiresAt: z.number().optional(),
  scope: z.string().optional()
});
export const ClientInfo = z.object({
  clientId: z.string(),
  clientSecret: z.string().optional(),
  clientIdIssuedAt: z.number().optional(),
  clientSecretExpiresAt: z.number().optional()
});
export const Entry = z.object({
  tokens: Tokens.optional(),
  clientInfo: ClientInfo.optional(),
  codeVerifier: z.string().optional(),
  oauthState: z.string().optional(),
  serverUrl: z.string().optional()
});
const filepath = path.join(Global.Path.data, "mcp-auth.json");
export class Service extends Context.Service()("@closedcode/McpAuth") {}
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const fs = yield* AppFileSystem.Service;
  const all = Effect.fn("McpAuth.all")(function* () {
    return yield* fs.readJson(filepath).pipe(Effect.map(data => data), Effect.catch(() => Effect.succeed({})));
  });
  const get = Effect.fn("McpAuth.get")(function* (mcpName) {
    const data = yield* all();
    return data[mcpName];
  });
  const getForUrl = Effect.fn("McpAuth.getForUrl")(function* (mcpName, serverUrl) {
    const entry = yield* get(mcpName);
    if (!entry) return undefined;
    if (!entry.serverUrl) return undefined;
    if (entry.serverUrl !== serverUrl) return undefined;
    return entry;
  });
  const set = Effect.fn("McpAuth.set")(function* (mcpName, entry, serverUrl) {
    const data = yield* all();
    if (serverUrl) entry.serverUrl = serverUrl;
    yield* fs.writeJson(filepath, {
      ...data,
      [mcpName]: entry
    }, 0o600).pipe(Effect.orDie);
  });
  const remove = Effect.fn("McpAuth.remove")(function* (mcpName) {
    const data = yield* all();
    delete data[mcpName];
    yield* fs.writeJson(filepath, data, 0o600).pipe(Effect.orDie);
  });
  const updateField = (field, spanName) => Effect.fn(`McpAuth.${spanName}`)(function* (mcpName, value, serverUrl) {
    const entry = (yield* get(mcpName)) ?? {};
    entry[field] = value;
    yield* set(mcpName, entry, serverUrl);
  });
  const clearField = (field, spanName) => Effect.fn(`McpAuth.${spanName}`)(function* (mcpName) {
    const entry = yield* get(mcpName);
    if (entry) {
      delete entry[field];
      yield* set(mcpName, entry);
    }
  });
  const updateTokens = updateField("tokens", "updateTokens");
  const updateClientInfo = updateField("clientInfo", "updateClientInfo");
  const updateCodeVerifier = updateField("codeVerifier", "updateCodeVerifier");
  const updateOAuthState = updateField("oauthState", "updateOAuthState");
  const clearCodeVerifier = clearField("codeVerifier", "clearCodeVerifier");
  const clearOAuthState = clearField("oauthState", "clearOAuthState");
  const getOAuthState = Effect.fn("McpAuth.getOAuthState")(function* (mcpName) {
    const entry = yield* get(mcpName);
    return entry?.oauthState;
  });
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
export const defaultLayer = layer.pipe(Layer.provide(AppFileSystem.defaultLayer));
export * as McpAuth from "./auth.js";