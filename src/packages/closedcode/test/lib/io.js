// Minimal Node-based replacements for the subset of `Bun.*` IO APIs that test
// code used to rely on via the bun-shim. Keep this surface intentionally
// small — if you reach for something exotic, prefer importing `node:fs` /
// `node:child_process` directly at the call site.
import { spawn, spawnSync as childSpawnSync } from "node:child_process";
import { accessSync, createReadStream } from "node:fs";
import { access, mkdir, readFile, writeFile as fsWriteFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleepTimer } from "node:timers/promises";

export async function writeFile(dest, content) {
  const destPath = typeof dest === "object" && dest && "name" in dest ? dest.name : String(dest);
  await mkdir(path.dirname(destPath), { recursive: true });
  let data;
  if (typeof content === "string") {
    data = content;
  } else if (content instanceof ArrayBuffer) {
    data = Buffer.from(content);
  } else if (ArrayBuffer.isView(content)) {
    data = Buffer.from(content.buffer, content.byteOffset, content.byteLength);
  } else if (typeof Blob !== "undefined" && content instanceof Blob) {
    data = Buffer.from(await content.arrayBuffer());
  } else if (typeof Response !== "undefined" && content instanceof Response) {
    data = Buffer.from(await content.arrayBuffer());
  } else if (content && typeof content.arrayBuffer === "function") {
    data = Buffer.from(await content.arrayBuffer());
  } else {
    data = String(content);
  }
  await fsWriteFile(destPath, data);
  return typeof data === "string" ? Buffer.byteLength(data) : data.byteLength;
}

export async function readText(file) {
  return readFile(String(file), "utf8");
}

export async function readJson(file) {
  return JSON.parse(await readText(file));
}

export async function readBytes(file) {
  const buf = await readFile(String(file));
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

export async function fileExists(file) {
  try {
    await access(String(file));
    return true;
  } catch {
    return false;
  }
}

export function readStream(file) {
  return createReadStream(String(file));
}

export function sleep(ms) {
  return sleepTimer(ms);
}

export function sleepSync(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // busy-wait
  }
}

export function which(cmd, options) {
  const PATH = options?.PATH ?? process.env.PATH ?? "";
  const exts = process.platform === "win32"
    ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";")
    : [""];
  for (const dir of PATH.split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = path.join(dir, cmd + ext);
      try {
        accessSync(candidate);
        return candidate;
      } catch {
        // not present
      }
    }
  }
  return null;
}

export function spawnProcess(args) {
  const opts = Array.isArray(args) ? { cmd: args } : args;
  const [program, ...rest] = opts.cmd;
  if (!program) throw new Error("spawnProcess: empty command");
  const proc = spawn(program, rest, {
    cwd: opts.cwd,
    env: opts.env,
    stdio: opts.stdio,
  });
  return Object.assign(proc, {
    exited: new Promise((resolve) => proc.once("close", (code) => resolve(code ?? 0))),
    pid: proc.pid,
  });
}

export function spawnSync(cmd) {
  const [program, ...rest] = cmd;
  return childSpawnSync(program, rest);
}

export function gc() {
  if (typeof globalThis.gc === "function") globalThis.gc();
}
