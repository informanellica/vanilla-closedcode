import { MCP } from "#mcp/index.js";
import { Effect, Schema } from "effect";
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi";
import { InstanceHttpApi } from "../api.js";
import { StatusMap, UnsupportedOAuthError } from "../groups/mcp.js";
export const mcpHandlers = HttpApiBuilder.group(InstanceHttpApi, "mcp", handlers => Effect.gen(function* () {
  const mcp = yield* MCP.Service;
  const status = Effect.fn("McpHttpApi.status")(function* () {
    return yield* mcp.status();
  });
  const add = Effect.fn("McpHttpApi.add")(function* (ctx) {
    const result = (yield* mcp.add(ctx.payload.name, ctx.payload.config)).status;
    return yield* Schema.decodeUnknownEffect(StatusMap)("status" in result ? {
      [ctx.payload.name]: result
    } : result).pipe(Effect.mapError(() => new HttpApiError.BadRequest({})));
  });
  const authStart = Effect.fn("McpHttpApi.authStart")(function* (ctx) {
    if (!(yield* mcp.supportsOAuth(ctx.params.name))) {
      return yield* new UnsupportedOAuthError({
        error: `MCP server ${ctx.params.name} does not support OAuth`
      });
    }
    return yield* mcp.startAuth(ctx.params.name);
  });
  const authCallback = Effect.fn("McpHttpApi.authCallback")(function* (ctx) {
    return yield* mcp.finishAuth(ctx.params.name, ctx.payload.code);
  });
  const authAuthenticate = Effect.fn("McpHttpApi.authAuthenticate")(function* (ctx) {
    if (!(yield* mcp.supportsOAuth(ctx.params.name))) {
      return yield* new UnsupportedOAuthError({
        error: `MCP server ${ctx.params.name} does not support OAuth`
      });
    }
    return yield* mcp.authenticate(ctx.params.name);
  });
  const authRemove = Effect.fn("McpHttpApi.authRemove")(function* (ctx) {
    yield* mcp.removeAuth(ctx.params.name);
    return {
      success: true
    };
  });
  const connect = Effect.fn("McpHttpApi.connect")(function* (ctx) {
    yield* mcp.connect(ctx.params.name);
    return true;
  });
  const disconnect = Effect.fn("McpHttpApi.disconnect")(function* (ctx) {
    yield* mcp.disconnect(ctx.params.name);
    return true;
  });
  return handlers.handle("status", status).handle("add", add).handle("authStart", authStart).handle("authCallback", authCallback).handle("authAuthenticate", authAuthenticate).handle("authRemove", authRemove).handle("connect", connect).handle("disconnect", disconnect);
}));