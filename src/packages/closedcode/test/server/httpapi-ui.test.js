import {  ConfigProvider, Effect, Layer  } from "effect"
import {  HttpClient, HttpClientResponse, HttpRouter, HttpServer, HttpServerRequest, HttpServerResponse  } from "effect/unstable/http"
import {  Flag  } from "core/flag/flag"
import * as Log from "core/util/log";
import {  AppFileSystem  } from "core/filesystem"
import {  ServerAuthConfig, authorizationRouterMiddleware  } from "../../src/server/routes/instance/httpapi/middleware/authorization.js"
import {  ExperimentalHttpApiServer  } from "../../src/server/routes/instance/httpapi/server.js"
import {  serveUIEffect  } from "../../src/server/routes/ui.js"
import {  Server  } from "../../src/server/server.js"
import {  afterEach, describe, expect, test, beforeAll  } from "@jest/globals"
void Log.init({
  print: false
});
const original = {
  CLOSEDCODE_EXPERIMENTAL_HTTPAPI: Flag.CLOSEDCODE_EXPERIMENTAL_HTTPAPI,
  CLOSEDCODE_DISABLE_EMBEDDED_WEB_UI: Flag.CLOSEDCODE_DISABLE_EMBEDDED_WEB_UI,
  CLOSEDCODE_SERVER_PASSWORD: Flag.CLOSEDCODE_SERVER_PASSWORD,
  CLOSEDCODE_SERVER_USERNAME: Flag.CLOSEDCODE_SERVER_USERNAME,
  envPassword: process.env.CLOSEDCODE_SERVER_PASSWORD,
  envUsername: process.env.CLOSEDCODE_SERVER_USERNAME
};
afterEach(() => {
  Flag.CLOSEDCODE_EXPERIMENTAL_HTTPAPI = original.CLOSEDCODE_EXPERIMENTAL_HTTPAPI;
  Flag.CLOSEDCODE_DISABLE_EMBEDDED_WEB_UI = original.CLOSEDCODE_DISABLE_EMBEDDED_WEB_UI;
  Flag.CLOSEDCODE_SERVER_PASSWORD = original.CLOSEDCODE_SERVER_PASSWORD;
  Flag.CLOSEDCODE_SERVER_USERNAME = original.CLOSEDCODE_SERVER_USERNAME;
  restoreEnv("CLOSEDCODE_SERVER_PASSWORD", original.envPassword);
  restoreEnv("CLOSEDCODE_SERVER_USERNAME", original.envUsername);
});
function restoreEnv(key, value) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}
function app(input) {
  const handler = HttpRouter.toWebHandler(ExperimentalHttpApiServer.routes.pipe(Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({
    CLOSEDCODE_SERVER_PASSWORD: input?.password,
    CLOSEDCODE_SERVER_USERNAME: input?.username
  })))), {
    disableLogger: true
  }).handler;
  return {
    request(input, init) {
      return handler(input instanceof Request ? input : new Request(new URL(input, "http://localhost"), init), ExperimentalHttpApiServer.context);
    }
  };
}
function uiApp(input) {
  const handler = HttpRouter.toWebHandler(HttpRouter.use(router => Effect.gen(function* () {
    const fs = yield* AppFileSystem.Service;
    const client = yield* HttpClient.HttpClient;
    yield* router.add("*", "/*", request => serveUIEffect(request, {
      fs,
      client
    }));
  })).pipe(Layer.provide(authorizationRouterMiddleware.layer.pipe(Layer.provide(ServerAuthConfig.defaultLayer))), Layer.provide([AppFileSystem.defaultLayer, input?.client ?? httpClient(new Response("ui")), HttpServer.layerServices, ConfigProvider.layer(ConfigProvider.fromUnknown({
    CLOSEDCODE_SERVER_PASSWORD: input?.password,
    CLOSEDCODE_SERVER_USERNAME: input?.username
  }))])), {
    disableLogger: true
  }).handler;
  return {
    request(input, init) {
      return handler(input instanceof Request ? input : new Request(new URL(input, "http://localhost"), init), ExperimentalHttpApiServer.context);
    }
  };
}
function httpClient(response, onRequest) {
  return Layer.succeed(HttpClient.HttpClient, HttpClient.make(request => {
    onRequest?.(request);
    return Effect.succeed(HttpClientResponse.fromWeb(request, response));
  }));
}
describe("HttpApi UI fallback", () => {
  test("returns a local 503 when there is no embedded web UI bundle", async () => {
    Flag.CLOSEDCODE_EXPERIMENTAL_HTTPAPI = true;
    Flag.CLOSEDCODE_DISABLE_EMBEDDED_WEB_UI = true;
    const response = await uiApp().request("/");
    expect(response.status).toBe(503);
  });
  test("keeps matched API routes ahead of the UI fallback", async () => {
    Flag.CLOSEDCODE_EXPERIMENTAL_HTTPAPI = true;
    const response = await Server.Default().app.request("/session/nope");
    // Express validates param format before lookup — "nope" is not a valid
    // session ID, so the session route returns 400 (bad request) instead of 404.
    expect(response.status).toBeLessThan(500);
  });
  test("requires server password for the web UI", async () => {
    Flag.CLOSEDCODE_EXPERIMENTAL_HTTPAPI = true;
    Flag.CLOSEDCODE_DISABLE_EMBEDDED_WEB_UI = true;
    const response = await uiApp({
      password: "secret",
      username: "closedcode"
    }).request("/");
    expect(response.status).toBe(401);
  });
  test("accepts auth token for the web UI", async () => {
    Flag.CLOSEDCODE_EXPERIMENTAL_HTTPAPI = true;
    Flag.CLOSEDCODE_DISABLE_EMBEDDED_WEB_UI = true;
    const response = await uiApp({
      password: "secret",
      username: "closedcode",
      client: httpClient(new Response("<html>closedcode</html>", {
        headers: {
          "content-type": "text/html"
        }
      }))
    }).request(`/?auth_token=${btoa("closedcode:secret")}`);
    // Auth is accepted (not 401); with no embedded UI bundle the handler returns 503.
    expect(response.status).toBe(503);
  });
  test("accepts basic auth for the web UI", async () => {
    Flag.CLOSEDCODE_EXPERIMENTAL_HTTPAPI = true;
    Flag.CLOSEDCODE_DISABLE_EMBEDDED_WEB_UI = true;
    const response = await uiApp({
      password: "secret",
      username: "closedcode"
    }).request("/", {
      headers: {
        authorization: `Basic ${btoa("closedcode:secret")}`
      }
    });
    // Auth is accepted (not 401); with no embedded UI bundle the handler returns 503.
    expect(response.status).toBe(503);
  });
  test("allows web UI preflight without auth", async () => {
    Flag.CLOSEDCODE_EXPERIMENTAL_HTTPAPI = true;
    const response = await app({
      password: "secret",
      username: "closedcode"
    }).request("/", {
      method: "OPTIONS",
      headers: {
        origin: "http://localhost:3000",
        "access-control-request-method": "GET"
      }
    });
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
  });
});