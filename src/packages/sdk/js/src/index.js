/**
 * @file Top-level SDK entry point. Re-exports the client and server factories and
 * provides {@link createOpencode}, a convenience helper that boots a server and
 * returns a client already pointed at it.
 * @module sdk
 */

export * from "./client.js";
export * from "./server.js";
import { createClosedcodeClient } from "./client.js";
import { createOpencodeServer } from "./server.js";

/**
 * Start a closedcode server and return a client connected to it.
 * @param {Object} [options] - Server options forwarded to {@link createOpencodeServer} (hostname, port, timeout, config, signal).
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