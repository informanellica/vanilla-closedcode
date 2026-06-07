// Minimal Node-backed `$` template shell helper.
// Supports: await $`cmd`, .text(), .json(), .lines(), .quiet(), .nothrow(),
// .cwd(dir), .env(record). Argument substitution shell-escapes values.

import { spawn } from "node:child_process";
function shellEscape(value) {
  if (Array.isArray(value)) return value.map(shellEscape).join(" ");
  const s = String(value);
  if (s === "") return "''";
  if (/^[a-zA-Z0-9_\-\.\/=:@%+,]+$/.test(s)) return s;
  if (process.platform === "win32") return `"${s.replace(/"/g, '\\"')}"`;
  return "'" + s.replace(/'/g, "'\\''") + "'";
}
function joinTemplate(strings, values) {
  let out = "";
  for (let i = 0; i < strings.length; i++) {
    out += strings[i];
    if (i < values.length) out += shellEscape(values[i]);
  }
  return out;
}
class ShellPromise {
  quietValue = false;
  nothrowValue = false;
  constructor(command) {
    this.command = command;
  }
  cwd(dir) {
    this.cwdValue = dir;
    return this;
  }
  env(env) {
    this.envValue = env;
    return this;
  }
  quiet() {
    this.quietValue = true;
    return this;
  }
  nothrow() {
    this.nothrowValue = true;
    return this;
  }
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
  then(onfulfilled, onrejected) {
    return this.run().then(onfulfilled, onrejected);
  }
  catch(onrejected) {
    return this.run().catch(onrejected);
  }
  async text() {
    const r = await this.run();
    return r.stdout;
  }
  async json() {
    const r = await this.run();
    return JSON.parse(r.stdout);
  }
  async lines() {
    const r = await this.run();
    return r.stdout.split(/\r?\n/).filter(line => line.length > 0);
  }
  async arrayBuffer() {
    const r = await this.run();
    const buf = Buffer.from(r.stdout);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }
  async blob() {
    const r = await this.run();
    return new Blob([r.stdout]);
  }
}
export function $(strings, ...values) {
  return new ShellPromise(joinTemplate(strings, values));
}

// Re-export Node's URL helpers under names some Bun call sites import.
export { fileURLToPath, pathToFileURL } from "node:url";
