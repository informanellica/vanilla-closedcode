import launch from "cross-spawn";
import { buffer } from "node:stream/consumers";
import { errorMessage } from "./error.js";
export class RunFailedError extends Error {
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

// Duplicated in `packages/sdk/js/src/process.ts` because the SDK cannot import
// `closedcode` without creating a cycle. Keep both copies in sync.
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
export async function text(cmd, opts = {}) {
  const out = await run(cmd, opts);
  return {
    ...out,
    text: out.stdout.toString()
  };
}
export async function lines(cmd, opts = {}) {
  return (await text(cmd, opts)).text.split(/\r?\n/).filter(Boolean);
}
export * as Process from "./process.js";