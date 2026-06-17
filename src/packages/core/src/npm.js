/** @file Programmatic npm operations (install/add/which) via @npmcli/arborist, gated behind a file lock and an opt-in network-download policy. */
export * as Npm from "./npm.js";
import path from "path";
import npa from "npm-package-arg";
import { Effect, Schema, Context, Layer, Option, FileSystem } from "effect";
import { NodeFileSystem } from "@effect/platform-node";
import { AppFileSystem } from "./filesystem.js";
import { Global } from "./global.js";
import { EffectFlock } from "./util/effect-flock.js";
import { makeRuntime } from "./effect/runtime.js";
import { NpmConfig } from "./npm-config.js";
/** Tagged error raised when an npm reify/install fails; carries the target dir, attempted additions, and cause. */
export class InstallFailedError extends Schema.TaggedErrorClass()("NpmInstallFailedError", {
  add: Schema.Array(Schema.String).pipe(Schema.optional),
  dir: Schema.String,
  cause: Schema.optional(Schema.Defect)
}) {}
/** Effect service tag exposing the npm add/install/which operations. */
export class Service extends Context.Service()("@closedcode/Npm") {}
const illegal = process.platform === "win32" ? new Set(["<", ">", ":", '"', "|", "?", "*"]) : undefined;
/**
 * Replaces filesystem-illegal characters (on Windows) so a package spec can be used as a directory name.
 * @param {string} pkg - The package specifier to sanitize.
 * @returns {string} The package spec with illegal/control characters replaced by underscores (unchanged on non-Windows).
 */
export function sanitize(pkg) {
  if (!illegal) return pkg;
  return Array.from(pkg, char => illegal.has(char) || char.charCodeAt(0) < 32 ? "_" : char).join("");
}
/**
 * Builds a result describing an installed package directory plus its resolved entry point, if importable.
 * @param {string} name - The package name (used for import resolution).
 * @param {string} dir - The package directory to resolve and report.
 * @returns {Object} An object with `directory` and an `entrypoint` Option (some resolved URL, or none).
 */
