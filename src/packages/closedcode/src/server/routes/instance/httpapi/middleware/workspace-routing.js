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
const RequestPlan = Data.taggedEnum();
export class WorkspaceRouteContext extends Context.Service()("@closedcode/ExperimentalHttpApiWorkspaceRouteContext") {}
export class WorkspaceRoutingMiddleware extends HttpApiMiddleware.Service()("@closedcode/ExperimentalHttpApiWorkspaceRouting") {}
function requestURL(request) {
  return new URL(request.url, "http://localhost");
}
function configuredWorkspaceID() {
  return Flag.CLOSEDCODE_WORKSPACE_ID ? WorkspaceID.make(Flag.CLOSEDCODE_WORKSPACE_ID) : undefined;
}
function selectedWorkspaceID(url, sessionWorkspaceID) {
  const workspaceParam = url.searchParams.get("workspace");
  return sessionWorkspaceID ?? (workspaceParam ? WorkspaceID.make(workspaceParam) : undefined);
}
function defaultDirectory(request, url) {
  return url.searchParams.get("directory") || request.headers["x-closedcode-directory"] || request.headers["x-opencode-directory"] || process.cwd();
}
function shouldStayOnControlPlane(request, url) {
  return isLocalWorkspaceRoute(request.method, url.pathname) || url.pathname.startsWith("/console");
}
function resolveWorkspace(id, envWorkspaceID) {
  if (!id || envWorkspaceID) return Effect.void;
  return Workspace.Service.use(workspace => workspace.get(id));
}
function missingWorkspaceResponse(id) {
  return HttpServerResponse.text(`Workspace not found: ${id}`, {
    status: 500,
    contentType: "text/plain; charset=utf-8"
  });
}
function resolveTarget(workspace) {
  const adapter = getAdapter(workspace.projectID, workspace.type);
  return EffectBridge.fromPromise(() => adapter.target(workspace));
}
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
function routeHttpApiWorkspace(client, effect) {
  return Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const sessionID = getWorkspaceRouteSessionID(requestURL(request));
    const session = sessionID ? yield* Session.Service.use(svc => svc.get(sessionID)).pipe(Effect.catchDefect(() => Effect.void)) : undefined;
    const plan = yield* planRequest(request, session?.workspaceID);
    return yield* routeWorkspace(client, effect, plan);
  });
}
export const workspaceRoutingLayer = Layer.effect(WorkspaceRoutingMiddleware, Effect.gen(function* () {
  const makeWebSocket = yield* Socket.WebSocketConstructor;
  const workspace = yield* Workspace.Service;
  const client = yield* HttpClient.HttpClient;
  return WorkspaceRoutingMiddleware.of(effect => routeHttpApiWorkspace(client, effect).pipe(Effect.provideService(Socket.WebSocketConstructor, makeWebSocket), Effect.provideService(Workspace.Service, workspace)));
}));
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