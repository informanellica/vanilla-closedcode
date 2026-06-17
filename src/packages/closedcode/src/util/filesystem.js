/**
 * Path-normalizing filesystem helpers for cross-shell (Git Bash/Cygwin/WSL) Windows support.
 * @module closedcode/util/filesystem
 */

import { chmod, mkdir, readFile, stat as statFile, writeFile } from "fs/promises";
import { createWriteStream, existsSync, statSync } from "fs";
import { realpathSync } from "fs";
import { dirname, join, relative, resolve as pathResolve, win32 } from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { Glob } from "core/util/glob";

/**
 * Check whether a path exists on disk.
 *
 * @param {string} p - The path to test.
 * @returns {Promise<boolean>} `true` if the path exists.
 */
// Fast sync version for metadata checks
export async function exists(p) {
  return existsSync(p);
}

/**
 * Check whether a path exists and is a directory.
 *
 * @param {string} p - The path to test.
 * @returns {Promise<boolean>} `true` if the path is an existing directory.
 */
export async function isDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Synchronously stat a path without throwing when it does not exist.
 *
 * @param {string} p - The path to stat.
 * @returns {*} The `fs.Stats` object, or `undefined` when the path is missing.
 */
export function stat(p) {
  return statSync(p, {
    throwIfNoEntry: false
  }) ?? undefined;
}

/**
 * Asynchronously stat a path, resolving to `undefined` for a missing path.
 *
 * @param {string} p - The path to stat.
 * @returns {Promise<*>} The `fs.Stats` object, or `undefined` on ENOENT.
 */
export async function statAsync(p) {
  return statFile(p).catch(e => {
    if (isEnoent(e)) return undefined;
    throw e;
  });
}

/**
 * Get the size of a path in bytes.
 *
 * @param {string} p - The path to measure.
 * @returns {Promise<number>} The byte size, or `0` when the path is missing.
 */
export async function size(p) {
  const s = stat(p)?.size ?? 0;
  return typeof s === "bigint" ? Number(s) : s;
}

/**
 * Read a file as UTF-8 text.
 *
 * @param {string} p - The path to read.
 * @returns {Promise<string>} The file contents decoded as UTF-8.
 */
export async function readText(p) {
  return readFile(p, "utf-8");
}

/**
 * Read and parse a UTF-8 JSON file.
 *
 * @param {string} p - The path to read.
 * @returns {Promise<*>} The parsed JSON value.
 */
export async function readJson(p) {
  return JSON.parse(await readFile(p, "utf-8"));
}

/**
 * Read a file as a raw byte buffer.
 *
 * @param {string} p - The path to read.
 * @returns {Promise<Buffer>} The file contents as a Buffer.
 */
export async function readBytes(p) {
  return readFile(p);
}

/**
 * Read a file and return its contents as a standalone `ArrayBuffer`.
 *
 * Slices the underlying buffer so the returned `ArrayBuffer` exactly spans the
 * file's bytes (the Node `Buffer` may share a larger pooled backing store).
 *
 * @param {string} p - The path to read.
 * @returns {Promise<ArrayBuffer>} The file contents as an ArrayBuffer.
 */
