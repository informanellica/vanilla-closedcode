/**
 * @file Express runtime adapter: wraps an Express app with
 * node:http.createServer for listening, a noServer WebSocketServer (ws package)
 * for upgrade handling (including remote-workspace WS proxying), and an
 * in-process loopback fetch tuned for long-running agent requests.
 */
// Express runtime adapter: wraps an Express app with node:http.createServer for
// listening and a noServer WebSocketServer (ws package) for upgrade handling.
import http from "node:http";
import { Agent } from "undici";
import { WebSocketServer, WebSocket } from "ws";

// Dispatcher with the per-request idle timeouts disabled, for the in-process
// loopback fetch below. `closedcode run` runs the whole agent loop inside one
// request whose response headers are not sent until the loop finishes (often
// >5 min); undici's default headersTimeout/bodyTimeout (300 s) would otherwise
// abort that fetch (UND_ERR_HEADERS_TIMEOUT) and kill the run. 0 = no timeout.
const IN_PROCESS_DISPATCHER = new Agent({ headersTimeout: 0, bodyTimeout: 0 });
import { Flag } from "core/flag/flag";
import { WorkspaceID } from "#control-plane/schema.js";
import { Workspace } from "#control-plane/workspace.js";
import { AppRuntime } from "#effect/app-runtime.js";
import { ProxyUtil } from "#server/proxy-util.js";
import { resolveWorkspaceRoute, workspaceProxyURL } from "#server/workspace.js";

/**
 * Start an HTTP server for the given Express app and return a control handle.
 * Disables per-request/header timeouts only for explicit loopback binds (so
 * long agent loops are not aborted), tries port 4096 then a random port when
 * `opts.port` is 0, and lets the optional injector hook the server before it
 * listens (used to attach WebSocket upgrade handling).
 * @param {Object} app - The Express application/request handler.
 * @param {Object} opts - Listen options: `port` (0 = auto) and `hostname`.
 * @param {Function} inject - Optional callback invoked with the http.Server before it listens.
 * @returns {Promise<Object>} Resolves to a handle with `port` and a `stop(close)` method.
 */
