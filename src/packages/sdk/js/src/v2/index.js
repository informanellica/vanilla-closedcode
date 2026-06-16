/**
 * @file v2 SDK entry point. Re-exports the v2 client/server factories and the
 * `data` helpers, and provides {@link createOpencode} to boot a server and return
 * a client already connected to it.
 * @module sdk/v2
 */

export * from "./client.js";
export * from "./server.js";
import { createClosedcodeClient } from "./client.js";
import { createOpencodeServer } from "./server.js";
export * as data from "./data.js";

/**
 * Start a closedcode server and return a v2 client connected to it.
 * @param {Object} [options] - Server options forwarded to {@link module:sdk/v2/server.createOpencodeServer} (hostname, port, timeout, config, signal).
 * @returns {Promise<{client: OpencodeClient, server: {url: string, close: Function}}>} The connected client and the running server handle.
 */
export async function createOpencode(options) {
  const server = await createOpencodeServer({
    ...options
  });
  const client = createClosedcodeClient({
    baseUrl: server.url
  });
  return {
    client,
    server
  };
}