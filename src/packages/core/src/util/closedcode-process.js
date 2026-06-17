/** @file Process identity helpers: derive/propagate a stable run id and process role via env vars, and build a sanitized child-process environment. */
/** Environment variable name carrying the shared run id across the process tree. */
export const CLOSEDCODE_RUN_ID = "CLOSEDCODE_RUN_ID";
/** Environment variable name carrying the role label of the current process. */
export const CLOSEDCODE_PROCESS_ROLE = "CLOSEDCODE_PROCESS_ROLE";
/**
 * Returns the run id, generating and storing a new UUID in the environment on first call.
 * @returns {string} The current process's run id (shared with child processes via env).
 */
export function ensureRunID() {
  return process.env[CLOSEDCODE_RUN_ID] ??= crypto.randomUUID();
}
/**
 * Returns the process role, storing the fallback in the environment when none is set yet.
 * @param {string} fallback - Role label to use and persist when no role is set.
 * @returns {string} The current process's role.
 */
export function ensureProcessRole(fallback) {
  return process.env[CLOSEDCODE_PROCESS_ROLE] ??= fallback;
}
/**
 * Returns both the run id and process role, initializing each in the environment if unset.
 * @param {string} fallback - Role label to use and persist when no role is set.
 * @returns {Object} An object with `runID` and `processRole`.
 */
export function ensureProcessMetadata(fallback) {
  return {
    runID: ensureRunID(),
    processRole: ensureProcessRole(fallback)
  };
}
/**
 * Builds a copy of process.env with undefined-valued entries dropped, then applies optional overrides.
 * @param {Object} overrides - Optional key/value pairs to merge over the cleaned environment.
 * @returns {Object} A plain object suitable for passing as a child process's `env`.
 */
export function sanitizedProcessEnv(overrides) {
  const env = Object.fromEntries(Object.entries(process.env).filter(entry => entry[1] !== undefined));
  return overrides ? Object.assign(env, overrides) : env;
}