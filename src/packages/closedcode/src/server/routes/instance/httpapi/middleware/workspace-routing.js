/** @file Workspace routing middleware: decide whether a request runs locally on the control plane or is proxied (HTTP/WebSocket) to a remote workspace, and provide the resolved route context. */
import { getAdapter } from "#control-plane/adapters/index.js";
import { WorkspaceID } from "#control-plane/schema.js";
import { Workspace } from "#control-plane/workspace.js";
import { EffectBridge } from "#effect/bridge.js";
import { Session } from "#session/session.js";
import { HttpApiProxy } from "./proxy.js";
import * as Fence from "#server/fence.js";
import { getWorkspaceRouteSessionID, isLocalWorkspaceRoute, workspaceProxyURL } from "#server/workspace.js";
import { Flag } from "core/flag/flag";
import { Context, Data, Effect, Layer } from "effect";
import { HttpClient, HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";
import { HttpApiMiddleware } from "effect/unstable/httpapi";
import * as Socket from "effect/unstable/socket/Socket";
/** Tagged enum describing how a request should be handled: `Local`, `Remote`, or `MissingWorkspace`. */
const RequestPlan = Data.taggedEnum();
/** Context service carrying the resolved workspace route info (`directory`, `workspaceID`) for local handling. */
export class WorkspaceRouteContext extends Context.Service()("@closedcode/ExperimentalHttpApiWorkspaceRouteContext") {}
/** HttpApi middleware service that performs workspace routing (local vs remote proxy) for instance requests. */
export class WorkspaceRoutingMiddleware extends HttpApiMiddleware.Service()("@closedcode/ExperimentalHttpApiWorkspaceRouting") {}
/**
 * Parse a request URL into a `URL`, using a localhost base for relative request URLs.
 * @param {Object} request - The HTTP server request.
 * @returns {URL} The parsed request URL.
 */
function requestURL(request) {
  return new URL(request.url, "http://localhost");
}
/**
 * Read the workspace ID pinned via the `CLOSEDCODE_WORKSPACE_ID` flag, if any.
 * @returns {*} The configured `WorkspaceID`, or undefined when the flag is unset.
 */
function configuredWorkspaceID() {
  return Flag.CLOSEDCODE_WORKSPACE_ID ? WorkspaceID.make(Flag.CLOSEDCODE_WORKSPACE_ID) : undefined;
}
/**
 * Determine the workspace ID selected for a request, preferring the session's workspace over the `workspace` query param.
 * @param {URL} url - The parsed request URL.
 * @param {*} sessionWorkspaceID - The workspace ID associated with the request's session, if any.
 * @returns {*} The selected `WorkspaceID`, or undefined when none is specified.
 */
function selectedWorkspaceID(url, sessionWorkspaceID) {
  const workspaceParam = url.searchParams.get("workspace");
  return sessionWorkspaceID ?? (workspaceParam ? WorkspaceID.make(workspaceParam) : undefined);
}
/**
 * Resolve the directory for a locally handled request from the `directory` query param,
 * the `x-closedcode-directory`/`x-opencode-directory` headers, or the process cwd.
 * @param {Object} request - The HTTP server request.
 * @param {URL} url - The parsed request URL.
 * @returns {string} The resolved working directory.
 */
function defaultDirectory(request, url) {
  return url.searchParams.get("directory") || request.headers["x-closedcode-directory"] || request.headers["x-opencode-directory"] || process.cwd();
}
/**
 * Decide whether a request must be handled on the control plane regardless of workspace selection
 * (local workspace routes and `/console` paths).
 * @param {Object} request - The HTTP server request.
 * @param {URL} url - The parsed request URL.
 * @returns {boolean} True when the request should stay on the control plane.
 */
function shouldStayOnControlPlane(request, url) {
  return isLocalWorkspaceRoute(request.method, url.pathname) || url.pathname.startsWith("/console");
}
/**
 * Look up a workspace by ID unless routing is pinned by an env workspace ID.
 * @param {*} id - The workspace ID to resolve, if any.
 * @param {*} envWorkspaceID - The env-pinned workspace ID; when set, resolution is skipped.
 * @returns {Effect} An effect resolving to the workspace, or void when no lookup is needed.
 */
function resolveWorkspace(id, envWorkspaceID) {
  if (!id || envWorkspaceID) return Effect.void;
  return Workspace.Service.use(workspace => workspace.get(id));
}
/**
 * Build a 500 plain-text response indicating the requested workspace was not found.
 * @param {*} id - The workspace ID that could not be resolved.
 * @returns {Object} An HTTP server response with status 500.
 */
function missingWorkspaceResponse(id) {
  return HttpServerResponse.text(`Workspace not found: ${id}`, {
    status: 500,
    contentType: "text/plain; charset=utf-8"
  });
}
/**
 * Resolve the routing target for a workspace via its project/type adapter (e.g. local directory or remote URL).
 * @param {Object} workspace - The workspace whose target is being resolved.
 * @returns {Effect} An effect resolving to the adapter's target descriptor.
 */
function resolveTarget(workspace) {
  const adapter = getAdapter(workspace.projectID, workspace.type);
  return EffectBridge.fromPromise(() => adapter.target(workspace));
}
/**
 * Proxy a request to a remote workspace target, returning a 503 when the workspace's sync connection is broken.
 * Routes WebSocket upgrades through the WebSocket proxy; otherwise proxies over HTTP, then honors any sync
 * fence header in the response by waiting for the workspace to catch up (returning 503 on sync failure).
 * @param {Object} client - The HTTP client used for proxying.
 * @param {Object} request - The incoming HTTP server request.
 * @param {Object} workspace - The remote workspace being proxied to.
 * @param {Object} target - The resolved remote target (`url`, `headers`).
 * @param {URL} url - The parsed request URL.
 * @returns {Effect} An effect resolving to the proxied (or error) HTTP response.
 */
function proxyRemote(client, request, workspace, target, url) {
  return Effect.gen(function* () {
    const syncing = yield* Workspace.Service.use(svc => svc.isSyncing(workspace.id));
    if (!syncing) {
      return HttpServerResponse.text(`broken sync connection for workspace: ${workspace.id}`, {
        status: 503,
        contentType: "text/plain; charset=utf-8"
      });
    }
    const proxyURL = workspaceProxyURL(target.url, url);
    const headers = request.headers;
    if (headers["upgrade"]?.toLowerCase() === "websocket") return yield* HttpApiProxy.websocket(request, proxyURL);
    const response = yield* HttpApiProxy.http(client, proxyURL, target.headers, request);
    const sync = Fence.parse(new Headers(response.headers));
    if (sync) {
      const syncFailure = yield* Fence.waitEffect(workspace.id, sync, request.source instanceof Request ? request.source.signal : undefined).pipe(Effect.as(undefined), Effect.catch(error => Effect.succeed(HttpServerResponse.text(error.message, {
        status: 503
      }))));
      if (syncFailure) return syncFailure;
    }
    return response;
  });
}
/**
 * Build a request plan for a resolved workspace: `Remote` when the target is remote (proxy), otherwise `Local`.
 * @param {Object} request - The incoming HTTP server request.
 * @param {URL} url - The parsed request URL.
 * @param {Object} workspace - The resolved workspace.
 * @returns {Effect} An effect resolving to a `RequestPlan` value.
 */
function planWorkspaceRequest(request, url, workspace) {
  return Effect.gen(function* () {
    const target = yield* resolveTarget(workspace);
    if (target.type === "remote") return RequestPlan.Remote({
      request,
      workspace,
      target,
      url
    });
    return RequestPlan.Local({
      directory: target.directory,
      workspaceID: workspace.id
    });
  });
}
/**
 * Compute the routing plan for a request, accounting for the env-pinned workspace, the selected workspace
 * (session or query param), missing workspaces, and control-plane-only routes.
 * @param {Object} request - The incoming HTTP server request.
 * @param {*} sessionWorkspaceID - The workspace ID from the request's session, if any.
 * @returns {Effect} An effect resolving to a `RequestPlan` (`Local`, `Remote`, or `MissingWorkspace`).
 */
function planRequest(request, sessionWorkspaceID) {
  return Effect.gen(function* () {
    const url = requestURL(request);
    const envWorkspaceID = configuredWorkspaceID();
    const workspaceID = selectedWorkspaceID(url, sessionWorkspaceID);
    const workspace = yield* resolveWorkspace(workspaceID, envWorkspaceID);
    if (workspaceID && workspace === undefined && !envWorkspaceID) {
      return RequestPlan.MissingWorkspace({
        workspaceID
      });
    }
    if (workspace !== undefined && !envWorkspaceID && !shouldStayOnControlPlane(request, url)) {
      return yield* planWorkspaceRequest(request, url, workspace);
    }
    return RequestPlan.Local({
      directory: defaultDirectory(request, url),
      workspaceID: envWorkspaceID ?? workspaceID
    });
  });
}
/**
 * Execute a request plan: respond with a not-found error, proxy to the remote target, or run the local
 * handler effect with the `WorkspaceRouteContext` provided.
 * @param {Object} client - The HTTP client used for remote proxying.
 * @param {Effect} effect - The local handler effect to run for `Local` plans.
 * @param {*} plan - The `RequestPlan` produced by `planRequest`.
 * @returns {Effect} An effect resolving to the resulting HTTP response.
 */
function routeWorkspace(client, effect, plan) {
  return RequestPlan.$match(plan, {
    MissingWorkspace: ({
      workspaceID
    }) => Effect.succeed(missingWorkspaceResponse(workspaceID)),
    Remote: ({
      request,
      workspace,
      target,
      url
    }) => proxyRemote(client, request, workspace, target, url),
    Local: ({
      directory,
      workspaceID
    }) => effect.pipe(Effect.provideService(WorkspaceRouteContext, WorkspaceRouteContext.of({
      directory,
      workspaceID
    })))
  });
}
/**
 * Route an HttpApi request by resolving the session's workspace (when a session is referenced),
 * planning the request, and executing the plan.
 * @param {Object} client - The HTTP client used for remote proxying.
 * @param {Effect} effect - The local handler effect to run for `Local` plans.
 * @returns {Effect} An effect resolving to the resulting HTTP response.
 */
function routeHttpApiWorkspace(client, effect) {
  return Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const sessionID = getWorkspaceRouteSessionID(requestURL(request));
    const session = sessionID ? yield* Session.Service.use(svc => svc.get(sessionID)).pipe(Effect.catchDefect(() => Effect.void)) : undefined;
    const plan = yield* planRequest(request, session?.workspaceID);
    return yield* routeWorkspace(client, effect, plan);
  });
}
/** Layer implementing the `WorkspaceRoutingMiddleware` HttpApi service, wiring the WebSocket constructor, Workspace service, and HTTP client into routing. */
export const workspaceRoutingLayer = Layer.effect(WorkspaceRoutingMiddleware, Effect.gen(function* () {
  const makeWebSocket = yield* Socket.WebSocketConstructor;
  const workspace = yield* Workspace.Service;
  const client = yield* HttpClient.HttpClient;
  return WorkspaceRoutingMiddleware.of(effect => routeHttpApiWorkspace(client, effect).pipe(Effect.provideService(Socket.WebSocketConstructor, makeWebSocket), Effect.provideService(Workspace.Service, workspace)));
}));
/** Router-level workspace routing middleware for raw (non-HttpApi) routes; plans and routes each request without session lookup. */
export const workspaceRouterMiddleware = HttpRouter.middleware()(Effect.gen(function* () {
  const makeWebSocket = yield* Socket.WebSocketConstructor;
  const workspace = yield* Workspace.Service;
  const client = yield* HttpClient.HttpClient;
  return effect => Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const plan = yield* planRequest(request);
    return yield* routeWorkspace(client, effect, plan);
  }).pipe(Effect.provideService(Socket.WebSocketConstructor, makeWebSocket), Effect.provideService(Workspace.Service, workspace));
}));