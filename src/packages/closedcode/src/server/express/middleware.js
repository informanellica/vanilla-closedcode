// Server middleware: auth, logging, compression, CORS, instance resolution, and error handling.
import zlib from "node:zlib";
import { Readable } from "node:stream";
import corsLib from "cors";
import { Provider } from "@/provider/provider.js";
import { NamedError } from "core/util/error";
import { NotFoundError } from "@/storage/storage.js";
import { Session } from "@/session/session.js";
import * as Log from "core/util/log";
import { Flag } from "core/flag/flag";
import { isAllowedCorsOrigin } from "../cors.js";
import { WithInstance } from "@/project/with-instance.js";
import { WorkspaceContext } from "@/control-plane/workspace-context.js";
import { AppFileSystem } from "core/filesystem";
import { Workspace } from "@/control-plane/workspace.js";
import { AppRuntime } from "@/effect/app-runtime.js";
import { ProxyUtil } from "@/server/proxy-util.js";
import * as Fence from "@/server/fence.js";
import { resolveWorkspaceRoute, workspaceProxyURL } from "@/server/workspace.js";

const log = Log.create({ service: "server" });

// Error-handling middleware (4-arg signature).
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
function requestURL(req) {
  return new URL(req.originalUrl || req.url, "http://localhost");
}

// Resolve the directory from query/header for the plain (control-plane) path.
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
