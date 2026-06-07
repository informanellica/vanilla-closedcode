import { createOpencodeClient } from "sdk/v2/client";
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
  return createOpencodeClient({
    ...config,
    headers: {
      ...(config.headers instanceof Headers ? Object.fromEntries(config.headers.entries()) : config.headers),
      ...auth
    },
    baseUrl: server.url
  });
}