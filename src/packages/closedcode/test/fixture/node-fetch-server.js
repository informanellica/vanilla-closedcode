// Lightweight Bun.serve replacement using node:http. Accepts a `fetch`-style
// handler `(Request) => Response | Promise<Response>` and exposes `url` and a
// `[Symbol.dispose]` so callers can use `using server = nodeFetchServer(...)`.
import {  createServer  } from "node:http"
import {  Readable  } from "node:stream"
import {  pipeline  } from "node:stream/promises"

async function buildRequest(req) {
  const proto = req.socket.encrypted ? "https" : "http";
  const host = req.headers.host || `127.0.0.1:${req.socket.localPort}`;
  const url = `${proto}://${host}${req.url}`;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v == null) continue;
    if (Array.isArray(v)) for (const x of v) headers.append(k, x);
    else headers.set(k, v);
  }
  const init = { method: req.method, headers };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = Readable.toWeb(req);
    init.duplex = "half";
  }
  return new Request(url, init);
}

export async function nodeFetchServer({ port = 0, fetch }) {
  const server = createServer(async (req, res) => {
    let response;
    try {
      const request = await buildRequest(req);
      response = await fetch(request);
    } catch (e) {
      res.statusCode = 500;
      res.end(String(e && e.message ? e.message : e));
      return;
    }
    res.statusCode = response.status;
    for (const [k, v] of response.headers) {
      if (k.toLowerCase() === "content-length") continue;
      res.setHeader(k, v);
    }
    if (response.body) {
      try { await pipeline(Readable.fromWeb(response.body), res); }
      catch { try { res.end(); } catch {} }
    } else {
      res.end();
    }
  });
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  const addr = server.address();
  const url = new URL(`http://127.0.0.1:${addr.port}/`);
  const stop = () => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
    server.closeIdleConnections?.()
    server.closeAllConnections?.()
  });
  return {
    url,
    port: addr.port,
    server,
    stop,
    [Symbol.dispose]() {
      server.close();
      server.closeIdleConnections?.();
      server.closeAllConnections?.();
    },
    [Symbol.asyncDispose]() { return stop(); },
  };
}
