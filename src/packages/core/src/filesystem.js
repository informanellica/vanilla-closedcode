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
  const layer = _AppFileSystem.layer = Layer.effect(Service, Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const existsSafe = Effect.fn("FileSystem.existsSafe")(function* (path) {
      return yield* fs.exists(path).pipe(Effect.orElseSucceed(() => false));
    });
    const isDir = Effect.fn("FileSystem.isDir")(function* (path) {
      const info = yield* fs.stat(path).pipe(Effect.catch(() => Effect.void));
      return info?.type === "Directory";
    });
    const isFile = Effect.fn("FileSystem.isFile")(function* (path) {
      const info = yield* fs.stat(path).pipe(Effect.catch(() => Effect.void));
      return info?.type === "File";
    });
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
    const readJson = Effect.fn("FileSystem.readJson")(function* (path) {
      const text = yield* fs.readFileString(path);
      return JSON.parse(text);
    });
    const writeJson = Effect.fn("FileSystem.writeJson")(function* (path, data, mode) {
      const content = JSON.stringify(data, null, 2);
      yield* fs.writeFileString(path, content);
      if (mode) yield* fs.chmod(path, mode);
    });
    const ensureDir = Effect.fn("FileSystem.ensureDir")(function* (path) {
      yield* fs.makeDirectory(path, {
        recursive: true
      });
    });
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
    const glob = Effect.fn("FileSystem.glob")(function* (pattern, options) {
      return yield* Effect.tryPromise({
        try: () => Glob.scan(pattern, options),
        catch: cause => new FileSystemError({
          method: "glob",
          cause
        })
      });
    });
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
  const defaultLayer = _AppFileSystem.defaultLayer = layer.pipe(Layer.provide(NodeFileSystem.layer));
  function mimeType(p) {
    return lookup(p) || "application/octet-stream";
  }
  _AppFileSystem.mimeType = mimeType;
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
  function normalizePathPattern(p) {
    if (process.platform !== "win32") return p;
    if (p === "*") return p;
    const match = p.match(/^(.*)[\\/]\*$/);
    if (!match) return normalizePath(p);
    const dir = /^[A-Za-z]:$/.test(match[1]) ? match[1] + "\\" : match[1];
    return join(normalizePath(dir), "*");
  }
  _AppFileSystem.normalizePathPattern = normalizePathPattern;
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
  function windowsPath(p) {
    if (process.platform !== "win32") return p;
    return p.replace(/^\/([a-zA-Z]):(?:[\\/]|$)/, (_, drive) => `${drive.toUpperCase()}:/`).replace(/^\/([a-zA-Z])(?:\/|$)/, (_, drive) => `${drive.toUpperCase()}:/`).replace(/^\/cygdrive\/([a-zA-Z])(?:\/|$)/, (_, drive) => `${drive.toUpperCase()}:/`).replace(/^\/mnt\/([a-zA-Z])(?:\/|$)/, (_, drive) => `${drive.toUpperCase()}:/`);
  }
  _AppFileSystem.windowsPath = windowsPath;
  function overlaps(a, b) {
    const relA = relative(a, b);
    const relB = relative(b, a);
    return !relA || !relA.startsWith("..") || !relB || !relB.startsWith("..");
  }
  _AppFileSystem.overlaps = overlaps;
  function contains(parent, child) {
    return !relative(parent, child).startsWith("..");
  }
  _AppFileSystem.contains = contains;
})(AppFileSystem || (AppFileSystem = {}));