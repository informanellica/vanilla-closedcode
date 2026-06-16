/** @file Server middleware: auth, logging, compression, CORS, instance resolution (with remote-workspace proxying), and error handling. */
// Server middleware: auth, logging, compression, CORS, instance resolution, and error handling.
import zlib from "node:zlib";
import { Readable } from "node:stream";
import corsLib from "cors";
import { Provider } from "#provider/provider.js";
import { NamedError } from "core/util/error";
import { NotFoundError } from "#storage/storage.js";
import { Session } from "#session/session.js";
import * as Log from "core/util/log";
import { Flag } from "core/flag/flag";
import { isAllowedCorsOrigin } from "../cors.js";
import { WithInstance } from "#project/with-instance.js";
import { WorkspaceContext } from "#control-plane/workspace-context.js";
import { AppFileSystem } from "core/filesystem";
import { Workspace } from "#control-plane/workspace.js";
import { AppRuntime } from "#effect/app-runtime.js";
import { ProxyUtil } from "#server/proxy-util.js";
import * as Fence from "#server/fence.js";
import { resolveWorkspaceRoute, workspaceProxyURL } from "#server/workspace.js";

const log = Log.create({ service: "server" });

// Error-handling middleware (4-arg signature).
/**
 * Express error handler. Maps known error types to HTTP status codes (NotFound -> 404,
 * model/auth/worktree validation -> 400, else 500) and serializes them as JSON.
 * @param {*} err - The error thrown/forwarded by an upstream handler.
 * @param {Object} req - The Express request.
 * @param {Object} res - The Express response.
 * @param {Function} _next - The next callback (unused; present for the 4-arg error signature).
 * @returns {Object} The Express response after sending the JSON error body.
 */
export const ErrorMiddleware = (err, req, res, _next) => {
  log.error("failed", { error: err });
  if (err instanceof NamedError) {
    let status;
    if (err instanceof NotFoundError) status = 404;
    else if (err instanceof Provider.ModelNotFoundError) status = 400;
    else if (err.name === "ProviderAuthValidationFailed") status = 400;
    else if (err.name.startsWith("Worktree")) status = 400;
    else status = 500;
    return res.status(status).json(err.toObject());
  }
  if (err instanceof Session.BusyError) {
    return res.status(400).json(new NamedError.Unknown({ message: err.message }).toObject());
  }
  const message = err instanceof Error && err.stack ? err.stack : String(err);
  return res.status(500).json(new NamedError.Unknown({ message }).toObject());
};

// Optional HTTP Basic auth, gated on CLOSEDCODE_SERVER_PASSWORD.
/**
 * HTTP Basic auth middleware, active only when CLOSEDCODE_SERVER_PASSWORD is set.
 * Accepts credentials via the Authorization header or an auth_token query param;
 * responds 401 when they do not match the configured username/password.
 * @param {Object} req - The Express request.
 * @param {Object} res - The Express response.
 * @param {Function} next - Passes control to the next middleware on success.
 * @returns {*} The result of next(), or the 401 response when auth fails.
 */
export const AuthMiddleware = (req, res, next) => {
  if (req.method === "OPTIONS") return next();
  const password = Flag.CLOSEDCODE_SERVER_PASSWORD;
  if (!password) return next();
  const username = Flag.CLOSEDCODE_SERVER_USERNAME ?? "closedcode";
  const token = req.query?.auth_token;
  let header = req.headers["authorization"];
  if (token) header = `Basic ${token}`;
  const ok = header && header.startsWith("Basic ")
    && (() => {
      const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
      const i = decoded.indexOf(":");
      return decoded.slice(0, i) === username && decoded.slice(i + 1) === password;
    })();
  if (!ok) {
    res.set("WWW-Authenticate", 'Basic realm="closedcode"');
    return res.status(401).send("Unauthorized");
  }
  next();
};

/**
 * Build request-logging middleware that logs each request (skipping /log) and
 * times it until the response finishes or closes.
 * @param {Object} backendAttributes - Backend attributes merged into every log entry.
 * @returns {Function} An Express middleware (req, res, next).
 */
export function LoggerMiddleware(backendAttributes) {
  return (req, res, next) => {
    if (req.path === "/log") return next();
    const attributes = { method: req.method, path: req.path, ...backendAttributes };
    log.info("request", attributes);
    const timer = log.time("request", attributes);
    res.once("finish", () => timer.stop());
    res.once("close", () => timer.stop());
    next();
  };
}

