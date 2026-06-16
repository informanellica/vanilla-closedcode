/** @file Builds a Closedcode SDK client for a given server, adding Basic auth headers. */
import { createClosedcodeClient } from "sdk/v2/client";
/**
 * Create an SDK client targeting a server, injecting Basic auth when a password is set.
 * @param {Object} args - Combined arguments; `server` is split out and the rest is forwarded as client config.
 * @param {Object} args.server - The server descriptor providing url and optional username/password.
 * @returns {Object} A configured Closedcode client bound to the server's base URL.
 */
export function createSdkForServer({
  server,
  ...config
}) {
  const auth = (() => {
    if (!server.password) return;
    return {
      Authorization: `Basic ${btoa(`${server.username ?? "closedcode"}:${server.password}`)}`
    };
  })();
  return createClosedcodeClient({
    ...config,
    headers: {
      ...(config.headers instanceof Headers ? Object.fromEntries(config.headers.entries()) : config.headers),
      ...auth
    },
    baseUrl: server.url
  });
}