const resolveEntryPoint = (name, dir) => {
  let entrypoint;
  try {
    const resolved = import.meta.resolve(dir);
    entrypoint = Option.some(resolved);
  } catch {
    entrypoint = Option.none();
  }
  return {
    directory: dir,
    entrypoint
  };
};
/**
 * Layer constructing the Npm service, wiring its filesystem, global paths, and file-lock dependencies.
 * @type {Layer}
 */
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const afs = yield* AppFileSystem.Service;
  const global = yield* Global.Service;
  const fs = yield* FileSystem.FileSystem;
  const flock = yield* EffectFlock.Service;
  /**
   * Computes the per-package install directory under the global cache.
   * @param {string} pkg - The package specifier.
   * @returns {string} The cache directory path that holds this package's install tree.
   */
  const directory = pkg => path.join(global.cache, "packages", sanitize(pkg));
  /**
   * Runs an arborist reify (install) under a per-directory file lock.
   * @param {Object} input - Reify input with a `dir` to install into and optional `add` package specs.
   * @returns {Effect} An Effect yielding the reified dependency tree, failing with InstallFailedError.
   */
  const reify = input => Effect.gen(function* () {
    yield* flock.acquire(`npm-install:${input.dir}`);
    const {
      Arborist
    } = yield* Effect.promise(() => import("@npmcli/arborist"));
    const add = input.add ?? [];
    const npmOptions = yield* NpmConfig.load(input.dir);
    const arborist = new Arborist({
      ...npmOptions,
      path: input.dir,
      binLinks: true,
      progress: false,
      savePrefix: "",
      ignoreScripts: true
    });
    return yield* Effect.tryPromise({
      try: () => arborist.reify({
        ...npmOptions,
        add,
        save: true,
        saveType: "prod"
      }),
      catch: cause => new InstallFailedError({
        cause,
        add,
        dir: input.dir
      })
    });
  }).pipe(Effect.withSpan("Npm.reify", {
    attributes: input
  }));
  /**
   * Installs a single package (if not already present) into its dedicated cache directory and resolves its entry point.
   * @param {string} pkg - The package specifier to install.
   * @returns {Effect} An Effect yielding the resolved entry-point result, failing with InstallFailedError when unresolvable.
   */
  const add = Effect.fn("Npm.add")(function* (pkg) {
    const dir = directory(pkg);
    const name = (() => {
      try {
        return npa(pkg).name ?? pkg;
      } catch {
        return pkg;
      }
    })();
    if (yield* afs.existsSafe(path.join(dir, "node_modules", name))) {
      return resolveEntryPoint(name, path.join(dir, "node_modules", name));
    }
    const tree = yield* reify({
      dir,
      add: [pkg]
    });
    const first = tree.edgesOut.values().next().value?.to;
    if (!first) {
      const result = resolveEntryPoint(name, path.join(dir, "node_modules", name));
      if (Option.isSome(result.entrypoint)) return result;
      return yield* new InstallFailedError({
        add: [pkg],
        dir
      });
    }
    return resolveEntryPoint(first.name, first.path);
  }, Effect.scoped);
  /**
   * Ensures a directory's dependencies are installed: reifies when node_modules is missing or when the
   * declared dependencies are not all present in the lockfile (a "dirty" tree). No-ops if the dir is read-only.
   * @param {string} dir - The project directory to install dependencies into.
   * @param {Object} input - Optional input with an `add` array of package descriptors ({name, version}) to ensure.
   * @returns {Effect} An Effect that completes once the directory is up to date (yields nothing).
   */
  const install = Effect.fn("Npm.install")(function* (dir, input) {
    const canWrite = yield* afs.access(dir, {
      writable: true
    }).pipe(Effect.as(true), Effect.orElseSucceed(() => false));
    if (!canWrite) return;
    const add = input?.add.map(pkg => [pkg.name, pkg.version].filter(Boolean).join("@")) ?? [];
    if (yield* Effect.gen(function* () {
      const nodeModulesExists = yield* afs.existsSafe(path.join(dir, "node_modules"));
      if (!nodeModulesExists) {
        yield* reify({
          add,
          dir
        });
        return true;
      }
      return false;
    }).pipe(Effect.withSpan("Npm.checkNodeModules"))) return;
    yield* Effect.gen(function* () {
      const pkg = yield* afs.readJson(path.join(dir, "package.json")).pipe(Effect.orElseSucceed(() => ({})));
      const lock = yield* afs.readJson(path.join(dir, "package-lock.json")).pipe(Effect.orElseSucceed(() => ({})));
      const pkgAny = pkg;
      const lockAny = lock;
      const declared = new Set([...Object.keys(pkgAny?.dependencies || {}), ...Object.keys(pkgAny?.devDependencies || {}), ...Object.keys(pkgAny?.peerDependencies || {}), ...Object.keys(pkgAny?.optionalDependencies || {}), ...(input?.add || []).map(pkg => pkg.name)]);
      const root = lockAny?.packages?.[""] || {};
      const locked = new Set([...Object.keys(root?.dependencies || {}), ...Object.keys(root?.devDependencies || {}), ...Object.keys(root?.peerDependencies || {}), ...Object.keys(root?.optionalDependencies || {})]);
      for (const name of declared) {
        if (!locked.has(name)) {
          yield* reify({
            dir,
            add
          });
          return;
        }
      }
    }).pipe(Effect.withSpan("Npm.checkDirty"));
    return;
  }, Effect.scoped);
  /**
   * Resolves the path to a package's installed binary, optionally installing the package first when downloads are enabled.
   * @param {string} pkg - The package specifier providing the binary.
   * @param {string} bin - Optional specific bin name to select when the package exposes several.
   * @returns {Effect} An Effect yielding an Option of the absolute bin path (none when unresolved or download disabled).
   */
  const which = Effect.fn("Npm.which")(function* (pkg, bin) {
    const dir = directory(pkg);
    const binDir = path.join(dir, "node_modules", ".bin");
    /**
     * Picks the appropriate bin name from the package's .bin directory and package.json `bin` field.
     * @returns {Effect} An Effect yielding an Option of the chosen bin file name.
     */
    const pick = Effect.fnUntraced(function* () {
      const files = yield* fs.readDirectory(binDir).pipe(Effect.catch(() => Effect.succeed([])));
      if (files.length === 0) return Option.none();
      // Caller picked a specific bin (e.g. pyright exposes both `pyright` and
      // `pyright-langserver`); trust the hint if the package provides it.
      if (bin) return files.includes(bin) ? Option.some(bin) : Option.none();
      if (files.length === 1) return Option.some(files[0]);
      const pkgJson = yield* afs.readJson(path.join(dir, "node_modules", pkg, "package.json")).pipe(Effect.option);
      if (Option.isSome(pkgJson)) {
        const parsed = pkgJson.value;
        if (parsed?.bin) {
          const unscoped = pkg.startsWith("@") ? pkg.split("/")[1] : pkg;
          const parsedBin = parsed.bin;
          if (typeof parsedBin === "string") return Option.some(unscoped);
          const keys = Object.keys(parsedBin);
          if (keys.length === 1) return Option.some(keys[0]);
          return parsedBin[unscoped] ? Option.some(unscoped) : Option.some(keys[0]);
        }
      }
      return Option.some(files[0]);
    });
    return yield* Effect.gen(function* () {
      const bin = yield* pick();
      if (Option.isSome(bin)) {
        return Option.some(path.join(binDir, bin.value));
      }
      // Do not auto-install dev tooling (LSP servers, formatters, ...) by default:
      // that is unsolicited network egress. Already-installed tools above still
      // resolve; opt in to fetching missing ones with CLOSEDCODE_ENABLE_TOOL_DOWNLOAD=1
      // (CLOSEDCODE_ENABLE_LSP_DOWNLOAD also works).
      const allowDownload = ["1", "true"].includes(process.env["CLOSEDCODE_ENABLE_TOOL_DOWNLOAD"]) || ["1", "true"].includes(process.env["CLOSEDCODE_ENABLE_LSP_DOWNLOAD"]);
      if (!allowDownload) {
        return Option.none();
      }
      yield* fs.remove(path.join(dir, "package-lock.json")).pipe(Effect.orElseSucceed(() => {}));
      yield* add(pkg);
      const resolved = yield* pick();
      if (Option.isNone(resolved)) return Option.none();
      return Option.some(path.join(binDir, resolved.value));
    }).pipe(Effect.scoped, Effect.orElseSucceed(() => Option.none()));
  });
  return Service.of({
    add,
    install,
    which
  });
}));
/** The Npm service layer with all of its dependencies (flock, filesystem, global paths) provided. */
export const defaultLayer = layer.pipe(Layer.provide(EffectFlock.layer), Layer.provide(AppFileSystem.layer), Layer.provide(Global.layer), Layer.provide(NodeFileSystem.layer));
const {
  runPromise
} = makeRuntime(Service, defaultLayer);
/**
 * Promise wrapper around the service `install` operation, running it on the default runtime.
 * @param {...*} args - Arguments forwarded to the service install (dir, input).
 * @returns {Promise} A promise resolving once installation completes.
 */
export async function install(...args) {
  return runPromise(svc => svc.install(...args));
}
/**
 * Promise wrapper around the service `add` operation, returning a plain (non-Option) result.
 * @param {...*} args - Arguments forwarded to the service add (the package specifier).
 * @returns {Promise<Object>} A promise resolving to an object with `directory` and `entrypoint` (undefined when unresolved).
 */
export async function add(...args) {
  const entry = await runPromise(svc => svc.add(...args));
  return {
    directory: entry.directory,
    entrypoint: Option.getOrUndefined(entry.entrypoint)
  };
}
/**
 * Promise wrapper around the service `which` operation, returning a plain bin path or undefined.
 * @param {...*} args - Arguments forwarded to the service which (the package specifier and optional bin name).
 * @returns {Promise<string>} A promise resolving to the absolute bin path, or undefined when unresolved.
 */
export async function which(...args) {
  const resolved = await runPromise(svc => svc.which(...args));
  return Option.getOrUndefined(resolved);
}