/**
 * Build CORS middleware whose origin callback delegates to isAllowedCorsOrigin(opts).
 * @param {Object} opts - Options forwarded to the origin check (opts.cors allow-list).
 * @returns {Function} The configured cors() Express middleware.
 */
export function CorsMiddleware(opts) {
  return corsLib({
    maxAge: 86_400,
    origin(origin, cb) {
      if (isAllowedCorsOrigin(origin, opts)) cb(null, origin ?? true);
      else cb(null, false);
    },
  });
}

// Build the absolute request URL used for workspace routing decisions.
/**
 * Build an absolute URL for a request, used for workspace routing decisions.
 * @param {Object} req - The Express request (uses originalUrl/url).
 * @returns {URL} The request URL resolved against http://localhost.
 */
function requestURL(req) {
  return new URL(req.originalUrl || req.url, "http://localhost");
}

// Resolve the directory from query/header for the plain (control-plane) path.
/**
 * Resolve the project directory for the plain (non-workspace) path from the
 * request's directory query param or x-closedcode/x-opencode-directory header,
 * falling back to the current working directory.
 * @param {Object} req - The Express request (uses query.directory and directory headers).
 * @returns {string} The resolved absolute directory path.
 */
function defaultDirectory(req) {
  const raw = req.query?.directory || req.headers["x-closedcode-directory"] || req.headers["x-opencode-directory"] || process.cwd();
  return AppFileSystem.resolve((() => {
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  })());
}

// Proxy a remote-workspace request upstream, mirroring proxyRemote/HttpApiProxy.http.
/**
 * Proxy a request to a remote workspace's upstream target. Verifies the workspace
 * is syncing (else 503), forwards method/headers/body faithfully, strips hop-by-hop
 * headers, honors the sync fence (waiting for local catch-up), and streams the
 * upstream body back to the client.
 * @param {Object} req - The incoming Express request.
 * @param {Object} res - The Express response to write the proxied result to.
 * @param {{id: string}} workspace - The target workspace.
 * @param {{url: string, headers: Object}} target - The upstream target's base URL and headers.
 * @param {URL} url - The original request URL used to derive the upstream path.
 * @returns {Promise<void>} Resolves once the upstream response has been streamed or the request errored.
 */
async function proxyRemote(req, res, workspace, target, url) {
  const syncing = await AppRuntime.runPromise(Workspace.Service.use(svc => svc.isSyncing(workspace.id)));
  if (!syncing) {
    res.status(503).type("text/plain; charset=utf-8").send(`broken sync connection for workspace: ${workspace.id}`);
    return;
  }
  const proxyURL = workspaceProxyURL(target.url, url);
  const headers = ProxyUtil.headers(req.headers, target.headers);

  // Faithful body forwarding (mirrors HttpApiProxy.http). express.json() only
  // drains the stream for application/json requests (setting req._body); for
  // those re-serialize the parsed object, otherwise stream the raw req through.
  const method = req.method;
  const hasBody = method !== "GET" && method !== "HEAD";
  // A body parser (express.json()) consumes the request stream up front. Detect
  // that via the body-parser `_body` flag OR the stream already being ended/
  // unreadable, and re-serialize the parsed `req.body`. Only when the raw stream
  // is still readable do we stream `req` straight through (faithful raw forward).
  const bodyConsumed = req._body === true || req.readableEnded === true || req.readable === false;
  let body;
  if (hasBody) {
    if (req.body !== undefined && req.body !== null && (bodyConsumed || typeof req.body === "string" || Buffer.isBuffer(req.body))) {
      body = typeof req.body === "string" || Buffer.isBuffer(req.body) ? req.body : JSON.stringify(req.body);
    } else if (headers.get("content-type")) {
      // Raw stream not consumed → stream it through.
      body = req;
    }
  }

  const upstream = await fetch(proxyURL, {
    method,
    headers,
    body,
    ...(body === req ? { duplex: "half" } : {}),
  });
  res.status(upstream.status);
  for (const [key, value] of upstream.headers.entries()) {
    const lower = key.toLowerCase();
    if (lower === "content-length" || lower === "content-encoding" || lower === "transfer-encoding") continue;
    res.setHeader(key, value);
  }
  res.removeHeader("Content-Length");

  // Sync fence wait (mirrors proxyRemote: Fence.parse(response.headers) →
  // Fence.waitEffect). Runs after the response is read but before streaming the
  // body downstream. Express exposes no per-request AbortSignal, so pass none.
  const sync = Fence.parse(upstream.headers);
  if (sync && Object.keys(sync).length > 0) {
    try {
      await AppRuntime.runPromise(Fence.waitEffect(workspace.id, sync, undefined));
    } catch (error) {
      if (!res.headersSent) res.status(503).type("text/plain; charset=utf-8").send(error?.message ?? String(error));
      return;
    }
  }

  // Stream the response body incrementally instead of buffering (lets SSE /event
  // endpoints flush as data arrives).
  if (upstream.body) {
    Readable.fromWeb(upstream.body).pipe(res);
    await new Promise((resolve, reject) => {
      res.once("finish", resolve);
      res.once("close", resolve);
      res.once("error", reject);
    });
  } else {
    res.end();
  }
}

