/** @file AppFileSystem: an Effect FileSystem service extended with app helpers (exists/stat predicates, JSON IO, dir-creating writes, glob, upward search) plus cross-platform path normalization and containment utilities. */
import { NodeFileSystem } from "@effect/platform-node";
import { dirname, join, relative, resolve as pathResolve } from "path";
import { realpathSync } from "fs";
import * as NFS from "fs/promises";
import { lookup } from "mime-types";
import { Effect, FileSystem, Layer, Schema, Context } from "effect";
import { Glob } from "./util/glob.js";
export let AppFileSystem;
(function (_AppFileSystem) {
  class FileSystemError extends Schema.TaggedErrorClass()("FileSystemError", {
    method: Schema.String,
    cause: Schema.optional(Schema.Defect)
  }) {}
  _AppFileSystem.FileSystemError = FileSystemError;
  class Service extends Context.Service()("@closedcode/FileSystem") {}
  _AppFileSystem.Service = Service;
  /** Effect Layer building the AppFileSystem Service on top of the underlying Effect FileSystem, adding the helper methods below. */
  const layer = _AppFileSystem.layer = Layer.effect(Service, Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    /**
     * Check whether a path exists, treating any error as non-existence.
     * @param {string} path - The path to test.
     * @returns {Object} An Effect yielding true if the path exists, false otherwise.
     */
    const existsSafe = Effect.fn("FileSystem.existsSafe")(function* (path) {
      return yield* fs.exists(path).pipe(Effect.orElseSucceed(() => false));
    });
    /**
     * Check whether a path is a directory (false on any stat error).
     * @param {string} path - The path to test.
     * @returns {Object} An Effect yielding true if the path is a directory.
     */
    const isDir = Effect.fn("FileSystem.isDir")(function* (path) {
      const info = yield* fs.stat(path).pipe(Effect.catch(() => Effect.void));
      return info?.type === "Directory";
    });
    /**
     * Check whether a path is a regular file (false on any stat error).
     * @param {string} path - The path to test.
     * @returns {Object} An Effect yielding true if the path is a file.
     */
    const isFile = Effect.fn("FileSystem.isFile")(function* (path) {
      const info = yield* fs.stat(path).pipe(Effect.catch(() => Effect.void));
      return info?.type === "File";
    });
    /**
     * Read a directory's entries with their kinds.
     * @param {string} dirPath - The directory to read.
     * @returns {Object} An Effect yielding an array of `{ name, type }` entries (type is "directory", "symlink", "file", or "other"), failing with a FileSystemError on error.
     */
    const readDirectoryEntries = Effect.fn("FileSystem.readDirectoryEntries")(function* (dirPath) {
      return yield* Effect.tryPromise({
        try: async () => {
          const entries = await NFS.readdir(dirPath, {
            withFileTypes: true
          });
          return entries.map(e => ({
            name: e.name,
            type: e.isDirectory() ? "directory" : e.isSymbolicLink() ? "symlink" : e.isFile() ? "file" : "other"
          }));
        },
        catch: cause => new FileSystemError({
          method: "readDirectoryEntries",
          cause
        })
      });
    });
    /**
     * Read a file and parse it as JSON.
     * @param {string} path - The file to read.
     * @returns {Object} An Effect yielding the parsed JSON value.
     */
    const readJson = Effect.fn("FileSystem.readJson")(function* (path) {
      const text = yield* fs.readFileString(path);
      return JSON.parse(text);
    });
    /**
     * Serialize data as pretty-printed JSON and write it, optionally chmod-ing.
     * @param {string} path - The destination file.
     * @param {*} data - The value to serialize.
     * @param {number} mode - Optional file mode to apply after writing.
     * @returns {Object} An Effect that completes once the file is written.
     */
    const writeJson = Effect.fn("FileSystem.writeJson")(function* (path, data, mode) {
      const content = JSON.stringify(data, null, 2);
      yield* fs.writeFileString(path, content);
      if (mode) yield* fs.chmod(path, mode);
    });
    /**
     * Create a directory, including any missing parents.
     * @param {string} path - The directory to create.
     * @returns {Object} An Effect that completes once the directory exists.
     */
    const ensureDir = Effect.fn("FileSystem.ensureDir")(function* (path) {
      yield* fs.makeDirectory(path, {
        recursive: true
      });
    });
    /**
     * Write a file, creating parent directories on demand if the initial write
     * fails because they are missing, then optionally chmod-ing.
     * @param {string} path - The destination file.
     * @param {string|Uint8Array} content - String or binary content to write.
     * @param {number} mode - Optional file mode to apply after writing.
     * @returns {Object} An Effect that completes once the file is written.
     */
    const writeWithDirs = Effect.fn("FileSystem.writeWithDirs")(function* (path, content, mode) {
      const write = typeof content === "string" ? fs.writeFileString(path, content) : fs.writeFile(path, content);
      yield* write.pipe(Effect.catchIf(e => e.reason._tag === "NotFound", () => Effect.gen(function* () {
        yield* fs.makeDirectory(dirname(path), {
          recursive: true
        });
        yield* write;
      })));
      if (mode) yield* fs.chmod(path, mode);
    });
    /**
     * Run a glob scan, surfacing failures as a FileSystemError.
     * @param {string} pattern - The glob pattern.
     * @param {Object} options - Glob scan options (cwd, absolute, include, dot, etc.).
     * @returns {Object} An Effect yielding the array of matched paths.
     */
    const glob = Effect.fn("FileSystem.glob")(function* (pattern, options) {
      return yield* Effect.tryPromise({
        try: () => Glob.scan(pattern, options),
        catch: cause => new FileSystemError({
          method: "glob",
          cause
        })
      });
    });
    /**
     * Walk upward from a starting directory collecting every existing path
     * matching the target name, stopping at a boundary or the filesystem root.
     * @param {string} target - The relative target name to look for in each ancestor.
     * @param {string} start - The directory to start searching from.
     * @param {string} stop - The directory at which to stop ascending (inclusive).
     * @returns {Object} An Effect yielding an array of matching absolute paths (nearest first).
     */
    const findUp = Effect.fn("FileSystem.findUp")(function* (target, start, stop) {
      const result = [];
      let current = start;
      while (true) {
        const search = join(current, target);
        if (yield* fs.exists(search)) result.push(search);
        if (stop === current) break;
        const parent = dirname(current);
        if (parent === current) break;
        current = parent;
      }
      return result;
    });
    /**
     * Walk upward from a starting directory collecting every existing path that
     * matches any of several target names, stopping at a boundary or the root.
     * @param {Object} options - Search options with `targets` (array of names), `start`, and `stop`.
     * @returns {Object} An Effect yielding an array of matching absolute paths.
     */
    const up = Effect.fn("FileSystem.up")(function* (options) {
      const result = [];
      let current = options.start;
      while (true) {
        for (const target of options.targets) {
          const search = join(current, target);
          if (yield* fs.exists(search)) result.push(search);
        }
        if (options.stop === current) break;
        const parent = dirname(current);
        if (parent === current) break;
        current = parent;
      }
      return result;
    });
    /**
     * Walk upward from a starting directory running a glob in each ancestor and
     * accumulating all matches, stopping at a boundary or the filesystem root.
     * @param {string} pattern - The glob pattern run within each ancestor directory.
     * @param {string} start - The directory to start searching from.
     * @param {string} stop - The directory at which to stop ascending (inclusive).
     * @returns {Object} An Effect yielding an array of matching absolute paths.
     */
    const globUp = Effect.fn("FileSystem.globUp")(function* (pattern, start, stop) {
      const result = [];
      let current = start;
      while (true) {
        const matches = yield* glob(pattern, {
          cwd: current,
          absolute: true,
          include: "file",
          dot: true
        }).pipe(Effect.catch(() => Effect.succeed([])));
        result.push(...matches);
        if (stop === current) break;
        const parent = dirname(current);
        if (parent === current) break;
        current = parent;
      }
      return result;
    });
    return Service.of({
      ...fs,
      existsSafe,
      isDir,
      isFile,
      readDirectoryEntries,
      readJson,
      writeJson,
      ensureDir,
      writeWithDirs,
      findUp,
      up,
      globUp,
      glob,
      globMatch: Glob.match
    });
  }));
  /** The AppFileSystem {@link layer} with the Node FileSystem dependency already provided. */
  const defaultLayer = _AppFileSystem.defaultLayer = layer.pipe(Layer.provide(NodeFileSystem.layer));
  /**
   * Look up the MIME type for a path by extension, defaulting to a binary type.
   * @param {string} p - The path or filename.
   * @returns {string} The detected MIME type, or "application/octet-stream".
   */
  function mimeType(p) {
    return lookup(p) || "application/octet-stream";
  }
  _AppFileSystem.mimeType = mimeType;
  /**
   * Normalize a path on Windows by resolving it and canonicalizing case/links;
   * a no-op on non-Windows platforms.
   * @param {string} p - The path to normalize.
   * @returns {string} The normalized path (resolved form if the real path cannot be read).
   */
  function normalizePath(p) {
    if (process.platform !== "win32") return p;
    const resolved = pathResolve(windowsPath(p));
    try {
      return realpathSync.native(resolved);
    } catch {
      return resolved;
    }
  }
  _AppFileSystem.normalizePath = normalizePath;
  /**
   * Normalize a glob-style path pattern on Windows, preserving a trailing `*`
   * segment while normalizing the directory portion; a no-op elsewhere.
   * @param {string} p - The path pattern to normalize.
   * @returns {string} The normalized pattern.
   */
  function normalizePathPattern(p) {
    if (process.platform !== "win32") return p;
    if (p === "*") return p;
    const match = p.match(/^(.*)[\\/]\*$/);
    if (!match) return normalizePath(p);
    const dir = /^[A-Za-z]:$/.test(match[1]) ? match[1] + "\\" : match[1];
    return join(normalizePath(dir), "*");
  }
  _AppFileSystem.normalizePathPattern = normalizePathPattern;
  /**
   * Resolve a path to an absolute, canonical form, tolerating non-existent
   * paths (ENOENT) by returning the normalized resolved path.
   * @param {string} p - The path to resolve.
   * @returns {string} The resolved, normalized absolute path.
   */
  function resolve(p) {
    const resolved = pathResolve(windowsPath(p));
    try {
      return normalizePath(realpathSync(resolved));
    } catch (e) {
      if (e?.code === "ENOENT") return normalizePath(resolved);
      throw e;
    }
  }
  _AppFileSystem.resolve = resolve;
  /**
   * On Windows, rewrite POSIX-style drive prefixes (including /cygdrive and
   * /mnt forms) into a `C:/` style drive root; a no-op on other platforms.
   * @param {string} p - The path to rewrite.
   * @returns {string} The Windows-style path.
   */
  function windowsPath(p) {
    if (process.platform !== "win32") return p;
    return p.replace(/^\/([a-zA-Z]):(?:[\\/]|$)/, (_, drive) => `${drive.toUpperCase()}:/`).replace(/^\/([a-zA-Z])(?:\/|$)/, (_, drive) => `${drive.toUpperCase()}:/`).replace(/^\/cygdrive\/([a-zA-Z])(?:\/|$)/, (_, drive) => `${drive.toUpperCase()}:/`).replace(/^\/mnt\/([a-zA-Z])(?:\/|$)/, (_, drive) => `${drive.toUpperCase()}:/`);
  }
  _AppFileSystem.windowsPath = windowsPath;
  /**
   * Test whether two paths overlap, i.e. one contains the other (or they are equal).
   * @param {string} a - The first path.
   * @param {string} b - The second path.
   * @returns {boolean} True if either path is contained within the other.
   */
  function overlaps(a, b) {
    const relA = relative(a, b);
    const relB = relative(b, a);
    return !relA || !relA.startsWith("..") || !relB || !relB.startsWith("..");
  }
  _AppFileSystem.overlaps = overlaps;
  /**
   * Test whether a child path lies within a parent path.
   * @param {string} parent - The candidate ancestor path.
   * @param {string} child - The candidate descendant path.
   * @returns {boolean} True if child is contained within parent.
   */
  function contains(parent, child) {
    return !relative(parent, child).startsWith("..");
  }
  _AppFileSystem.contains = contains;
})(AppFileSystem || (AppFileSystem = {}));