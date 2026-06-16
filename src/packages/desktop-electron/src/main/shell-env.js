/** @file Loads the user's login/interactive shell environment by probing the shell, so spawned processes inherit a realistic PATH and variables. */
import { spawnSync } from "node:child_process";
import { basename } from "node:path";
const TIMEOUT = 5_000;
/**
 * Determine the user's preferred shell from the SHELL environment variable.
 * @returns {string} The shell path from process.env.SHELL, or "/bin/sh" as a fallback.
 */
export function getUserShell() {
  return process.env.SHELL || "/bin/sh";
}
/**
 * Parse NUL-delimited `env -0` output into a plain key/value environment object.
 * @param {Buffer} out - The raw stdout buffer of `env -0`.
 * @returns {Object} A map of environment variable names to their string values.
 */
export function parseShellEnv(out) {
  const env = {};
  for (const line of out.toString("utf8").split("\0")) {
    if (!line) continue;
    const ix = line.indexOf("=");
    if (ix <= 0) continue;
    env[line.slice(0, ix)] = line.slice(ix + 1);
  }
  return env;
}
/**
 * Spawn the shell in the given mode and capture its environment via `env -0`.
 * @param {string} shell - The shell executable to invoke.
 * @param {string} mode - The shell flag combination (e.g. "-il" or "-l").
 * @returns {Object} A tagged result: {type:"Loaded", value} on success, or {type:"Timeout"} / {type:"Unavailable"} on failure.
 */
function probe(shell, mode) {
  const out = spawnSync(shell, [mode, "-c", "env -0"], {
    stdio: ["ignore", "pipe", "ignore"],
    timeout: TIMEOUT,
    windowsHide: true
  });
  const err = out.error;
  if (err) {
    if (err.code === "ETIMEDOUT") return {
      type: "Timeout"
    };
    console.log(`[server] Shell env probe failed for ${shell} ${mode}: ${err.message}`);
    return {
      type: "Unavailable"
    };
  }
  if (out.status !== 0) {
    console.log(`[server] Shell env probe exited with non-zero status for ${shell} ${mode}`);
    return {
      type: "Unavailable"
    };
  }
  const env = parseShellEnv(out.stdout);
  if (Object.keys(env).length === 0) {
    console.log(`[server] Shell env probe returned empty env for ${shell} ${mode}`);
    return {
      type: "Unavailable"
    };
  }
  return {
    type: "Loaded",
    value: env
  };
}
/**
 * Detect whether the given shell path refers to Nushell, whose env cannot be probed with `env -0`.
 * @param {string} shell - The shell path to inspect.
 * @returns {boolean} True if the shell is Nushell.
 */
export function isNushell(shell) {
  const name = basename(shell).toLowerCase();
  const raw = shell.toLowerCase();
  return name === "nu" || name === "nu.exe" || raw.endsWith("\\nu.exe");
}
/**
 * Load the shell's environment, preferring an interactive login probe and falling back to a plain login probe.
 * @param {string} shell - The shell to load the environment from.
 * @returns {Object} The parsed environment variable map, or null when probing is skipped, times out, or fails (caller falls back to the app env).
 */
export function loadShellEnv(shell) {
  if (isNushell(shell)) {
    console.log(`[server] Skipping shell env probe for nushell: ${shell}`);
    return null;
  }
  const interactive = probe(shell, "-il");
  if (interactive.type === "Loaded") {
    console.log(`[server] Loaded shell environment with -il (${Object.keys(interactive.value).length} vars)`);
    return interactive.value;
  }
  if (interactive.type === "Timeout") {
    console.warn(`[server] Interactive shell env probe timed out: ${shell}`);
    return null;
  }
  const login = probe(shell, "-l");
  if (login.type === "Loaded") {
    console.log(`[server] Loaded shell environment with -l (${Object.keys(login.value).length} vars)`);
    return login.value;
  }
  console.warn(`[server] Falling back to app environment: ${shell}`);
  return null;
}
/**
 * Merge two environment maps, with the second taking precedence over the first.
 * @param {Object} shell - The base (shell) environment map.
 * @param {Object} env - The overriding environment map applied on top.
 * @returns {Object} A new merged environment object.
 */
export function mergeShellEnv(shell, env) {
  return {
    ...shell,
    ...env
  };
}