/** @file Shared global-sync utilities: a stable comparator plus normalizers for agent lists, provider lists, and project records. */
export { pathKey as directoryKey } from "@/utils/path-key.js";
/**
 * Three-way comparator usable with Array#sort for any orderable values.
 * @param {*} a - First value.
 * @param {*} b - Second value.
 * @returns {number} -1 when a < b, 1 when a > b, 0 when equal.
 */
export const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;
/**
 * Type guard for an agent-like record: an object with a string `name` and a recognised `mode`.
 * @param {*} input - Candidate value.
 * @returns {boolean} True when the value looks like an agent definition.
 */
function isAgent(input) {
  if (!input || typeof input !== "object") return false;
  const item = input;
  if (typeof item.name !== "string") return false;
  return item.mode === "subagent" || item.mode === "primary" || item.mode === "all";
}
/**
 * Coerce assorted agent inputs (array, single agent, or keyed object) into a flat array of valid agents.
 * @param {*} input - Array of candidates, a single agent, or an object whose values are candidates.
 * @returns {Array} Array containing only entries that pass the agent type guard.
 */
export function normalizeAgentList(input) {
  if (Array.isArray(input)) return input.filter(isAgent);
  if (isAgent(input)) return [input];
  if (!input || typeof input !== "object") return [];
  return Object.values(input).filter(isAgent);
}
/**
 * Return a copy of a provider list with each provider's deprecated models filtered out.
 * @param {Object} input - Provider list with an `all` array; each provider has a `models` record keyed by id.
 * @returns {Object} A new provider list with deprecated models removed from every provider.
 */
export function normalizeProviderList(input) {
  return {
    ...input,
    all: input.all.map(provider => ({
      ...provider,
      models: Object.fromEntries(Object.entries(provider.models).filter(([, info]) => info.status !== "deprecated"))
    }))
  };
}
/**
 * Strip a project's stored icon url/override so they are not persisted, leaving other icon fields intact.
 * Returns the project unchanged when it has no icon url or override.
 * @param {Object} project - Project record, optionally carrying an `icon` with `url`/`override`.
 * @returns {Object} The original project, or a copy with `icon.url` and `icon.override` cleared.
 */
export function sanitizeProject(project) {
  if (!project.icon?.url && !project.icon?.override) return project;
  return {
    ...project,
    icon: {
      ...project.icon,
      url: undefined,
      override: undefined
    }
  };
}