

import {  NodeHttpServer, NodeServices  } from "@effect/platform-node"
import {  Effect, Fiber, Layer  } from "effect"
import {  HttpClient, HttpClientRequest, HttpRouter, HttpServerResponse  } from "effect/unstable/http"
import * as Socket from "effect/unstable/socket/Socket";
import {  resetDatabase  } from "../fixture/db.js"
import {  disposeAllInstances, tmpdirScoped  } from "../fixture/fixture.js"
import {  testEffect  } from "../lib/effect.js"
import {  Flag  } from "core/flag/flag"
import {  registerAdapter  } from "../../src/control-plane/adapters/index.js"
import {  Workspace  } from "../../src/control-plane/workspace.js"
import {  InstanceRef, WorkspaceRef  } from "../../src/effect/instance-ref.js"
import {  InstanceLayer  } from "../../src/project/instance-layer.js"
import {  Project  } from "../../src/project/project.js"
import {  disposeMiddleware, markInstanceForDisposal  } from "../../src/server/routes/instance/httpapi/lifecycle.js"
import {  instanceRouterMiddleware  } from "../../src/server/routes/instance/httpapi/middleware/instance-context.js"
import {  workspaceRouterMiddleware  } from "../../src/server/routes/instance/httpapi/middleware/workspace-routing.js"
import {  describe, expect, beforeAll  } from "@jest/globals"
import {  mkdir  } from "node:fs/promises"
import path from "node:path";
import {  waitGlobalBusEvent  } from "./global-bus.js"
const testStateLayer = Layer.effectDiscard(Effect.gen(function* () {
  const originalWorkspaces = Flag.CLOSEDCODE_EXPERIMENTAL_WORKSPACES;
  yield* Effect.promise(() => resetDatabase());
  Flag.CLOSEDCODE_EXPERIMENTAL_WORKSPACES = true;
  yield* Effect.addFinalizer(() => Effect.promise(async () => {
    Flag.CLOSEDCODE_EXPERIMENTAL_WORKSPACES = originalWorkspaces;
    await disposeAllInstances();
    await resetDatabase();
  }));
}));
const it = testEffect(Layer.mergeAll(testStateLayer, NodeHttpServer.layerTest, NodeServices.layer, InstanceLayer.layer, Project.defaultLayer, Workspace.defaultLayer));
const instanceContextTestLayer = instanceRouterMiddleware.combine(workspaceRouterMiddleware).layer.pipe(Layer.provide(Socket.layerWebSocketConstructorGlobal));
const localAdapter = directory => ({
  name: "Local Test",
  description: "Create a local test workspace",
  configure: info => ({
    ...info,
    name: "local-test",
    directory
  }),
  create: async () => {
    await mkdir(directory, {
      recursive: true
    });
  },
  async remove() {},
  target: () => ({
    type: "local",
    directory
  })
});
const createLocalWorkspace = input => Effect.acquireRelease(Effect.gen(function* () {
  registerAdapter(input.projectID, input.type, localAdapter(input.directory));
  const workspace = yield* Workspace.Service;
  return yield* workspace.create({
    type: input.type,
    branch: null,
    extra: null,
    projectID: input.projectID
  });
}), info => Workspace.Service.use(workspace => workspace.remove(info.id)).pipe(Effect.ignore));
const probeInstanceContext = Effect.gen(function* () {
  const instance = yield* InstanceRef;
  const workspaceID = yield* WorkspaceRef;
  return yield* HttpServerResponse.json({
    directory: instance?.directory,
    worktree: instance?.worktree,
    projectID: instance?.project.id,
    workspaceID
  });
});
const serveProbe = (probePath = "/probe") => HttpRouter.add("GET", probePath, probeInstanceContext).pipe(Layer.provide(instanceContextTestLayer), HttpRouter.serve, Layer.build);
const waitDisposedEvent = waitGlobalBusEvent({
  message: "timed out waiting for instance disposal",
  predicate: event => event.payload.type === "server.instance.disposed"
}).pipe(Effect.map(event => ({
  directory: event.directory,
  workspace: event.workspace
})));
const serveDisposeProbe = () => HttpRouter.serve(HttpRouter.add("POST", "/dispose-probe", Effect.gen(function* () {
  const instance = yield* InstanceRef;
  if (!instance) return HttpServerResponse.empty({
    status: 500
  });
  yield* markInstanceForDisposal(instance);
  return yield* HttpServerResponse.json(true);
})).pipe(Layer.provide(instanceContextTestLayer)), {
  middleware: disposeMiddleware,
  disableListenLog: true,
  disableLogger: true
}).pipe(Layer.build);
describe("HttpApi instance context middleware", () => {
  it.live("provides instance context from the routed directory", () => Effect.gen(function* () {
    const dir = yield* tmpdirScoped({
      git: true
    });
    const project = yield* Project.use.fromDirectory(dir);
    yield* serveProbe();
    const response = yield* HttpClient.get(`/probe?directory=${encodeURIComponent(dir)}`);
    expect(response.status).toBe(200);
    expect(yield* response.json).toEqual({
      directory: dir,
      worktree: dir,
      projectID: project.project.id
    });
  }));
  it.live("falls back to the raw directory when URI decoding fails", () => Effect.gen(function* () {
    yield* serveProbe();
    const response = yield* HttpClient.get("/probe?directory=%25E0%25A4%25A");
    expect(response.status).toBe(200);
    expect(yield* response.json).toMatchObject({
      directory: path.join(process.cwd(), "%E0%A4%A")
    });
  }));
  it.live("provides selected workspace id on control-plane routes", () => Effect.gen(function* () {
    const dir = yield* tmpdirScoped({
      git: true
    });
    const project = yield* Project.use.fromDirectory(dir);
    const workspaceDir = path.join(dir, ".workspace-local");
    const workspace = yield* createLocalWorkspace({
      projectID: project.project.id,
      type: "instance-context-workspace-ref",
      directory: workspaceDir
    });
    yield* serveProbe("/session");
    const response = yield* HttpClientRequest.get(`/session?workspace=${workspace.id}`).pipe(HttpClientRequest.setHeader("x-opencode-directory", dir), HttpClient.execute);
    expect(response.status).toBe(200);
    expect(yield* response.json).toMatchObject({
      directory: dir,
      workspaceID: workspace.id
    });
  }));
  it.live("uses workspace routing output instead of raw directory hints", () => Effect.gen(function* () {
    const dir = yield* tmpdirScoped({
      git: true
    });
    const project = yield* Project.use.fromDirectory(dir);
    const workspaceDir = path.join(dir, ".workspace-local");
    const workspace = yield* createLocalWorkspace({
      projectID: project.project.id,
      type: "instance-context-routing-output",
      directory: workspaceDir
    });
    yield* serveProbe();
    const response = yield* HttpClientRequest.get(`/probe?workspace=${workspace.id}`).pipe(HttpClientRequest.setHeader("x-opencode-directory", dir), HttpClient.execute);
    expect(response.status).toBe(200);
    expect(yield* response.json).toMatchObject({
      directory: workspaceDir,
      workspaceID: workspace.id
    });
  }));
  it.live("preserves selected workspace id on instance disposal events", () => Effect.gen(function* () {
    const dir = yield* tmpdirScoped({
      git: true
    });
    const project = yield* Project.use.fromDirectory(dir);
    const workspaceDir = path.join(dir, ".workspace-local");
    const workspace = yield* createLocalWorkspace({
      projectID: project.project.id,
      type: "instance-context-dispose-event",
      directory: workspaceDir
    });
    yield* serveDisposeProbe();
    const disposed = yield* waitDisposedEvent.pipe(Effect.forkScoped);
    const response = yield* HttpClientRequest.post(`/dispose-probe?workspace=${workspace.id}`).pipe(HttpClient.execute);
    expect(response.status).toBe(200);
    expect(yield* response.json).toBe(true);
    expect(yield* Fiber.join(disposed)).toEqual({
      directory: workspaceDir,
      workspace: workspace.id
    });
  }));
});