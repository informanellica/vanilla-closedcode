/** @file HTTP and WebSocket reverse-proxy helpers used to forward instance requests to a remote workspace target. */
import { ProxyUtil } from "#server/proxy-util.js";
import { Effect, Stream } from "effect";
import { HttpBody, HttpClientRequest, HttpServerResponse } from "effect/unstable/http";
import * as Socket from "effect/unstable/socket/Socket";

/**
 * Extract the underlying web `Request` from a server request, if present.
 * @param {Object} request - The HTTP server request.
 * @returns {Request|undefined} The native `Request` source, or undefined when not a web Request.
 */
function webSource(request) {
  return request.source instanceof Request ? request.source : undefined;
}

/**
 * Build an effect that interrupts when the given abort signal fires.
 * @param {AbortSignal|undefined} signal - The abort signal to observe; when absent the effect never completes.
 * @returns {Effect} An effect that interrupts on abort (immediately if already aborted, or never if no signal).
 */
function waitForAbort(signal) {
  if (!signal) return Effect.never;
  if (signal.aborted) return Effect.interrupt;
  return Effect.callback((resume) => {
    const onabort = () => resume(Effect.interrupt);
    signal.addEventListener("abort", onabort, { once: true });
    return Effect.sync(() => signal.removeEventListener("abort", onabort));
  });
}

/**
 * Race an effect against an abort signal, interrupting the effect when the signal fires.
 * @param {Effect} effect - The effect to run.
 * @param {AbortSignal|undefined} signal - The abort signal; when absent `effect` is returned unchanged.
 * @returns {Effect} The original effect, optionally raced against abort.
 */
function raceAbort(effect, signal) {
  return signal ? effect.pipe(Effect.raceFirst(waitForAbort(signal))) : effect;
}

/**
 * Proxy a WebSocket upgrade request to a target URL, bidirectionally piping messages between client and target.
 * Forwards close events in both directions and translates socket errors into close frames.
 * @param {Object} request - The incoming HTTP server request (must support upgrade).
 * @param {string} target - The target URL to open the upstream WebSocket against.
 * @returns {Effect} An effect resolving to an empty HTTP response once the upgrade is established.
 */
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

/**
 * Proxy an HTTP request to a target URL and stream the upstream response back to the client.
 * Forwards the method, merged headers, and (for non-GET/HEAD) the request body stream; strips
 * hop-specific `content-encoding`/`content-length` headers; aborts the upstream call when the
 * client request is aborted; and converts errors into a plain-text 500 response.
 * @param {Object} client - The HTTP client used to execute the upstream request.
 * @param {string} url - The target URL to proxy to.
 * @param {*} extra - Extra headers to merge into the proxied request.
 * @param {Object} request - The incoming HTTP server request to forward.
 * @returns {Effect} An effect resolving to the streamed HTTP server response.
 */
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
