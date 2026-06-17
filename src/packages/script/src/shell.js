/** @file Minimal Node-backed `$` template-literal shell helper (a Bun-`$` work-alike) used by the build scripts; spawns shell commands and exposes chainable result accessors. */
// Minimal Node-backed `$` template shell helper.
// Supports: await $`cmd`, .text(), .json(), .lines(), .quiet(), .nothrow(),
// .cwd(dir), .env(record). Argument substitution shell-escapes values.

import { spawn } from "node:child_process";
/**
 * Shell-escape a substituted template value so it is treated as a single,
 * literal argument. Arrays are escaped element-wise and space-joined.
 * Plain safe tokens pass through unquoted; quoting differs per platform.
 * @param {*} value - The value to escape (stringified; arrays handled recursively).
 * @returns {string} A shell-safe representation of the value.
 */
function shellEscape(value) {
  if (Array.isArray(value)) return value.map(shellEscape).join(" ");
  const s = String(value);
  if (s === "") return "''";
  if (/^[a-zA-Z0-9_\-\.\/=:@%+,]+$/.test(s)) return s;
  if (process.platform === "win32") return `"${s.replace(/"/g, '\\"')}"`;
  return "'" + s.replace(/'/g, "'\\''") + "'";
}
/**
 * Reassemble a tagged-template invocation into a single command string,
 * shell-escaping each interpolated value as it is spliced between the
 * static string segments.
 * @param {Array} strings - The static string segments of the template literal.
 * @param {Array} values - The interpolated values, one fewer than `strings`.
 * @returns {string} The assembled command line with escaped substitutions.
 */
function joinTemplate(strings, values) {
  let out = "";
  for (let i = 0; i < strings.length; i++) {
    out += strings[i];
    if (i < values.length) out += shellEscape(values[i]);
  }
  return out;
}
/**
 * A lazy, thenable handle for a single shell command. Spawning is deferred
 * until the command is awaited or one of the result accessors is called, and
 * the run is memoized so multiple accessors share one execution. Configuration
 * methods return `this` for chaining.
 */
class ShellPromise {
  quietValue = false;
  nothrowValue = false;
  /**
   * @param {string} command - The fully assembled command line to execute.
   */
  constructor(command) {
    this.command = command;
  }
  /**
   * Set the working directory for the command.
   * @param {string} dir - The directory in which to run the command.
   * @returns {ShellPromise} This instance, for chaining.
   */
  cwd(dir) {
    this.cwdValue = dir;
    return this;
  }
  /**
   * Override the environment variables passed to the command.
   * @param {Object} env - The environment variable map to use.
   * @returns {ShellPromise} This instance, for chaining.
   */
  env(env) {
    this.envValue = env;
    return this;
  }
  /**
   * Suppress forwarding of the child's stdout/stderr to this process.
   * @returns {ShellPromise} This instance, for chaining.
   */
  quiet() {
    this.quietValue = true;
    return this;
  }
  /**
   * Do not reject on a non-zero exit code; resolve with the result instead.
   * @returns {ShellPromise} This instance, for chaining.
   */
  nothrow() {
    this.nothrowValue = true;
    return this;
  }
  /**
   * Spawn the command (once) and collect its output. Memoizes the underlying
   * promise so repeated calls reuse the same run. Rejects on a non-zero exit
   * code unless `nothrow()` was set.
   * @returns {Promise<Object>} Resolves to an object with `stdout`, `stderr`, and `exitCode`.
   */
  run() {
    if (this.promise) return this.promise;
    this.promise = new Promise((resolve, reject) => {
      const opts = {
        cwd: this.cwdValue,
        env: this.envValue ?? process.env,
        shell: true,
        stdio: this.quietValue ? ["ignore", "pipe", "pipe"] : ["ignore", "pipe", "pipe"]
      };
      const child = spawn(this.command, opts);
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", chunk => {
        const text = chunk.toString();
        stdout += text;
        if (!this.quietValue) process.stdout.write(text);
      });
      child.stderr?.on("data", chunk => {
        const text = chunk.toString();
        stderr += text;
        if (!this.quietValue) process.stderr.write(text);
      });
      child.on("error", reject);
      child.on("close", code => {
        const result = {
          stdout,
          stderr,
          exitCode: code ?? 0
        };
        if (code !== 0 && !this.nothrowValue) {
          const err = new Error(`Command failed with exit code ${code}: ${this.command}\n${stderr}`);
          err.exitCode = code ?? 0;
          err.stdout = stdout;
          err.stderr = stderr;
          reject(err);
          return;
        }
        resolve(result);
      });
    });
    return this.promise;
  }
  /**
   * Thenable hook so the instance can be `await`ed directly; triggers the run.
   * @param {Function} onfulfilled - Called with the run result on success.
   * @param {Function} onrejected - Called with the error on failure.
   * @returns {Promise} The chained promise from the underlying run.
   */
  then(onfulfilled, onrejected) {
    return this.run().then(onfulfilled, onrejected);
  }
  /**
   * Attach a rejection handler to the underlying run.
   * @param {Function} onrejected - Called with the error on failure.
   * @returns {Promise} The chained promise from the underlying run.
   */
  catch(onrejected) {
    return this.run().catch(onrejected);
  }
  /**
   * Run the command and return its captured standard output.
   * @returns {Promise<string>} The command's stdout.
   */
  async text() {
    const r = await this.run();
    return r.stdout;
  }
  /**
   * Run the command and parse its standard output as JSON.
   * @returns {Promise<*>} The parsed JSON value from stdout.
   */
  async json() {
    const r = await this.run();
    return JSON.parse(r.stdout);
  }
  /**
   * Run the command and split its standard output into non-empty lines.
   * @returns {Promise<Array>} The non-empty output lines.
   */
  async lines() {
    const r = await this.run();
    return r.stdout.split(/\r?\n/).filter(line => line.length > 0);
  }
  /**
   * Run the command and return its standard output as an ArrayBuffer.
   * @returns {Promise<ArrayBuffer>} The stdout bytes as an ArrayBuffer.
   */
  async arrayBuffer() {
    const r = await this.run();
    const buf = Buffer.from(r.stdout);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }
  /**
   * Run the command and wrap its standard output in a Blob.
   * @returns {Promise<Blob>} A Blob containing the stdout.
   */
  async blob() {
    const r = await this.run();
    return new Blob([r.stdout]);
  }
}
/**
 * Tagged-template shell runner: `` $`git status` `` builds an escaped command
 * line and returns a lazy {@link ShellPromise} you can await or chain accessors on.
 * @param {Array} strings - The static template string segments.
 * @param {...*} values - The interpolated values, shell-escaped into the command.
 * @returns {ShellPromise} A lazy handle for running the command.
 */
export function $(strings, ...values) {
  return new ShellPromise(joinTemplate(strings, values));
}

// Re-export Node's URL helpers under names some Bun call sites import.
export { fileURLToPath, pathToFileURL } from "node:url";
