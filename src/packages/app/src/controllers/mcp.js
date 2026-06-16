/** @file MCP controller (MVC): orchestrates the sync/sdk/global-sync Model and SDK for MCP-related Views, owning connect/disconnect logic and query invalidation. */
import { useMutation, useQueryClient } from "../lib/query/index.js";
import { useSDK } from "@/context/sdk.js";
import { useSync } from "@/context/sync.js";
import { loadMcpQuery } from "@/context/global-sync.js";

/**
 * MCP controller (MVC).
 *
 * Orchestrates the Model (@/context/sync.js, @/context/sdk.js,
 * @/context/global-sync.js) and the SDK for the MCP-related Views
 * (dialog-select-mcp, status-popover-body). Owns the connect/disconnect
 * business logic plus the loadMcpQuery invalidation so the Views only render.
 *
 * Must be invoked inside a component / hook reactive setup scope (it calls
 * context hooks and reactive primitives).
 *
 * Returns derived state accessors and action functions.
 *
 * @param {{ onError?: (err: unknown) => void }} [options]
 */
export const useMcpController = (options = {}) => {
  const sync = useSync();
  const sdk = useSDK();
  const queryClient = useQueryClient();

  // Derived Model state: the raw status entry / status string for a server.
  /**
   * The status string for an MCP server.
   * @param {string} name - The MCP server name.
   * @returns {string} The server's status (e.g. "connected"), or undefined.
   */
  const statusOf = name => sync.data?.mcp?.[name]?.status;
  /**
   * The raw status entry for an MCP server.
   * @param {string} name - The MCP server name.
   * @returns {Object} The server's status entry, or undefined.
   */
  const entryOf = name => sync.data?.mcp?.[name];
  /**
   * Whether an MCP server is currently connected.
   * @param {string} name - The MCP server name.
   * @returns {boolean} True when the server status is "connected".
   */
  const isConnected = name => statusOf(name) === "connected";

  // SDK orchestration: toggle a single server's connection keyed off its
  // current Model status, then invalidate the MCP query so the Model refetches.
  const mutation = useMutation(() => ({
    mutationFn: async name => {
      if (isConnected(name)) await sdk.client.mcp.disconnect({ name });
      else await sdk.client.mcp.connect({ name });
    },
    onSuccess: () =>
      queryClient.refetchQueries({
        queryKey: loadMcpQuery(sync.directory).queryKey,
      }),
    onError: err => {
      options.onError?.(err);
    },
  }));

  // Action: toggle connect/disconnect for a server by name. No-op while a
  // mutation is already in flight (preserves prior View guard behaviour).
  /**
   * Toggle connect/disconnect for an MCP server by name. No-op while a mutation
   * is already in flight.
   * @param {string} name - The MCP server name to toggle.
   */
  const toggle = name => {
    if (mutation.isPending) return;
    mutation.mutate(name);
  };

  return {
    // Derived state accessors
    statusOf,
    entryOf,
    isConnected,
    get isPending() {
      return mutation.isPending;
    },
    get pendingName() {
      return mutation.variables;
    },
    // Actions
    toggle,
  };
};
