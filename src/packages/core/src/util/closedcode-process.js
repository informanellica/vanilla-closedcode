export const CLOSEDCODE_RUN_ID = "CLOSEDCODE_RUN_ID";
export const CLOSEDCODE_PROCESS_ROLE = "CLOSEDCODE_PROCESS_ROLE";
export function ensureRunID() {
  return process.env[CLOSEDCODE_RUN_ID] ??= crypto.randomUUID();
}
export function ensureProcessRole(fallback) {
  return process.env[CLOSEDCODE_PROCESS_ROLE] ??= fallback;
}
export function ensureProcessMetadata(fallback) {
  return {
    runID: ensureRunID(),
    processRole: ensureProcessRole(fallback)
  };
}
export function sanitizedProcessEnv(overrides) {
  const env = Object.fromEntries(Object.entries(process.env).filter(entry => entry[1] !== undefined));
  return overrides ? Object.assign(env, overrides) : env;
}