export async function readArrayBuffer(p) {
  const buf = await readFile(p);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

/**
 * Test whether an error is a Node "no such file or directory" (ENOENT) error.
 *
 * @param {*} e - The caught error value.
 * @returns {boolean} `true` when `e` has `code === "ENOENT"`.
 */
function isEnoent(e) {
  return typeof e === "object" && e !== null && "code" in e && e.code === "ENOENT";
}

/**
 * Write content to a path, creating parent directories on demand.
 *
 * On ENOENT (missing parent directory) the directory tree is created
 * recursively and the write is retried once.
 *
 * @param {string} p - The destination path.
 * @param {string|Buffer} content - The data to write.
 * @param {number} [mode] - Optional file mode (permission bits) to apply.
 * @returns {Promise<void>} Resolves once the file is written.
 */
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
/**
 * Serialize a value to pretty-printed JSON and write it to a path.
 *
 * @param {string} p - The destination path.
 * @param {*} data - The value to serialize as JSON.
 * @param {number} [mode] - Optional file mode (permission bits) to apply.
 * @returns {Promise<void>} Resolves once the file is written.
 */
export async function writeJson(p, data, mode) {
  return write(p, JSON.stringify(data, null, 2), mode);
}

/**
 * Stream data to a path, creating parent directories as needed.
 *
 * Accepts either a web `ReadableStream` (converted via `Readable.fromWeb`) or a
 * Node readable stream, and pipes it into a file write stream.
 *
 * @param {string} p - The destination path.
 * @param {ReadableStream|Readable} stream - The source stream to write.
 * @param {number} [mode] - Optional file mode applied via `chmod` after writing.
 * @returns {Promise<void>} Resolves once the stream has been fully written.
 */
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
/**
 * Resolve the MIME type for a path based on its extension.
 *
 * @param {string} p - The path or filename to inspect.
 * @returns {Promise<string>} The looked-up MIME type, or
 *   `"application/octet-stream"` when unknown.
 */
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
 *
 * On non-Windows platforms the path is returned unchanged. On Windows the path
 * is resolved and run through `realpathSync.native` to recover the on-disk
 * casing, falling back to the resolved path when the target does not exist.
 *
 * @param {string} p - The path to normalize.
 * @returns {string} The canonical-cased path (Windows) or `p` unchanged.
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
/**
 * Normalize a glob-style path pattern on Windows, preserving a trailing `*`.
 *
 * The bare `*` pattern and non-Windows platforms are returned unchanged. For a
 * `<dir>/*` pattern the directory portion is canonicalized via `normalizePath`
 * (handling drive-root patterns like `C:`) and rejoined with `*`.
 *
 * @param {string} p - The path pattern to normalize.
 * @returns {string} The normalized pattern.
 */
export function normalizePathPattern(p) {
  if (process.platform !== "win32") return p;
  if (p === "*") return p;
  const match = p.match(/^(.*)[\\/]\*$/);
  if (!match) return normalizePath(p);
  const dir = /^[A-Za-z]:$/.test(match[1]) ? match[1] + "\\" : match[1];
  return join(normalizePath(dir), "*");
}

/**
 * Resolve a path to an absolute, symlink-resolved, canonical form.
 *
 * @param {string} p - The path to resolve.
 * @returns {string} The canonical absolute path; for a missing path, the
 *   normalized resolved path (without symlink resolution).
 */
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
/**
 * On Windows, translate a Unix-style drive path into a native Windows path.
 *
 * Handles paths emitted by Git Bash (`/c/...`), Cygwin (`/cygdrive/c/...`),
 * WSL (`/mnt/c/...`), and already-`/c:`-prefixed forms, uppercasing the drive
 * letter. Non-Windows platforms return the path unchanged.
 *
 * @param {string} p - The path to translate.
 * @returns {string} The native Windows path, or `p` unchanged off Windows.
 */
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
/**
 * Determine whether two paths overlap (one contains the other, or they are equal).
 *
 * @param {string} a - The first path.
 * @param {string} b - The second path.
 * @returns {boolean} `true` when either path is contained within the other.
 */
export function overlaps(a, b) {
  const relA = relative(a, b);
  const relB = relative(b, a);
  return !relA || !relA.startsWith("..") || !relB || !relB.startsWith("..");
}

/**
 * Determine whether `child` is the same as, or nested within, `parent`.
 *
 * @param {string} parent - The candidate ancestor path.
 * @param {string} child - The candidate descendant path.
 * @returns {boolean} `true` when `child` is at or below `parent`.
 */
export function contains(parent, child) {
  return !relative(parent, child).startsWith("..");
}

/**
 * Search for target file(s) by walking up the directory tree from `start`.
 *
 * Walks from `start` toward the filesystem root (stopping after `stop`, if
 * provided), checking each directory for each target name and collecting every
 * match found.
 *
 * @param {string|Array} target - A target filename, or array of filenames, to look for.
 * @param {string} start - The directory to begin searching from.
 * @param {string} [stop] - A directory at which to stop walking upward (inclusive).
 * @param {Object} [options] - Options. When `rootFirst` is true, results are
 *   ordered from the topmost directory downward.
 * @returns {Promise<Array>} Absolute paths of every matching target found.
 */
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
/**
 * Lazily yield matching target paths while walking up the directory tree.
 *
 * Like `findUp`, but yields each match as it is found instead of collecting
 * them, walking from `start` toward the root and stopping after `stop`.
 *
 * @param {Object} options - `{ targets, start, stop }` where `targets` is an
 *   array of filenames to look for, `start` is the starting directory, and
 *   `stop` is the directory at which to stop walking (inclusive).
 * @returns {AsyncGenerator} Yields absolute paths of matches as they are found.
 */
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
/**
 * Run a glob scan in each directory while walking up the tree from `start`.
 *
 * In every directory from `start` toward the root (stopping after `stop`), the
 * pattern is scanned for files; matches are accumulated. Invalid glob patterns
 * in a given directory are skipped silently.
 *
 * @param {string} pattern - The glob pattern to scan in each directory.
 * @param {string} start - The directory to begin scanning from.
 * @param {string} [stop] - The directory at which to stop walking (inclusive).
 * @returns {Promise<Array>} Absolute paths of all matched files.
 */
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