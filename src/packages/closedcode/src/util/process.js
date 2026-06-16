/** @file Child-process helpers: spawn, run-to-completion, abort/timeout handling, and cross-platform termination. */

import launch from "cross-spawn";
import { buffer } from "node:stream/consumers";
import { errorMessage } from "./error.js";
/**
 * Error thrown when a command exits with a non-zero code (unless `nothrow` is set).
 * Carries the command, exit code, and captured stdout/stderr buffers.
 */
export class RunFailedError extends Error {
  /**
   * @param {Array<string>} cmd - The command and its arguments.
   * @param {number} code - The non-zero exit code.
   * @param {Buffer} stdout - The captured standard output.
   * @param {Buffer} stderr - The captured standard error.
   */
  constructor(cmd, code, stdout, stderr) {
    const text = stderr.toString().trim();
    super(text ? `Command failed with code ${code}: ${cmd.join(" ")}\n${text}` : `Command failed with code ${code}: ${cmd.join(" ")}`);
    this.name = "ProcessRunFailedError";
    this.cmd = [...cmd];
    this.code = code;
    this.stdout = stdout;
    this.stderr = stderr;
  }
}
/**
 * Spawn a child process via cross-spawn, wiring up optional abort-signal handling and a
 * kill-then-SIGKILL timeout. Attaches an `exited` promise resolving to the exit code.
 * @param {Array<string>} cmd - The command and its arguments; the first element is the executable.
 * @param {Object} [opts] - Spawn options.
 * @param {string} [opts.cwd] - Working directory for the child process.
 * @param {boolean|string} [opts.shell] - Whether (or which shell) to run the command in.
 * @param {Object} [opts.env] - Extra environment variables merged over `process.env`; `null` clears the env, `undefined` inherits.
 * @param {*} [opts.stdin] - stdio config for stdin (defaults to "ignore").
 * @param {*} [opts.stdout] - stdio config for stdout (defaults to "ignore").
 * @param {*} [opts.stderr] - stdio config for stderr (defaults to "ignore").
 * @param {AbortSignal} [opts.abort] - Signal that, when aborted, terminates the process.
 * @param {string} [opts.kill] - Signal sent on abort (defaults to "SIGTERM").
 * @param {number} [opts.timeout] - Milliseconds after the kill signal before escalating to SIGKILL (default 5000; <=0 disables).
 * @returns {Object} The spawned child process augmented with an `exited` Promise<number>.
 */
export function spawn(cmd, opts = {}) {
  if (cmd.length === 0) throw new Error("Command is required");
  opts.abort?.throwIfAborted();
  const proc = launch(cmd[0], cmd.slice(1), {
    cwd: opts.cwd,
    shell: opts.shell,
    env: opts.env === null ? {} : opts.env ? {
      ...process.env,
      ...opts.env
    } : undefined,
    stdio: [opts.stdin ?? "ignore", opts.stdout ?? "ignore", opts.stderr ?? "ignore"],
    windowsHide: process.platform === "win32"
  });
  let closed = false;
  let timer;
  const abort = () => {
    if (closed) return;
    if (proc.exitCode !== null || proc.signalCode !== null) return;
    closed = true;
    proc.kill(opts.kill ?? "SIGTERM");
    const ms = opts.timeout ?? 5_000;
    if (ms <= 0) return;
    timer = setTimeout(() => proc.kill("SIGKILL"), ms);
  };
  const exited = new Promise((resolve, reject) => {
    const done = () => {
      opts.abort?.removeEventListener("abort", abort);
      if (timer) clearTimeout(timer);
    };
    proc.once("exit", (code, signal) => {
      done();
      resolve(code ?? (signal ? 1 : 0));
    });
    proc.once("error", error => {
      done();
      reject(error);
    });
  });
  void exited.catch(() => undefined);
  if (opts.abort) {
    opts.abort.addEventListener("abort", abort, {
      once: true
    });
    if (opts.abort.aborted) abort();
  }
  const child = proc;
  child.exited = exited;
  return child;
}
/**
 * Run a command to completion, capturing its stdout and stderr.
 * Throws {@link RunFailedError} on a non-zero exit unless `opts.nothrow` is set.
 * @param {Array<string>} cmd - The command and its arguments.
 * @param {Object} [opts] - Run options.
 * @param {string} [opts.cwd] - Working directory for the child process.
 * @param {Object} [opts.env] - Extra environment variables (see {@link spawn}).
 * @param {*} [opts.stdin] - stdio config for stdin.
 * @param {boolean|string} [opts.shell] - Whether (or which shell) to run the command in.
 * @param {AbortSignal} [opts.abort] - Signal that terminates the process.
 * @param {string} [opts.kill] - Signal sent on abort.
 * @param {number} [opts.timeout] - Kill-to-SIGKILL escalation timeout in ms.
 * @param {boolean} [opts.nothrow] - When true, return a result with code 1 instead of throwing on failure.
 * @returns {Promise<{code: number, stdout: Buffer, stderr: Buffer}>} The exit code and captured output.
 */
