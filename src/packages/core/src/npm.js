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
export class InstallFailedError extends Schema.TaggedErrorClass()("NpmInstallFailedError", {
  add: Schema.Array(Schema.String).pipe(Schema.optional),
  dir: Schema.String,
  cause: Schema.optional(Schema.Defect)
}) {}
export class Service extends Context.Service()("@closedcode/Npm") {}
const illegal = process.platform === "win32" ? new Set(["<", ">", ":", '"', "|", "?", "*"]) : undefined;
export function sanitize(pkg) {
  if (!illegal) return pkg;
  return Array.from(pkg, char => illegal.has(char) || char.charCodeAt(0) < 32 ? "_" : char).join("");
}
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
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const afs = yield* AppFileSystem.Service;
  const global = yield* Global.Service;
  const fs = yield* FileSystem.FileSystem;
  const flock = yield* EffectFlock.Service;
  const directory = pkg => path.join(global.cache, "packages", sanitize(pkg));
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
  const which = Effect.fn("Npm.which")(function* (pkg, bin) {
    const dir = directory(pkg);
    const binDir = path.join(dir, "node_modules", ".bin");
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
export const defaultLayer = layer.pipe(Layer.provide(EffectFlock.layer), Layer.provide(AppFileSystem.layer), Layer.provide(Global.layer), Layer.provide(NodeFileSystem.layer));
const {
  runPromise
} = makeRuntime(Service, defaultLayer);
export async function install(...args) {
  return runPromise(svc => svc.install(...args));
}
export async function add(...args) {
  const entry = await runPromise(svc => svc.add(...args));
  return {
    directory: entry.directory,
    entrypoint: Option.getOrUndefined(entry.entrypoint)
  };
}
export async function which(...args) {
  const resolved = await runPromise(svc => svc.which(...args));
  return Option.getOrUndefined(resolved);
}