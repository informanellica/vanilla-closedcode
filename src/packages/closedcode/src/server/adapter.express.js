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
import { WorkspaceID } from "@/control-plane/schema.js";
import { Workspace } from "@/control-plane/workspace.js";
import { AppRuntime } from "@/effect/app-runtime.js";
import { ProxyUtil } from "@/server/proxy-util.js";
import { resolveWorkspaceRoute, workspaceProxyURL } from "@/server/workspace.js";

async function listen(app, opts, inject) {
  const start = (port) =>
    new Promise((resolve, reject) => {
      const server = http.createServer(app);
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
function createWebSocket() {
  const wss = new WebSocketServer({ noServer: true });
  const routes = new Map(); // path -> handlerFactory

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
function bridgeRemote(inbound, wsURL, protocols, headers) {
  const outbound = new WebSocket(wsURL, protocols.length ? protocols : undefined, {
    headers: Object.fromEntries(headers.entries()),
  });

  const queue = []; // inbound messages awaiting the outbound open
  let outboundOpen = false;

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
function createInProcessFetch(expressApp) {
  let _ready;

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
    request(input, init) {
      if (typeof input === "string" && !input.startsWith("http")) {
        input = new URL(input, "http://localhost").toString();
      }
      return publicApp.fetch(input, init);
    },
  };

  return publicApp;
}

export const adapter = {
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
