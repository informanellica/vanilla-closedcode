/** @file HTTP API handlers for the "mcp" group: MCP server status, adding servers, OAuth auth flow (start/callback/authenticate/remove), and connect/disconnect. */
import { MCP } from "#mcp/index.js";
import { Effect, Schema } from "effect";
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi";
import { InstanceHttpApi } from "../api.js";
import { StatusMap, UnsupportedOAuthError } from "../groups/mcp.js";
/**
 * Registers the handlers for the "mcp" HTTP API group on the instance API.
 * @type {Object}
 */
export const mcpHandlers = HttpApiBuilder.group(InstanceHttpApi, "mcp", handlers => Effect.gen(function* () {
  const mcp = yield* MCP.Service;
  /**
   * Returns the connection status of all configured MCP servers.
   * @returns {Effect} Effect yielding the MCP status map.
   */
  const status = Effect.fn("McpHttpApi.status")(function* () {
    return yield* mcp.status();
  });
  /**
   * Adds a new MCP server by name and config, returning its decoded status (failing with BadRequest if the result is malformed).
   * @param {Object} ctx - Handler context; `payload` carries `name` and `config` for the server to add.
   * @returns {Effect} Effect yielding the decoded status map for the added server.
   */
  const add = Effect.fn("McpHttpApi.add")(function* (ctx) {
    const result = (yield* mcp.add(ctx.payload.name, ctx.payload.config)).status;
    return yield* Schema.decodeUnknownEffect(StatusMap)("status" in result ? {
      [ctx.payload.name]: result
    } : result).pipe(Effect.mapError(() => new HttpApiError.BadRequest({})));
  });
  /**
   * Begins the OAuth authorization flow for the named MCP server, failing if it does not support OAuth.
   * @param {Object} ctx - Handler context; `params.name` is the MCP server name.
   * @returns {Effect} Effect yielding the auth-start result, or failing with UnsupportedOAuthError.
   */
  const authStart = Effect.fn("McpHttpApi.authStart")(function* (ctx) {
    if (!(yield* mcp.supportsOAuth(ctx.params.name))) {
      return yield* new UnsupportedOAuthError({
        error: `MCP server ${ctx.params.name} does not support OAuth`
      });
    }
    return yield* mcp.startAuth(ctx.params.name);
  });
  /**
   * Completes the OAuth flow for the named MCP server using the returned authorization code.
   * @param {Object} ctx - Handler context; `params.name` is the server name and `payload.code` is the OAuth code.
   * @returns {Effect} Effect yielding the auth-finish result.
   */
  const authCallback = Effect.fn("McpHttpApi.authCallback")(function* (ctx) {
    return yield* mcp.finishAuth(ctx.params.name, ctx.payload.code);
  });
  /**
   * Authenticates against the named MCP server, failing if it does not support OAuth.
   * @param {Object} ctx - Handler context; `params.name` is the MCP server name.
   * @returns {Effect} Effect yielding the authenticate result, or failing with UnsupportedOAuthError.
   */
  const authAuthenticate = Effect.fn("McpHttpApi.authAuthenticate")(function* (ctx) {
    if (!(yield* mcp.supportsOAuth(ctx.params.name))) {
      return yield* new UnsupportedOAuthError({
        error: `MCP server ${ctx.params.name} does not support OAuth`
      });
    }
    return yield* mcp.authenticate(ctx.params.name);
  });
  /**
   * Removes the stored auth credentials for the named MCP server.
   * @param {Object} ctx - Handler context; `params.name` is the MCP server name.
   * @returns {Effect} Effect yielding `{success: true}`.
   */
  const authRemove = Effect.fn("McpHttpApi.authRemove")(function* (ctx) {
    yield* mcp.removeAuth(ctx.params.name);
    return {
      success: true
    };
  });
  /**
   * Connects to the named MCP server.
   * @param {Object} ctx - Handler context; `params.name` is the MCP server name.
   * @returns {Effect} Effect yielding `true` on success.
   */
  const connect = Effect.fn("McpHttpApi.connect")(function* (ctx) {
    yield* mcp.connect(ctx.params.name);
    return true;
  });
  /**
   * Disconnects from the named MCP server.
   * @param {Object} ctx - Handler context; `params.name` is the MCP server name.
   * @returns {Effect} Effect yielding `true` on success.
   */
  const disconnect = Effect.fn("McpHttpApi.disconnect")(function* (ctx) {
    yield* mcp.disconnect(ctx.params.name);
    return true;
  });
  return handlers.handle("status", status).handle("add", add).handle("authStart", authStart).handle("authCallback", authCallback).handle("authAuthenticate", authAuthenticate).handle("authRemove", authRemove).handle("connect", connect).handle("disconnect", disconnect);
}));