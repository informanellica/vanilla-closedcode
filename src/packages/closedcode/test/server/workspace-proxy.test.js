
import {  NodeHttpServer, NodeServices  } from "@effect/platform-node"
import {  Context, Effect, Layer, Queue  } from "effect"
import {  FetchHttpClient, HttpClient, HttpServer, HttpServerRequest, HttpServerResponse  } from "effect/unstable/http"
import * as Socket from "effect/unstable/socket/Socket";
import {  testEffect  } from "../lib/effect.js"
import {  HttpApiProxy  } from "../../src/server/routes/instance/httpapi/middleware/proxy.js"
import Http from "node:http";
import {  describe, expect, beforeAll  } from "@jest/globals"
function serverUrl() {
  return HttpServer.HttpServer.use(server => Effect.succeed(HttpServer.formatAddress(server.address)));
}
const testServerLayer = Layer.mergeAll(NodeHttpServer.layer(Http.createServer, {
  host: "127.0.0.1",
  port: 0
}), NodeServices.layer, FetchHttpClient.layer, Socket.layerWebSocketConstructorGlobal);
const it = testEffect(testServerLayer);
function listenServer(handler) {
  return Effect.gen(function* () {
    yield* HttpServer.serveEffect()(HttpServerRequest.HttpServerRequest.use(handler));
    return yield* serverUrl();
  });
}
function listenTestServer(handler) {
  return Effect.gen(function* () {
    // Build into the current test scope so the listener stays alive until the
    // test finishes. Using Effect.provide here would release it immediately.
    const context = yield* Layer.build(NodeHttpServer.layer(Http.createServer, {
      host: "127.0.0.1",
      port: 0
    }));
    const server = Context.get(context, HttpServer.HttpServer);
    yield* server.serve(HttpServerRequest.HttpServerRequest.use(handler));
    return HttpServer.formatAddress(server.address);
  });
}
function echoWebSocket(request) {
  return Effect.gen(function* () {
    const socket = yield* Effect.orDie(request.upgrade);
    const write = yield* socket.writer;
    // The upstream announces the negotiated protocol, then echoes every
    // received frame. The assertions use those messages to prove proxy flow.
    yield* socket.runRaw(message => write(`echo:${String(message)}`), {
      onOpen: write(`protocol:${request.headers["sec-websocket-protocol"] ?? "none"}`).pipe(Effect.catch(() => Effect.void))
    }).pipe(Effect.catch(() => Effect.void));
    return HttpServerResponse.empty();
  });
}
describe("HttpApi workspace proxy", () => {
  it.live("proxies HTTP request and returns streamed response with status and headers", () => Effect.gen(function* () {
    const url = yield* listenServer(Effect.fnUntraced(function* (req) {
      const body = yield* req.text;
      return yield* HttpServerResponse.json({
        path: req.url,
        method: req.method,
        body
      }, {
        status: 201,
        headers: {
          "content-encoding": "identity",
          "content-length": "999",
          "x-remote": "yes"
        }
      });
    }));
    const request = HttpServerRequest.fromWeb(new Request("http://localhost/session/abc", {
      method: "POST",
      body: "request-body"
    }));
    const httpClient = yield* HttpClient.HttpClient;
    const response = yield* HttpApiProxy.http(httpClient, `${url}/session/abc?keep=yes`, {
      "x-extra": "injected"
    }, request);
    expect(response.status).toBe(201);
    const client = HttpServerResponse.toClientResponse(response);
    expect(yield* client.json).toEqual({
      path: "/session/abc?keep=yes",
      method: "POST",
      body: "request-body"
    });
    expect(response.headers["x-remote"]).toBe("yes");
    expect(response.headers["content-encoding"]).toBeUndefined();
    expect(response.headers["content-length"]).toBeUndefined();
  }));
  it.live("returns 500 when remote is unreachable", () => Effect.gen(function* () {
    const request = HttpServerRequest.fromWeb(new Request("http://localhost/anything"));
    const httpClient = yield* HttpClient.HttpClient;
    const response = yield* HttpApiProxy.http(httpClient, "http://127.0.0.1:1/unreachable", undefined, request);
    expect(response.status).toBe(500);
  }));
  it.live("strips opencode-internal headers and merges extra headers", () => Effect.gen(function* () {
    let forwarded = {};
    const url = yield* listenServer(req => Effect.sync(() => {
      forwarded = req.headers;
      return HttpServerResponse.empty();
    }));
    const request = HttpServerRequest.fromWeb(new Request("http://localhost/test", {
      headers: {
        "x-opencode-directory": "/secret/path",
        "x-opencode-workspace": "ws_123",
        "x-custom": "preserved"
      }
    }));
    const httpClient = yield* HttpClient.HttpClient;
    yield* HttpApiProxy.http(httpClient, `${url}/test`, {
      "x-injected": "extra"
    }, request);
    expect(forwarded["x-opencode-directory"]).toBeUndefined();
    expect(forwarded["x-opencode-workspace"]).toBeUndefined();
    expect(forwarded["x-custom"]).toBe("preserved");
    expect(forwarded["x-injected"]).toBe("extra");
  }));
  it.live("proxies websocket messages and protocols", () => Effect.gen(function* () {
    const upstreamUrl = yield* listenTestServer(echoWebSocket);

    // Client -> proxy listener -> HttpApiProxy.websocket -> upstream listener.
    // The client never connects to upstream directly.
    const proxyUrl = yield* listenServer(request => HttpApiProxy.websocket(request, `${upstreamUrl}/echo`));
    const socket = yield* Socket.makeWebSocket(`${proxyUrl.replace(/^http/, "ws")}/proxy`, {
      closeCodeIsError: () => false,
      protocols: "chat"
    });
    const messages = yield* Queue.unbounded();
    yield* socket.runRaw(message => Queue.offer(messages, String(message))).pipe(Effect.forkScoped);
    const write = yield* socket.writer;
    expect(yield* Queue.take(messages)).toBe("protocol:chat");
    yield* write("hello");
    expect(yield* Queue.take(messages)).toBe("echo:hello");
  }));
});