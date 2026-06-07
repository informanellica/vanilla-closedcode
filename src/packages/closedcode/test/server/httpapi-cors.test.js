

import {  NodeHttpServer, NodeServices  } from "@effect/platform-node"
import {  Effect, Layer  } from "effect"
import {  HttpClient, HttpClientRequest, HttpRouter  } from "effect/unstable/http"
import * as Socket from "effect/unstable/socket/Socket";
import {  resetDatabase  } from "../fixture/db.js"
import {  testEffect  } from "../lib/effect.js"
import {  Flag  } from "core/flag/flag"
import {  Server  } from "../../src/server/server.js"
import {  InstancePaths  } from "../../src/server/routes/instance/httpapi/groups/instance.js"
import {  ExperimentalHttpApiServer  } from "../../src/server/routes/instance/httpapi/server.js"
import {  describe, expect, beforeAll  } from "@jest/globals"
const testStateLayer = Layer.effectDiscard(Effect.gen(function* () {
  const original = {
    CLOSEDCODE_EXPERIMENTAL_HTTPAPI: Flag.CLOSEDCODE_EXPERIMENTAL_HTTPAPI,
    CLOSEDCODE_SERVER_PASSWORD: Flag.CLOSEDCODE_SERVER_PASSWORD
  };
  Flag.CLOSEDCODE_EXPERIMENTAL_HTTPAPI = true;
  Flag.CLOSEDCODE_SERVER_PASSWORD = "secret";
  yield* Effect.promise(() => resetDatabase());
  yield* Effect.addFinalizer(() => Effect.promise(async () => {
    Flag.CLOSEDCODE_EXPERIMENTAL_HTTPAPI = original.CLOSEDCODE_EXPERIMENTAL_HTTPAPI;
    Flag.CLOSEDCODE_SERVER_PASSWORD = original.CLOSEDCODE_SERVER_PASSWORD;
    await resetDatabase();
  }));
}));
const servedRoutes = HttpRouter.serve(ExperimentalHttpApiServer.routes, {
  disableListenLog: true,
  disableLogger: true
});
const it = testEffect(Layer.mergeAll(testStateLayer, servedRoutes.pipe(Layer.provide(Socket.layerWebSocketConstructorGlobal), Layer.provideMerge(NodeHttpServer.layerTest), Layer.provideMerge(NodeServices.layer))));
describe("HttpApi CORS", () => {
  it.live("allows browser preflight requests without credentials", () => Effect.gen(function* () {
    const response = yield* HttpClientRequest.options(InstancePaths.path).pipe(HttpClientRequest.setHeaders({
      origin: "http://localhost:3000",
      "access-control-request-method": "GET",
      "access-control-request-headers": "authorization"
    }), HttpClient.execute);
    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    expect(response.headers["access-control-allow-headers"]).toBe("authorization");
  }));
  it.live("uses custom CORS origins passed to the server", () => Effect.gen(function* () {
    const listener = yield* Effect.acquireRelease(Effect.promise(() => Server.listen({
      hostname: "127.0.0.1",
      port: 0,
      cors: ["https://custom.example"]
    })), listener => Effect.promise(() => listener.stop(true)));
    const response = yield* Effect.promise(() => fetch(new URL(InstancePaths.path, listener.url), {
      method: "OPTIONS",
      headers: {
        origin: "https://custom.example",
        "access-control-request-method": "GET",
        "access-control-request-headers": "authorization"
      }
    }));
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://custom.example");
    expect(response.headers.get("access-control-allow-headers")).toBe("authorization");
  }));
});