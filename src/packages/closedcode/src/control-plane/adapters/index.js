/** @file Registry of workspace adapters: resolves built-in and per-project custom adapters by type. */
import { WorktreeAdapter } from "./worktree.js";
const BUILTIN = {
  worktree: WorktreeAdapter
};
const state = new Map();
/**
 * Resolve a workspace adapter for a project, preferring a project-scoped custom adapter
 * over a built-in one of the same type.
 * @param {string} projectID - The project the adapter is scoped to.
 * @param {string} type - The adapter type key (e.g. "worktree").
 * @returns {Object} The matching adapter object.
 * @throws {Error} If no custom or built-in adapter matches the given type.
 */
export function getAdapter(projectID, type) {
  const custom = state.get(projectID)?.get(type);
  if (custom) return custom;
  const builtin = BUILTIN[type];
  if (builtin) return builtin;
  throw new Error(`Unknown workspace adapter: ${type}`);
}
/**
 * List all adapters available to a project: every built-in adapter plus any
 * custom adapters registered for that project.
 * @param {string} projectID - The project whose adapters should be listed.
 * @returns {Promise<Array>} Array of `{type, name, description}` entries.
 */
export async function listAdapters(projectID) {
  const builtin = await Promise.all(Object.entries(BUILTIN).map(async ([type, adapter]) => {
    return {
      type,
      name: adapter.name,
      description: adapter.description
    };
  }));
  const custom = [...(state.get(projectID)?.entries() ?? [])].map(([type, adapter]) => ({
    type,
    name: adapter.name,
    description: adapter.description
  }));
  return [...builtin, ...custom];
}

// Plugins can be loaded per-project so we need to scope them. If you
// want to install a global one pass `ProjectID.global`
/**
 * Register a custom workspace adapter for a project, scoping it to that project.
 * Pass `ProjectID.global` to make the adapter available globally.
 * @param {string} projectID - The project to scope the adapter to.
 * @param {string} type - The adapter type key to register under.
 * @param {Object} adapter - The adapter object (with name, description and lifecycle methods).
 * @returns {void}
 */
export function registerAdapter(projectID, type, adapter) {
  const adapters = state.get(projectID) ?? new Map();
  adapters.set(type, adapter);
  state.set(projectID, adapters);
}