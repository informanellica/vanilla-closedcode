/**
 * @file HTTP server assembly. Wires the Express backend, request adapter, OpenAPI
 * description and mDNS advertisement together into the closedcode server that the
 * SDK and TUI connect to.
 * @module closedcode/server
 */

import { lazy } from "#util/lazy.js";
import * as Log from "core/util/log";
import { MDNS } from "./mdns.js";
import { initProjectors } from "./projectors.js";
import * as ServerBackend from "./backend.js";
import { createExpress, openapi as expressOpenapi } from "./express/app.js";
import { adapter } from "./adapter.express.js";
// This global prevents ai-sdk from logging warnings to stdout.
globalThis.AI_SDK_LOG_WARNINGS = false;
initProjectors();
const log = Log.create({
  service: "server"
});
function withBackend(selection, built) {
  log.info("server backend selected", ServerBackend.attributes(selection));
  return built;
}
function select() {
  return ServerBackend.select();
}
export const backend = select;
const DefaultExpress = lazy(() => {
  const selection = select();
  const built = createExpress({}, selection);
  return withBackend(selection, built);
});
export const Default = () => DefaultExpress();
function create(opts) {
  const selection = select();
  return withBackend(selection, createExpress(opts, selection));
}
export function Legacy(opts = {}) {
  const selection = { backend: "express", reason: "explicit" };
  const built = createExpress(opts, selection);
  return withBackend(selection, built);
}
export function openapi() {
  return expressOpenapi();
}
export let url;
export async function listen(opts) {
  const built = create(opts);
  const server = await built.runtime.listen(opts);
  const next = new URL("http://localhost");
  next.hostname = opts.hostname;
  next.port = String(server.port);
  url = next;
  const mdns = opts.mdns && server.port && opts.hostname !== "127.0.0.1" && opts.hostname !== "localhost" && opts.hostname !== "::1";
  if (mdns) {
    MDNS.publish(server.port, opts.mdnsDomain);
  } else if (opts.mdns) {
    log.warn("mDNS enabled but hostname is loopback; skipping mDNS publish");
  }
  let closing;
  return {
    hostname: opts.hostname,
    port: server.port,
    url: next,
    stop(close) {
      closing ??= (async () => {
        if (mdns) MDNS.unpublish();
        await server.stop(close);
      })();
      return closing;
    }
  };
}
export * as Server from "./server.js";