export async function run(cmd, opts = {}) {
  const proc = spawn(cmd, {
    cwd: opts.cwd,
    env: opts.env,
    stdin: opts.stdin,
    shell: opts.shell,
    abort: opts.abort,
    kill: opts.kill,
    timeout: opts.timeout,
    stdout: "pipe",
    stderr: "pipe"
  });
  if (!proc.stdout || !proc.stderr) throw new Error("Process output not available");
  const out = await Promise.all([proc.exited, buffer(proc.stdout), buffer(proc.stderr)]).then(([code, stdout, stderr]) => ({
    code,
    stdout,
    stderr
  })).catch(err => {
    if (!opts.nothrow) throw err;
    return {
      code: 1,
      stdout: Buffer.alloc(0),
      stderr: Buffer.from(errorMessage(err))
    };
  });
  if (out.code === 0 || opts.nothrow) return out;
  throw new RunFailedError(cmd, out.code, out.stdout, out.stderr);
}

/**
 * Terminate a child process and its descendants. On Windows uses `taskkill /T /F`
 * to kill the whole tree, falling back to `proc.kill()`; no-ops if already exited.
 *
 * Duplicated in `packages/sdk/js/src/process.ts` because the SDK cannot import
 * `closedcode` without creating a cycle. Keep both copies in sync.
 * @param {Object} proc - The child process to stop.
 * @returns {Promise<void>} Resolves once termination has been requested.
 */
export async function stop(proc) {
  if (proc.exitCode !== null || proc.signalCode !== null) return;
  if (process.platform !== "win32" || !proc.pid) {
    proc.kill();
    return;
  }
  const out = await run(["taskkill", "/pid", String(proc.pid), "/T", "/F"], {
    nothrow: true
  });
  if (out.code === 0) return;
  proc.kill();
}
/**
 * Run a command and additionally decode its stdout as a UTF-8 string.
 * @param {Array<string>} cmd - The command and its arguments.
 * @param {Object} [opts] - Run options (see {@link run}).
 * @returns {Promise<{code: number, stdout: Buffer, stderr: Buffer, text: string}>} The run result plus decoded `text`.
 */
export async function text(cmd, opts = {}) {
  const out = await run(cmd, opts);
  return {
    ...out,
    text: out.stdout.toString()
  };
}
/**
 * Run a command and split its stdout into non-empty lines.
 * @param {Array<string>} cmd - The command and its arguments.
 * @param {Object} [opts] - Run options (see {@link run}).
 * @returns {Promise<Array<string>>} The output lines, with empty lines removed.
 */
export async function lines(cmd, opts = {}) {
  return (await text(cmd, opts)).text.split(/\r?\n/).filter(Boolean);
}
export * as Process from "./process.js";