async function listen(app, opts, inject) {
  /**
   * Create and bind an http.Server on the given port (and opts.hostname),
   * resolving with the server once it is listening.
   * @param {number} port - The TCP port to bind.
   * @returns {Promise<Object>} Resolves to the listening http.Server.
   */
  const start = (port) =>
    new Promise((resolve, reject) => {
      const server = http.createServer(app);
      // Long agent loops run inside a single request, so the default 5-minute
      // requestTimeout would abort them — but zeroing the timeouts also lets a
      // client hold a connection open forever (slow-header DoS). Only disable
      // them for EXPLICIT loopback binds: an omitted hostname makes Node listen
      // on all interfaces, so it must keep the defaults too. (The CLI defaults
      // --hostname to 127.0.0.1, so local serves still get the long-run fix.)
      const loopback = ["127.0.0.1", "localhost", "::1", "::ffff:127.0.0.1"].includes(opts.hostname);
      if (loopback) {
        server.requestTimeout = 0;
        server.headersTimeout = 0;
      }
      inject?.(server);
      const fail = (err) => {
        cleanup();
        reject(err);
      };
      const ready = () => {
        cleanup();
        resolve(server);
      };
      const cleanup = () => {
        server.off("error", fail);
        server.off("listening", ready);
      };
      server.once("error", fail);
      server.once("listening", ready);
      server.listen(port, opts.hostname);
    });
  const server = opts.port === 0 ? await start(4096).catch(() => start(0)) : await start(opts.port);
  const addr = server.address();
  if (!addr || typeof addr === "string") {
    throw new Error(`Failed to resolve server address for port ${opts.port}`);
  }
  let closing;
  return {
    port: addr.port,
    /**
     * Stop the server, resolving once it has fully closed. Idempotent.
     * @param {boolean} close - When true, also forcibly close all (idle and active) connections.
     * @returns {Promise<void>} Resolves when the server has closed.
     */
    stop(close) {
      closing ??= new Promise((resolve, reject) => {
        server.close((err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
        if (close) {
          if (typeof server.closeAllConnections === "function") server.closeAllConnections();
          if (typeof server.closeIdleConnections === "function") server.closeIdleConnections();
        }
      });
      return closing;
    },
  };
}

// Build the upgradeWebSocket helper + the server-side injector. The returned
// `upgradeWebSocket(handlerFactory)` produces an Express route handler that, on
// a matched path, defers to the upgrade listener registered below. Mirrors the
// shape used by route code (e.g. pty.js).
/**
 * Build the WebSocket upgrade machinery for the Express adapter.
 * Returns an `upgradeWebSocket` route-handler factory (registers per-path WS
 * handlers) and an `injectWebSocket(server)` injector that handles HTTP
 * `upgrade` events, dispatching to local routes or remote-workspace proxying.
 * @returns {Object} An object with `upgradeWebSocket` and `injectWebSocket`.
 */
function createWebSocket() {
  const wss = new WebSocketServer({ noServer: true });
  const routes = new Map(); // path -> handlerFactory

  /**
   * Create an Express middleware that registers a WS handler factory for the
   * request's path; the actual upgrade is performed later in the server's
   * `upgrade` event. Non-upgrade requests fall through.
   * @param {Function} handlerFactory - Async factory `({req}) -> handlers` producing WS event handlers.
   * @returns {Function} An Express middleware `(req, res, next)`.
   */
  const upgradeWebSocket = (handlerFactory) => {
    return (req, res, next) => {
      // Record the handler for this exact path; the actual switch to a WS
      // happens in the HTTP 'upgrade' event below. For a normal (non-upgrade)
      // request to a WS route we fall through.
      routes.set(req.path, handlerFactory);
      next();
    };
  };

  // Proxy an inbound upgrade to a remote-workspace target, mirroring
  // HttpApiProxy.websocket: complete the inbound handshake, open an outbound
  // `ws` client to the remote, and bridge messages/close codes both ways.
  // Only REMOTE-target workspaces are proxied here; everything else falls back
  // to socket.destroy() (the WS analogue of the HTTP 503/no-route response,
  // since an upgrade has no clean handshake-level error reply).
  /**
   * Proxy an inbound WebSocket upgrade to a remote-workspace target.
   * Resolves the workspace route (env → session → ?workspace= → adapter target);
   * only remote, currently-syncing workspaces are proxied. On any non-match it
   * destroys the socket (no clean handshake error is possible mid-upgrade).
   * Otherwise it completes the inbound handshake and bridges to the remote.
   * @param {Object} req - The incoming upgrade request.
   * @param {Object} socket - The raw client socket.
   * @param {Buffer} head - The first packet of the upgraded stream.
   * @param {URL} url - The parsed request URL.
   * @returns {Promise<void>} Resolves once the upgrade is handled or rejected.
   */
  const handleRemoteUpgrade = async (req, socket, head, url) => {
    const envWorkspaceID = Flag.CLOSEDCODE_WORKSPACE_ID
      ? WorkspaceID.make(Flag.CLOSEDCODE_WORKSPACE_ID)
      : undefined;
    // Shared resolution: env → session-owned → ?workspace= → Workspace.get →
    // adapter target. Identical selection logic as the HTTP middleware.
    const route = await resolveWorkspaceRoute(url, req.method ?? "GET", envWorkspaceID);
    if (route.kind !== "remote") {
      socket.destroy();
      return;
    }
    // Mirror proxyRemote's isSyncing → 503 guard. No clean handshake response is
    // possible mid-upgrade, so a broken sync connection destroys the socket.
    const syncing = await AppRuntime.runPromise(
      Workspace.Service.use((svc) => svc.isSyncing(route.workspace.id)),
    );
    if (!syncing) {
      socket.destroy();
      return;
    }
    const proxyURL = workspaceProxyURL(route.target.url, url);
    const wsURL = ProxyUtil.websocketTargetURL(proxyURL);
    const protocols = ProxyUtil.websocketProtocols(req.headers);
    // Sanitized + target-auth headers for the outbound handshake. Computed here
    // (with access to req.headers) and handed to the bridge.
    const headers = ProxyUtil.headers(req.headers, route.target.headers);
    // Complete the inbound handshake first so we hold the client socket, then
    // dial the remote and bridge.
    wss.handleUpgrade(req, socket, head, (inbound) => {
      bridgeRemote(inbound, wsURL, protocols, headers);
    });
  };

  /**
   * Attach the HTTP `upgrade` listener to a server. Local registered routes
   * (e.g. the pty route) take priority and are upgraded via `wss`; otherwise
   * the upgrade is attempted as a remote-workspace proxy, destroying the socket
   * on any failure.
   * @param {Object} server - The http.Server to attach the listener to.
   * @returns {void}
   */
  const injectWebSocket = (server) => {
    server.on("upgrade", (req, socket, head) => {
      const url = new URL(req.url, "http://localhost");
      const factory = routes.get(url.pathname);
      if (factory) {
        // Local pty route — registered in `routes`, keeps priority. Unchanged.
        wss.handleUpgrade(req, socket, head, async (ws) => {
          const handlers = await factory({ req });
          ws.on("message", (data) => handlers?.onMessage?.({ data: data.toString() }, ws));
          ws.on("close", () => handlers?.onClose?.(ws));
          ws.on("error", (err) => handlers?.onError?.(err, ws));
          handlers?.onOpen?.(ws);
        });
        return;
      }
      // No local route: attempt remote-workspace WS proxying. Any failure (no
      // remote workspace, not syncing, resolution error) destroys the socket.
      handleRemoteUpgrade(req, socket, head, url).catch(() => {
        try {
          socket.destroy();
        } catch {
          /* socket already gone */
        }
      });
    });
  };

  return { upgradeWebSocket, injectWebSocket };
}

// Bidirectional WebSocket bridge between an already-upgraded inbound `ws`
// connection and a freshly-dialed outbound `ws` client. Mirrors
// HttpApiProxy.websocket: inbound messages are buffered until the outbound
// socket opens, messages are forwarded raw in both directions, and close/error
// codes propagate across (1011 on error). Invalid close codes (e.g. 1005/1006
// surfaced by ws) are guarded so close() can't throw.
/**
 * Bridge an already-upgraded inbound WebSocket to a freshly-dialed outbound
 * one. Inbound messages are queued until the outbound socket opens, then
 * forwarded raw in both directions; close/error codes propagate across (1011
 * on error), with invalid close codes guarded so close() can't throw.
 * @param {Object} inbound - The upgraded inbound `ws` connection.
 * @param {string} wsURL - The remote WebSocket target URL.
 * @param {Array<string>} protocols - WebSocket subprotocols to request (empty = none).
 * @param {Object} headers - Outbound handshake headers (sanitized + target auth).
 * @returns {void}
 */
function bridgeRemote(inbound, wsURL, protocols, headers) {
  const outbound = new WebSocket(wsURL, protocols.length ? protocols : undefined, {
    headers: Object.fromEntries(headers.entries()),
  });

  const queue = []; // inbound messages awaiting the outbound open
  let outboundOpen = false;

  /**
   * Close a socket with the given code/reason, falling back to a plain close()
   * if the code is invalid (e.g. 1005/1006), so close() never throws.
   * @param {Object} sock - The WebSocket to close.
   * @param {number} code - The close code.
   * @param {string} reason - The close reason.
   * @returns {void}
   */
  const safeClose = (sock, code, reason) => {
    try {
      sock.close(code, reason);
    } catch {
      try {
        sock.close();
      } catch {
        /* already closing/closed */
      }
    }
  };

  outbound.on("open", () => {
    outboundOpen = true;
    for (const message of queue) outbound.send(message);
    queue.length = 0;
  });

  // inbound -> outbound
  inbound.on("message", (data, isBinary) => {
    const payload = isBinary ? data : data.toString();
    if (outboundOpen) outbound.send(payload);
    else queue.push(payload);
  });
  inbound.on("close", (code, reason) => safeClose(outbound, code, reason));
  inbound.on("error", () => safeClose(outbound, 1011, "proxy error"));

  // outbound -> inbound
  outbound.on("message", (data, isBinary) => {
    try {
      inbound.send(isBinary ? data : data.toString());
    } catch {
      /* inbound gone */
    }
  });
  outbound.on("close", (code, reason) => safeClose(inbound, code, reason));
  outbound.on("error", () => safeClose(inbound, 1011, "proxy error"));
}

// Wrap an Express app with fetch() and request() methods for in-process use.
// Do not mutate expressApp.request; Express uses that property as the request
// prototype internally.
/**
 * Wrap an Express app with `fetch`/`request` methods that drive it over an
 * in-process loopback HTTP server. The lazily-started server has per-request
 * timeouts disabled so long agent loops (run inside a single request) are not
 * capped at 5 minutes. Does not mutate `expressApp.request`.
 * @param {Object} expressApp - The Express application to wrap.
 * @returns {Object} An object exposing `fetch(input, init)` and `request(input, init)`.
 */
function createInProcessFetch(expressApp) {
  let _ready;

  /**
   * Lazily start (once) the loopback HTTP server bound to 127.0.0.1.
   * @returns {Promise<string>} Resolves to the server's base URL.
   */
  function ensureServer() {
    if (_ready) return _ready;
    _ready = new Promise((resolve, reject) => {
      const server = http.createServer(expressApp);
      // `closedcode run` drives the ENTIRE multi-turn agent loop inside a single
      // POST /session/:id/message request to this in-process server. Node's default
      // `requestTimeout` (300000 ms) would abort that request — and thus the whole
      // run — at 5 minutes regardless of progress. Disable the per-request timeouts
      // so long agentic sessions are not capped. (Explicit cancellation is preserved
      // separately by forwarding the caller's abort signal in `fetch` below.)
      server.requestTimeout = 0;
      server.headersTimeout = 0;
      server.listen(0, "127.0.0.1", () => {
        const { port } = server.address();
        resolve(`http://127.0.0.1:${port}`);
      });
      server.once("error", reject);
    });
    return _ready;
  }

  const publicApp = {
    /**
     * Dispatch a request to the in-process server, forwarding method, headers,
     * body, and the caller's abort signal (so explicit cancellation still
     * propagates) via the no-timeout undici dispatcher.
     * @param {string|Request} input - A URL string or a Request object.
     * @param {Object} init - Optional fetch init (used when `input` is a string).
     * @returns {Promise<Response>} The fetch Response from the loopback server.
     */
    fetch: async function fetch(input, init) {
    const base = await ensureServer();
    const req = input instanceof Request ? input : new Request(input, init);
    const url = new URL(req.url);
    const target = `${base}${url.pathname}${url.search}`;
    // Forward the caller's abort signal so explicit cancellation still propagates
    // to the loopback request (disabling the timeouts only removes the fixed
    // 5-minute deadline, not deliberate cancellation). The no-timeout dispatcher
    // stops undici from aborting the long-lived agent-loop request at 300 s.
    const fwdInit = { method: req.method, headers: req.headers, signal: req.signal, dispatcher: IN_PROCESS_DISPATCHER };
    if (req.body) {
      fwdInit.body = Buffer.from(await req.arrayBuffer());
    }
    return globalThis.fetch(target, fwdInit);
    },
    /**
     * Like `fetch`, but resolves relative URL strings against
     * http://localhost first.
     * @param {string|Request} input - A URL string (possibly relative) or a Request.
     * @param {Object} init - Optional fetch init.
     * @returns {Promise<Response>} The fetch Response from the loopback server.
     */
    request(input, init) {
      if (typeof input === "string" && !input.startsWith("http")) {
        input = new URL(input, "http://localhost").toString();
      }
      return publicApp.fetch(input, init);
    },
  };

  return publicApp;
}

/**
 * The Express runtime adapter implementation.
 * @type {Object}
 */
export const adapter = {
  /**
   * Build the runtime bindings for an Express app: a WebSocket upgrade helper
   * and a `listen` function that starts the server with WS injection wired in.
   * @param {Object} app - The Express application.
   * @returns {Object} An object with `upgradeWebSocket` and `listen(opts)`.
   */
  create(app) {
    const ws = createWebSocket();
    return {
      upgradeWebSocket: ws.upgradeWebSocket,
      listen: (opts) => listen(app, opts, ws.injectWebSocket),
    };
  },
  // Add fetch/request methods to the Express app for in-process use.
  addFetch: createInProcessFetch,
};
