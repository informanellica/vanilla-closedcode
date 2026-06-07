import { chmod, mkdir, readFile, stat as statFile, writeFile } from "fs/promises";
import { createWriteStream, existsSync, statSync } from "fs";
import { realpathSync } from "fs";
import { dirname, join, relative, resolve as pathResolve, win32 } from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { Glob } from "core/util/glob";

// Fast sync version for metadata checks
export async function exists(p) {
  return existsSync(p);
}
export async function isDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}
export function stat(p) {
  return statSync(p, {
    throwIfNoEntry: false
  }) ?? undefined;
}
export async function statAsync(p) {
  return statFile(p).catch(e => {
    if (isEnoent(e)) return undefined;
    throw e;
  });
}
export async function size(p) {
  const s = stat(p)?.size ?? 0;
  return typeof s === "bigint" ? Number(s) : s;
}
export async function readText(p) {
  return readFile(p, "utf-8");
}
export async function readJson(p) {
  return JSON.parse(await readFile(p, "utf-8"));
}
export async function readBytes(p) {
  return readFile(p);
}
export async function readArrayBuffer(p) {
  const buf = await readFile(p);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}
function isEnoent(e) {
  return typeof e === "object" && e !== null && "code" in e && e.code === "ENOENT";
}
export async function write(p, content, mode) {
  try {
    if (mode) {
      await writeFile(p, content, {
        mode
      });
    } else {
      await writeFile(p, content);
    }
  } catch (e) {
    if (isEnoent(e)) {
      await mkdir(dirname(p), {
        recursive: true
      });
      if (mode) {
        await writeFile(p, content, {
          mode
        });
      } else {
        await writeFile(p, content);
      }
      return;
    }
    throw e;
  }
}
export async function writeJson(p, data, mode) {
  return write(p, JSON.stringify(data, null, 2), mode);
}
export async function writeStream(p, stream, mode) {
  const dir = dirname(p);
  if (!existsSync(dir)) {
    await mkdir(dir, {
      recursive: true
    });
  }
  const nodeStream = stream instanceof ReadableStream ? Readable.fromWeb(stream) : stream;
  const writeStream = createWriteStream(p);
  await pipeline(nodeStream, writeStream);
  if (mode) {
    await chmod(p, mode);
  }
}
export async function mimeType(p) {
  const {
    lookup
  } = await import("mime-types");
  return lookup(p) || "application/octet-stream";
}

/**
 * On Windows, normalize a path to its canonical casing using the filesystem.
 * This is needed because Windows paths are case-insensitive but LSP servers
 * may return paths with different casing than what we send them.
 */
export function normalizePath(p) {
  if (process.platform !== "win32") return p;
  const resolved = win32.normalize(win32.resolve(windowsPath(p)));
  try {
    return realpathSync.native(resolved);
  } catch {
    return resolved;
  }
}
export function normalizePathPattern(p) {
  if (process.platform !== "win32") return p;
  if (p === "*") return p;
  const match = p.match(/^(.*)[\\/]\*$/);
  if (!match) return normalizePath(p);
  const dir = /^[A-Za-z]:$/.test(match[1]) ? match[1] + "\\" : match[1];
  return join(normalizePath(dir), "*");
}

// We cannot rely on path.resolve() here because git.exe may come from Git Bash, Cygwin, or MSYS2, so we need to translate these paths at the boundary.
// Also resolves symlinks so that callers using the result as a cache key
// always get the same canonical path for a given physical directory.
export function resolve(p) {
  const resolved = pathResolve(windowsPath(p));
  try {
    return normalizePath(realpathSync(resolved));
  } catch (e) {
    if (isEnoent(e)) return normalizePath(resolved);
    throw e;
  }
}
export function windowsPath(p) {
  if (process.platform !== "win32") return p;
  return p.replace(/^\/([a-zA-Z]):(?:[\\/]|$)/, (_, drive) => `${drive.toUpperCase()}:/`)
  // Git Bash for Windows paths are typically /<drive>/...
  .replace(/^\/([a-zA-Z])(?:\/|$)/, (_, drive) => `${drive.toUpperCase()}:/`)
  // Cygwin git paths are typically /cygdrive/<drive>/...
  .replace(/^\/cygdrive\/([a-zA-Z])(?:\/|$)/, (_, drive) => `${drive.toUpperCase()}:/`)
  // WSL paths are typically /mnt/<drive>/...
  .replace(/^\/mnt\/([a-zA-Z])(?:\/|$)/, (_, drive) => `${drive.toUpperCase()}:/`);
}
export function overlaps(a, b) {
  const relA = relative(a, b);
  const relB = relative(b, a);
  return !relA || !relA.startsWith("..") || !relB || !relB.startsWith("..");
}
export function contains(parent, child) {
  return !relative(parent, child).startsWith("..");
}
export async function findUp(target, start, stop, options) {
  const dirs = [start];
  let current = start;
  while (true) {
    if (stop === current) break;
    const parent = dirname(current);
    if (parent === current) break;
    dirs.push(parent);
    current = parent;
  }
  const targets = Array.isArray(target) ? target : [target];
  const result = [];
  for (const dir of options?.rootFirst ? dirs.toReversed() : dirs) {
    for (const item of targets) {
      const search = join(dir, item);
      if (await exists(search)) result.push(search);
    }
  }
  return result;
}
export async function* up(options) {
  const {
    targets,
    start,
    stop
  } = options;
  let current = start;
  while (true) {
    for (const target of targets) {
      const search = join(current, target);
      if (await exists(search)) yield search;
    }
    if (stop === current) break;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
}
export async function globUp(pattern, start, stop) {
  let current = start;
  const result = [];
  while (true) {
    try {
      const matches = await Glob.scan(pattern, {
        cwd: current,
        absolute: true,
        include: "file",
        dot: true
      });
      result.push(...matches);
    } catch {
      // Skip invalid glob patterns
    }
    if (stop === current) break;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return result;
}
export * as Filesystem from "./filesystem.js";