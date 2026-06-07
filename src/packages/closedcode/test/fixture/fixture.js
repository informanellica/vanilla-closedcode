import {  $  } from "script/shell"
import * as Observability from "core/effect/observability";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {  Effect, Context, Layer, ManagedRuntime  } from "effect"
import {  CrossSpawnSpawner  } from "core/cross-spawn-spawner"
import {  ChildProcess, ChildProcessSpawner  } from "effect/unstable/process"
import {  InstanceRef  } from "../../src/effect/instance-ref.js"
import {  InstanceBootstrap  } from "../../src/project/bootstrap-service.js"
import {  InstanceRuntime  } from "../../src/project/instance-runtime.js"
import {  InstanceStore  } from "../../src/project/instance-store.js"
import {  Instance  } from "../../src/project/instance.js"
import {  TestLLMServer  } from "../lib/llm-server.js"

const noopBootstrap = Layer.succeed(InstanceBootstrap.Service, InstanceBootstrap.Service.of({
  run: Effect.void,
}));
const testInstanceRuntime = ManagedRuntime.make(
  InstanceStore.defaultLayer.pipe(Layer.provide(noopBootstrap), Layer.provideMerge(Observability.layer)),
);
const runTestInstanceStore = (fn) => testInstanceRuntime.runPromise(InstanceStore.Service.use(fn));

export async function provideTestInstance(input) {
  const ctx = await runTestInstanceStore((store) => store.load({ directory: input.directory }));
  try {
    if (input.init) await testInstanceRuntime.runPromise(input.init.pipe(Effect.provideService(InstanceRef, ctx)));
    return await Instance.restore(ctx, () => input.fn());
  } finally {
    await runTestInstanceStore((store) => store.dispose(ctx));
  }
}

export async function reloadTestInstance(input) {
  return runTestInstanceStore((store) => store.reload(input));
}

export async function disposeAllInstances() {
  await Promise.all([InstanceRuntime.disposeAllInstances(), runTestInstanceStore((store) => store.disposeAll())]);
}

// Strip null bytes from paths (defensive fix for CI environment issues)
function sanitizePath(p) {
  return p.replace(/\0/g, "");
}
function exists(dir) {
  return fs.stat(dir).then(() => true).catch(() => false);
}
function clean(dir) {
  return fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
async function stop(dir) {
  if (!(await exists(dir))) return;
  await $`git fsmonitor--daemon stop`.cwd(dir).quiet().nothrow();
}

export async function tmpdir(options) {
  const dirpath = sanitizePath(path.join(os.tmpdir(), "closedcode-test-" + Math.random().toString(36).slice(2)));
  await fs.mkdir(dirpath, { recursive: true });
  if (options?.git) {
    await $`git init`.cwd(dirpath).quiet();
    await $`git config core.fsmonitor false`.cwd(dirpath).quiet();
    await $`git config commit.gpgsign false`.cwd(dirpath).quiet();
    await $`git config user.email "test@opencode.test"`.cwd(dirpath).quiet();
    await $`git config user.name "Test"`.cwd(dirpath).quiet();
    await $`git commit --allow-empty -m "root commit ${dirpath}"`.cwd(dirpath).quiet();
  }
  if (options?.config) {
    await fs.writeFile(
      path.join(dirpath, "opencode.json"),
      JSON.stringify({ ...options.config }),
    );
  }
  const realpath = sanitizePath(await fs.realpath(dirpath));
  const extra = await options?.init?.(realpath);
  const result = {
    [Symbol.asyncDispose]: async () => {
      try {
        await options?.dispose?.(realpath);
      } finally {
        if (options?.git) await stop(realpath).catch(() => undefined);
        await clean(realpath).catch(() => undefined);
      }
    },
    path: realpath,
    extra: extra,
  };
  return result;
}

/** Effectful scoped tmpdir. Cleaned up when the scope closes. Make sure these stay in sync */
export function tmpdirScoped(options) {
  return Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const dirpath = sanitizePath(path.join(os.tmpdir(), "closedcode-test-" + Math.random().toString(36).slice(2)));
    yield* Effect.promise(() => fs.mkdir(dirpath, { recursive: true }));
    const dir = sanitizePath(yield* Effect.promise(() => fs.realpath(dirpath)));
    yield* Effect.addFinalizer(() =>
      Effect.promise(async () => {
        if (options?.git) await stop(dir).catch(() => undefined);
        await clean(dir).catch(() => undefined);
      }),
    );
    const git = (...args) =>
      spawner.spawn(ChildProcess.make("git", args, { cwd: dir })).pipe(Effect.flatMap((handle) => handle.exitCode));
    if (options?.git) {
      yield* git("init");
      yield* git("config", "core.fsmonitor", "false");
      yield* git("config", "commit.gpgsign", "false");
      yield* git("config", "user.email", "test@opencode.test");
      yield* git("config", "user.name", "Test");
      yield* git("commit", "--allow-empty", "-m", "root commit");
    }
    if (options?.config) {
      yield* Effect.promise(() =>
        fs.writeFile(
          path.join(dir, "opencode.json"),
          JSON.stringify({ ...options.config }),
        ),
      );
    }
    return dir;
  });
}

export const provideInstance = (directory) => (self) =>
  Effect.contextWith((services) =>
    Effect.promise(async () => {
      const ctx = await runTestInstanceStore((store) => store.load({ directory }));
      return Instance.restore(ctx, () =>
        Effect.runPromiseWith(services)(self.pipe(Effect.provideService(InstanceRef, ctx))),
      );
    }),
  );

export function provideTmpdirInstance(self, options) {
  return Effect.gen(function* () {
    const dir = yield* tmpdirScoped(options);
    let provided = false;
    yield* Effect.addFinalizer(() =>
      provided
        ? Effect.promise(() =>
            runTestInstanceStore((store) =>
              store.load({ directory: dir }).pipe(Effect.flatMap((ctx) => store.dispose(ctx))),
            ),
          ).pipe(Effect.ignore)
        : Effect.void,
    );
    provided = true;
    return yield* self(dir).pipe(provideInstance(dir));
  });
}

export class TestInstance extends Context.Service()("@test/Instance") {}

export const withTmpdirInstance = (options) => (self) =>
  Effect.gen(function* () {
    const directory = yield* tmpdirScoped(options);
    return yield* InstanceStore.Service.use((store) =>
      store.provide(
        { directory },
        self.pipe(Effect.provideService(TestInstance, { directory })),
      ),
    );
  }).pipe(
    Effect.provide(InstanceStore.defaultLayer.pipe(Layer.provide(noopBootstrap))),
    Effect.provide(CrossSpawnSpawner.defaultLayer),
  );

export function provideTmpdirServer(self, options) {
  return Effect.gen(function* () {
    const llm = yield* TestLLMServer;
    return yield* provideTmpdirInstance(
      (dir) => self({ dir, llm }),
      { git: options?.git, config: options?.config?.(llm.url) },
    );
  });
}