// Run downstream handlers inside WorkspaceContext.provide → WithInstance.provide
// so that Effect services (Config, Session, etc.) see the resolved directory.
/**
 * Run downstream handlers inside WorkspaceContext.provide -> WithInstance.provide so
 * that Effect services resolve against the given workspace and directory. The wrapped
 * promise settles when the response finishes or errors.
 * @param {Object} req - The Express request.
 * @param {Object} res - The Express response.
 * @param {Function} next - Invokes the downstream handler chain.
 * @param {string} workspaceID - The workspace to provide as context.
 * @param {string} directory - The resolved project directory.
 * @returns {Promise<*>} The result of the provided Effect/promise.
 */
function provideLocal(req, res, next, workspaceID, directory) {
  return WorkspaceContext.provide({
    workspaceID,
    fn: () => WithInstance.provide({
      directory,
      fn: () => new Promise((resolve, reject) => {
        res.once("finish", resolve);
        res.once("error", reject);
        next();
      }),
    }),
  });
}

// Instance middleware. Mirrors the Effect parity `planRequest`: it computes the
// effective workspace, resolves its adapter target, swaps in a LOCAL target's
// directory, proxies REMOTE targets, and otherwise falls through to the plain
// directory-from-query/header path. Downstream handlers run inside
// WorkspaceContext.provide → WithInstance.provide so Effect services are available.
/**
 * Build the instance-resolution middleware. For each request it resolves the
 * effective workspace and adapter target, then: responds 500 for a missing
 * workspace, proxies remote targets, or runs downstream handlers locally with the
 * resolved (or default) directory.
 * @param {string} envWorkspaceID - Optional workspace ID from the environment/flag to bias resolution.
 * @returns {Function} An Express middleware (req, res, next).
 */
export function InstanceMiddleware(envWorkspaceID) {
  return (req, res, next) => {
    (async () => {
      const url = requestURL(req);
      const result = await resolveWorkspaceRoute(url, req.method, envWorkspaceID);
      switch (result.kind) {
        case "missing":
          res.status(500).type("text/plain; charset=utf-8").send(`Workspace not found: ${result.workspaceID}`);
          return;
        case "remote":
          return proxyRemote(req, res, result.workspace, result.target, url);
        case "local":
        default:
          // The resolved-local-adapter-target case supplies `directory`; the
          // env/no-workspace/control-plane cases fall back to defaultDirectory.
          return provideLocal(req, res, next, result.workspaceID, result.directory ?? defaultDirectory(req));
      }
    })().catch(next);
  };
}

// gzip compression that skips SSE/streaming endpoints.
/**
 * gzip-compresses responses when the client accepts gzip, transparently wrapping
 * res.write/res.end through a gzip stream. Skips SSE/streaming endpoints (/event,
 * /global/event, and session message/prompt_async POSTs) so they can flush incrementally.
 * @param {Object} req - The Express request.
 * @param {Object} res - The Express response whose write/end are patched.
 * @param {Function} next - Passes control to the next middleware.
 * @returns {*} The result of next().
 */
export const CompressionMiddleware = (req, res, next) => {
  const path = req.path;
  const method = req.method;
  if (path === "/event" || path === "/global/event") return next();
  if (method === "POST" && /\/session\/[^/]+\/(message|prompt_async)$/.test(path)) return next();

  const accept = req.headers["accept-encoding"] || "";
  if (!/\bgzip\b/.test(accept)) return next();

  const gz = zlib.createGzip();
  const origWrite = res.write.bind(res);
  const origEnd = res.end.bind(res);
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    res.setHeader("Content-Encoding", "gzip");
    res.removeHeader("Content-Length");
    gz.on("data", (chunk) => origWrite(chunk));
    gz.on("end", () => origEnd());
  };
  res.write = (chunk, enc, cb) => {
    start();
    return gz.write(chunk, enc, cb);
  };
  res.end = (chunk, enc, cb) => {
    start();
    if (chunk) gz.end(chunk, enc, cb);
    else gz.end(cb);
    return res;
  };
  next();
};
