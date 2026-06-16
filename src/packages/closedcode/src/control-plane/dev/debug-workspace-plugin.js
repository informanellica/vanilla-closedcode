/** @file Dev-only workspace plugin that spins up a debug server and records its port/env for tooling. */
import { rename, writeFile } from "node:fs/promises";
import { randomInt } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
const DEV_DATA_FILE = "/tmp/closedcode-workspace-dev-data.json";
const DEV_DATA_TEMP_FILE = `${DEV_DATA_FILE}.tmp`;
/**
 * Poll the debug server's health endpoint until it responds OK or a 30s timeout elapses.
 * @param {number} port - The local port the debug server is expected to listen on.
 * @returns {Promise<void>} Resolves when the health check passes.
 * @throws {Error} If the health check does not pass within the timeout window.
 */
async function waitForHealth(port) {
  const url = `http://127.0.0.1:${port}/global/health`;
  const started = Date.now();
  while (Date.now() - started < 30_000) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {}
    await sleep(250);
  }
  throw new Error(`Timed out waiting for debug server health check at ${url}`);
}
let PORT;
/**
 * Atomically persist the debug server's connection details to the dev data file
 * (write to a temp file then rename) so external tooling can discover it.
 * @param {number} port - The port the debug server listens on.
 * @param {string} id - The workspace/config id associated with the server.
 * @param {Object} env - The environment record to record alongside the port and id.
 * @returns {Promise<void>} Resolves once the data file has been written and renamed.
 */
async function writeDebugData(port, id, env) {
  await writeFile(DEV_DATA_TEMP_FILE, JSON.stringify({
    port,
    id,
    env
  }, null, 2));
  await rename(DEV_DATA_TEMP_FILE, DEV_DATA_FILE);
}
/**
 * Workspace plugin (dev only) that registers a "debug" adapter. The adapter starts a
 * debug server on a random port, waits for it to become healthy, writes its connection
 * details for tooling, and exposes it as a remote target.
 * @param {Object} input - Plugin context.
 * @param {Object} input.experimental_workspace - Workspace registry used to register the adapter.
 * @returns {Promise<Object>} An empty plugin export object.
 */
export const DebugWorkspacePlugin = async ({
  experimental_workspace
}) => {
  experimental_workspace.register("debug", {
    name: "Debug",
    description: "Create a debugging server",
    configure(config) {
      return config;
    },
    async create(config, env) {
      const port = randomInt(5000, 9001);
      PORT = port;
      await writeDebugData(port, config.id, env);
      await waitForHealth(port);
    },
    async remove(_config) {},
    target(_config) {
      return {
        type: "remote",
        url: `http://localhost:${PORT}/`
      };
    }
  });
  return {};
};
export default DebugWorkspacePlugin;