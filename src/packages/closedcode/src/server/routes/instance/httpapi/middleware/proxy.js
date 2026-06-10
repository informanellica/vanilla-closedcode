import { ProxyUtil } from "#server/proxy-util.js";
import { Effect, Stream } from "effect";
import { HttpBody, HttpClientRequest, HttpServerResponse } from "effect/unstable/http";
import * as Socket from "effect/unstable/socket/Socket";

function webSource(request) {
  return request.source instanceof Request ? request.source : undefined;
}

function waitForAbort(signal) {
  if (!signal) return Effect.never;
  if (signal.aborted) return Effect.interrupt;
  return Effect.callback((resume) => {
    const onabort = () => resume(Effect.interrupt);
    signal.addEventListener("abort", onabort, { once: true });
    return Effect.sync(() => signal.removeEventListener("abort", onabort));
  });
}

function raceAbort(effect, signal) {
  return signal ? effect.pipe(Effect.raceFirst(waitForAbort(signal))) : effect;
}

export function websocket(request, target) {
  return Effect.scoped(Effect.gen(function* () {
    const inbound = yield* Effect.orDie(request.upgrade);
    const outbound = yield* Socket.makeWebSocket(ProxyUtil.websocketTargetURL(target), {
      protocols: ProxyUtil.websocketProtocols(request.headers),
    });
    const writeInbound = yield* inbound.writer;
    const writeOutbound = yield* outbound.writer;
    yield* outbound.runRaw((message) => writeInbound(message)).pipe(
      Effect.catchReason("SocketError", "SocketCloseError", (reason) =>
        writeInbound(new Socket.CloseEvent(reason.code, reason.closeReason)).pipe(Effect.catch(() => Effect.void))),
      Effect.catch(() => writeInbound(new Socket.CloseEvent(1011, "proxy error")).pipe(Effect.catch(() => Effect.void))),
      Effect.forkScoped,
    );
    yield* inbound.runRaw((message) => writeOutbound(typeof message === "string" ? message : message.slice())).pipe(
      Effect.catch(() => Effect.void),
      Effect.ensuring(writeOutbound(new Socket.CloseEvent()).pipe(Effect.catch(() => Effect.void))),
    );
    return HttpServerResponse.empty();
  }).pipe(Effect.orDie));
}

export function http(client, url, extra, request) {
  return Effect.gen(function* () {
    const source = webSource(request);
    const method = request.method;
    const headers = ProxyUtil.headers(request.headers, extra);
    const hasBody = method !== "GET" && method !== "HEAD";
    const contentType = headers.get("content-type") ?? undefined;
    const bodyStream = hasBody && source?.body
      ? Stream.fromReadableStream({
          evaluate: () => source.body,
          onError: (cause) => new Error("proxy request body error", { cause }),
        })
      : undefined;
    const clientRequest = HttpClientRequest.make(method)(url, {
      headers,
      body: bodyStream ? HttpBody.stream(bodyStream, contentType) : undefined,
    });
    const response = yield* raceAbort(client.execute(clientRequest), source?.signal);
    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete("content-encoding");
    responseHeaders.delete("content-length");
    return HttpServerResponse.stream(response.stream.pipe(Stream.catchCause(() => Stream.empty)), {
      status: response.status,
      statusText: response.source?.statusText,
      headers: responseHeaders,
    });
  }).pipe(Effect.catch((error) => Effect.succeed(HttpServerResponse.text(error.message ?? String(error), {
    status: 500,
    contentType: "text/plain; charset=utf-8",
  }))));
}
export * as HttpApiProxy from "./proxy.js";
