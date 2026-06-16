/** @file Helper for launching an LSP language-server subprocess with piped stdio. */
import { Process } from "#util/process.js";
/**
 * Spawn an LSP server process with stdin/stdout/stderr piped.
 * Accepts either (cmd, args, opts) or (cmd, opts) — args is optional.
 * @param {string} cmd - The executable to run.
 * @param {Array|Object} argsOrOpts - Either an array of CLI arguments, or the spawn options object when no args are given.
 * @param {Object} opts - Spawn options (cwd, env, etc.) when the second argument is an args array.
 * @returns {Object} The spawned process handle (with piped stdin/stdout/stderr).
 */
export function spawn(cmd, argsOrOpts, opts) {
  const args = Array.isArray(argsOrOpts) ? [...argsOrOpts] : [];
  const cfg = Array.isArray(argsOrOpts) ? opts : argsOrOpts;
  const proc = Process.spawn([cmd, ...args], {
    ...cfg,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe"
  });
  if (!proc.stdin || !proc.stdout || !proc.stderr) throw new Error("Process output not available");
  return proc;
}