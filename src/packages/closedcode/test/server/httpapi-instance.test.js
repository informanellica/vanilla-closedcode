

import {  NodeHttpServer, NodeServices  } from "@effect/platform-node"
import {  Effect, FileSystem, Layer, Path  } from "effect"
import {  HttpClient, HttpClientRequest, HttpRouter  } from "effect/unstable/http"
import * as Socket from "effect/unstable/socket/Socket";
import {  resetDatabase  } from "../fixture/db.js"
import {  tmpdirScoped  } from "../fixture/fixture.js"
import {  testEffect  } from "../lib/effect.js"
import {  Flag  } from "core/flag/flag"
import {  InstancePaths  } from "../../src/server/routes/instance/httpapi/groups/instance.js"
import {  ExperimentalHttpApiServer  } from "../../src/server/routes/instance/httpapi/server.js"
import {  describe, expect, beforeAll  } from "@jest/globals"
// Flip the experimental HttpApi flag so backend selection telemetry on the
// production routes reports the right backend, and reset the database around
// the test so per-instance state does not leak between runs. resetDatabase()
// already calls disposeAllInstances(), so we don't repeat it.
const testStateLayer = Layer.effectDiscard(Effect.gen(function* () {
  const originalHttpApi = Flag.CLOSEDCODE_EXPERIMENTAL_HTTPAPI;
  Flag.CLOSEDCODE_EXPERIMENTAL_HTTPAPI = true;
  yield* Effect.promise(() => resetDatabase());
  yield* Effect.addFinalizer(() => Effect.promise(async () => {
    Flag.CLOSEDCODE_EXPERIMENTAL_HTTPAPI = originalHttpApi;
    await resetDatabase();
  }));
}));

// Mount the production HttpApi route tree on a real Node HTTP server bound to
// 127.0.0.1:0 and a fetch-based HttpClient that prepends the server URL. This
// keeps the test wired through the same route layer production uses, without
// going through Server.Default()/Express.
const servedRoutes = HttpRouter.serve(ExperimentalHttpApiServer.routes, {
  disableListenLog: true,
  disableLogger: true
});
const httpApiServerLayer = servedRoutes.pipe(Layer.provide(Socket.layerWebSocketConstructorGlobal), Layer.provideMerge(NodeHttpServer.layerTest), Layer.provideMerge(NodeServices.layer));
const it = testEffect(Layer.mergeAll(testStateLayer, httpApiServerLayer));
const directoryHeader = dir => HttpClientRequest.setHeader("x-opencode-directory", dir);
describe("instance HttpApi", () => {
  it.live("serves path and VCS read endpoints", () => Effect.gen(function* () {
    const dir = yield* tmpdirScoped({
      git: true
    });
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* fs.writeFileString(path.join(dir, "changed.txt"), "hello");
    const [paths, vcs, diff] = yield* Effect.all([HttpClientRequest.get(InstancePaths.path).pipe(directoryHeader(dir), HttpClient.execute), HttpClientRequest.get(InstancePaths.vcs).pipe(directoryHeader(dir), HttpClient.execute), HttpClientRequest.get(InstancePaths.vcsDiff).pipe(HttpClientRequest.setUrlParam("mode", "git"), directoryHeader(dir), HttpClient.execute)], {
      concurrency: "unbounded"
    });
    expect(paths.status).toBe(200);
    expect(yield* paths.json).toMatchObject({
      directory: dir,
      worktree: dir
    });
    expect(vcs.status).toBe(200);
    expect(yield* vcs.json).toMatchObject({
      branch: expect.any(String)
    });
    expect(diff.status).toBe(200);
    // /vcs/diff returns diff metadata synchronously; per-file additions and the
    // patch body are delivered asynchronously via the vcs.file-diff.ready bus
    // event (see src/project/vcs.js computePatch), so they are not asserted here.
    expect(yield* diff.json).toContainEqual(expect.objectContaining({
      file: "changed.txt",
      status: "added"
    }));
  }));
});