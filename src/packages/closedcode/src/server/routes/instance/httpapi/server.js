/** @file Assembles the instance HTTP API server: composes auth/workspace/instance middleware, all route handlers, UI/CORS, and exposes web request handlers. */
import { Context, Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { FetchHttpClient, HttpClient, HttpMiddleware, HttpRouter, HttpServer } from "effect/unstable/http";
import * as Socket from "effect/unstable/socket/Socket";
import { AppFileSystem } from "core/filesystem";
import { Account } from "#account/account.js";
import { Agent } from "#agent/agent.js";
import { Auth } from "#auth/index.js";
import { Bus } from "#bus/index.js";
import { Config } from "#config/config.js";
import { Command } from "#command/index.js";
import * as Observability from "core/effect/observability";
import { File } from "#file/index.js";
import { FileWatcher } from "#file/watcher.js";
import { Ripgrep } from "#file/ripgrep.js";
import { Format } from "#format/index.js";
import { LSP } from "#lsp/lsp.js";
import { MCP } from "#mcp/index.js";
import { Permission } from "#permission/index.js";
import { Installation } from "#installation/index.js";
import { InstanceLayer } from "#project/instance-layer.js";
import { Plugin } from "#plugin/index.js";
import { Project } from "#project/project.js";
import { ProviderAuth } from "#provider/auth.js";
import { ModelsDev } from "#provider/models.js";
import { Provider } from "#provider/provider.js";
import { Pty } from "#pty/index.js";
import { Question } from "#question/index.js";
import { Session } from "#session/session.js";
import { SessionCompaction } from "#session/compaction.js";
import { SessionPrompt } from "#session/prompt.js";
import { SessionRevert } from "#session/revert.js";
import { SessionRunState } from "#session/run-state.js";
import { SessionStatus } from "#session/status.js";
import { SessionSummary } from "#session/summary.js";
import { Todo } from "#session/todo.js";
import { SessionShare } from "#share/session.js";
import { ShareNext } from "#share/share-next.js";
import { Skill } from "#skill/index.js";
import { Snapshot } from "#snapshot/index.js";
import { SyncEvent } from "#sync/index.js";
import { ToolRegistry } from "#tool/registry.js";
import { lazy } from "#util/lazy.js";
import { Vcs } from "#project/vcs.js";
import { Worktree } from "#worktree/index.js";
import { Workspace } from "#control-plane/workspace.js";
import { isAllowedCorsOrigin } from "#server/cors.js";
import { serveUIEffect } from "#server/routes/ui.js";
import { InstanceHttpApi, RootHttpApi } from "./api.js";
import { ServerAuthConfig, authorizationLayer, authorizationRouterMiddleware } from "./middleware/authorization.js";
import { EventApi, eventHandlers } from "./event.js";
import { configHandlers } from "./handlers/config.js";
import { controlHandlers } from "./handlers/control.js";
import { experimentalHandlers } from "./handlers/experimental.js";
import { fileHandlers } from "./handlers/file.js";
import { globalHandlers } from "./handlers/global.js";
import { instanceHandlers } from "./handlers/instance.js";
import { mcpHandlers } from "./handlers/mcp.js";
import { permissionHandlers } from "./handlers/permission.js";
import { projectHandlers } from "./handlers/project.js";
import { providerHandlers } from "./handlers/provider.js";
import { ptyConnectRoute, ptyHandlers } from "./handlers/pty.js";
import { questionHandlers } from "./handlers/question.js";
import { sessionHandlers } from "./handlers/session.js";
import { syncHandlers } from "./handlers/sync.js";
import { tuiHandlers } from "./handlers/tui.js";
import { v2Handlers } from "./handlers/v2.js";
import { workspaceHandlers } from "./handlers/workspace.js";
import { instanceContextLayer, instanceRouterMiddleware } from "./middleware/instance-context.js";
import { workspaceRouterMiddleware, workspaceRoutingLayer } from "./middleware/workspace-routing.js";
import { disposeMiddleware } from "./lifecycle.js";
import { memoMap } from "core/effect/memo-map";
import * as ServerBackend from "#server/backend.js";
/** Shared, empty Effect context used as the base context for the server's request runtime. */
export const context = Context.makeUnsafe(new Map());
/** Router middleware that selects the server backend and annotates the current span with backend attributes before running each handler. */
const runtime = HttpRouter.middleware()(Effect.succeed(effect => Effect.gen(function* () {
  const selected = ServerBackend.select();
  yield* Effect.annotateCurrentSpan(ServerBackend.attributes(ServerBackend.force(selected, "effect-httpapi")));
  return yield* effect;
}))).layer;
/**
 * Build a global CORS router middleware that allows origins per the configured CORS options.
 * @param {*} corsOptions - The server CORS configuration consulted by the allowed-origin check.
 * @returns {*} A global router middleware layer applying CORS with a one-day max-age.
 */
const cors = corsOptions => HttpRouter.middleware(HttpMiddleware.cors({
  allowedOrigins: origin => isAllowedCorsOrigin(origin, corsOptions),
  maxAge: 86_400
}), {
  global: true
});
/** Layer building the root (non-instance) API routes from control-plane and global handlers. */
const rootApiRoutes = HttpApiBuilder.layer(RootHttpApi).pipe(Layer.provide([controlHandlers, globalHandlers]));
/** Combined router middleware (authorization + instance context + workspace routing) for raw instance routes. */
const instanceRouterLayer = authorizationRouterMiddleware.combine(instanceRouterMiddleware).combine(workspaceRouterMiddleware).layer.pipe(Layer.provide(Socket.layerWebSocketConstructorGlobal), Layer.provide(ServerAuthConfig.defaultLayer));
/** Layer building the event (SSE) API routes, served behind the instance router middleware. */
const eventApiRoutes = HttpApiBuilder.layer(EventApi).pipe(Layer.provide(eventHandlers), Layer.provide(instanceRouterLayer));
/** Layer building the full instance HttpApi from every instance-scoped handler group. */
const instanceApiRoutes = HttpApiBuilder.layer(InstanceHttpApi).pipe(Layer.provide([configHandlers, experimentalHandlers, fileHandlers, instanceHandlers, mcpHandlers, projectHandlers, ptyHandlers, questionHandlers, permissionHandlers, providerHandlers, sessionHandlers, syncHandlers, v2Handlers, tuiHandlers, workspaceHandlers]));
/** Layer for raw (non-HttpApi) instance routes such as the PTY connect upgrade, behind the instance router middleware. */
const rawInstanceRoutes = Layer.mergeAll(ptyConnectRoute).pipe(Layer.provide(instanceRouterLayer));
/** Combined instance routes (raw + HttpApi) with authorization, workspace routing, and instance-context middleware provided. */
const instanceRoutes = Layer.mergeAll(rawInstanceRoutes, instanceApiRoutes).pipe(Layer.provide([authorizationLayer.pipe(Layer.provide(ServerAuthConfig.defaultLayer)), workspaceRoutingLayer.pipe(Layer.provide(Socket.layerWebSocketConstructorGlobal)), instanceContextLayer]));
/** Catch-all UI route layer that serves the web UI (and proxies dev assets) behind authorization middleware. */
const uiRoute = HttpRouter.use(router => Effect.gen(function* () {
  const fs = yield* AppFileSystem.Service;
  const client = yield* HttpClient.HttpClient;
  yield* router.add("*", "/*", request => serveUIEffect(request, {
    fs,
    client
  }));
})).pipe(Layer.provide(authorizationRouterMiddleware.layer.pipe(Layer.provide(ServerAuthConfig.defaultLayer))));
/**
 * Build the complete route layer for the server, merging root, event, instance, and UI routes
 * and providing all required service layers (CORS, runtime, and every feature service layer).
 * @param {*} corsOptions - The server CORS configuration applied to the global CORS middleware.
 * @returns {*} A fully-wired Effect `Layer` for the HTTP router.
 */
export function createRoutes(corsOptions) {
  return Layer.mergeAll(rootApiRoutes, eventApiRoutes, instanceRoutes, uiRoute).pipe(Layer.provide([cors(corsOptions), runtime, Account.defaultLayer, Agent.defaultLayer, Auth.defaultLayer, Command.defaultLayer, Config.defaultLayer, File.defaultLayer, FileWatcher.defaultLayer, Format.defaultLayer, LSP.defaultLayer, Installation.defaultLayer, MCP.defaultLayer, ModelsDev.defaultLayer, Permission.defaultLayer, Plugin.defaultLayer, Project.defaultLayer, ProviderAuth.defaultLayer, Provider.defaultLayer, Pty.defaultLayer, Question.defaultLayer, Ripgrep.defaultLayer, Session.defaultLayer, SessionCompaction.defaultLayer, SessionPrompt.defaultLayer, SessionRevert.defaultLayer, SessionShare.defaultLayer, SessionRunState.defaultLayer, SessionStatus.defaultLayer, SessionSummary.defaultLayer, ShareNext.defaultLayer, Snapshot.defaultLayer, SyncEvent.defaultLayer, Skill.defaultLayer, Todo.defaultLayer, ToolRegistry.defaultLayer, Vcs.defaultLayer, Workspace.defaultLayer, Worktree.appLayer, Bus.layer, AppFileSystem.defaultLayer, FetchHttpClient.layer, HttpServer.layerServices]), Layer.provideMerge(InstanceLayer.layer), Layer.provideMerge(Observability.layer));
}
/** The default route layer built with no custom CORS options. */
export const routes = createRoutes();
/** Lazily-constructed default web handler over `routes`, with deferred instance disposal as outer middleware. */
const defaultWebHandler = lazy(() => HttpRouter.toWebHandler(routes, {
  memoMap,
  middleware: disposeMiddleware
}));
/**
 * Get a web (Fetch-style) request handler for the server.
 * Returns the memoized default handler when no CORS options are supplied; otherwise builds a fresh handler
 * with the given CORS options (using a non-shared memo map so the default route memoization is not reused).
 * @param {*} corsOptions - Optional server CORS configuration; when its `cors` list is empty/absent the default handler is used.
 * @returns {Function} A web request handler function.
 */
export function webHandler(corsOptions) {
  if (!corsOptions?.cors?.length) return defaultWebHandler();
  return HttpRouter.toWebHandler(createRoutes(corsOptions), {
    // Server-level CORS options are dynamic; don't reuse the default route layer memoized without them.
    memoMap: Layer.makeMemoMapUnsafe(),
    middleware: disposeMiddleware
  });
}
export * as ExperimentalHttpApiServer from "./server.js";