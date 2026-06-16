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
/**
 * Log the chosen server backend selection and pass the built server through.
 * @param {Object} selection - Backend selection descriptor from ServerBackend.select.
 * @param {*} built - The constructed server instance to return unchanged.
 * @returns {*} The same `built` value that was passed in.
 */
function withBackend(selection, built) {
  log.info("server backend selected", ServerBackend.attributes(selection));
  return built;
}
/**
 * Determine which server backend to use.
 * @returns {Object} The backend selection descriptor.
 */
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
/**
 * Build a fresh Express server with the auto-selected backend and given options.
 * @param {Object} opts - Server construction options forwarded to createExpress.
 * @returns {Object} The constructed server instance.
 */
function create(opts) {
  const selection = select();
  return withBackend(selection, createExpress(opts, selection));
}
/**
 * Build an Express server, forcing the explicit "express" backend selection.
 * @param {Object} opts - Server construction options forwarded to createExpress.
 * @returns {Object} The constructed server instance.
 */
export function Legacy(opts = {}) {
  const selection = { backend: "express", reason: "explicit" };
  const built = createExpress(opts, selection);
  return withBackend(selection, built);
}
/**
 * Return the OpenAPI description document for the Express backend.
 * @returns {Object} The OpenAPI specification object.
 */
export function openapi() {
  return expressOpenapi();
}
export let url;
/**
 * Build and start the server, listening on the configured hostname/port, and
 * optionally publishing an mDNS advertisement (skipped for loopback hosts).
 * Sets the module-level `url` to the resolved listen address.
 * @param {Object} opts - Listen options including hostname, port, mdns, and mdnsDomain.
 * @returns {Promise<Object>} A handle `{ hostname, port, url, stop }` where stop(close) shuts the server down (idempotent) and unpublishes mDNS.
 */
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
