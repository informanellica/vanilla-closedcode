import { Effect, Schema } from "effect";
import { AppRuntime } from "@/effect/app-runtime.js";
import { InstanceStore } from "@/project/instance-store.js";
import { InstanceRef } from "@/effect/instance-ref.js";
import { Instance } from "@/project/instance.js";
import { cmd } from "./cmd/cmd.js";

/**
 * User-visible command failure. Throw via `fail("...")` from an effectCmd handler
 * to surface a printed message + non-zero exit. Recognised by the global error
 * formatter in `src/cli/error.ts` (FormatError), so the existing top-level
 * catch + cleanup in `src/index.ts` runs normally.
 */
export class CliError extends Schema.TaggedErrorClass()("CliError", {
  message: Schema.String,
  exitCode: Schema.optional(Schema.Number)
}) {}
export const fail = (message, exitCode = 1) => Effect.fail(new CliError({
  message,
  exitCode
}));
/**
 * Effect-native CLI command builder. Wraps yargs `cmd()` so the handler body is
 * an `Effect` with `InstanceRef` provided and any `AppServices` yieldable.
 *
 * The handler is wrapped in `Effect.ensuring(store.dispose(ctx))` so the loaded
 * InstanceContext is disposed (runDisposers + IPC `server.instance.disposed`)
 * on every Exit — success, typed failure, defect, or interruption. Matches the
 * legacy `bootstrap()` finally-disposal semantics without per-handler boilerplate.
 *
 * Errors propagate to the existing top-level handler in `src/index.ts`; use
 * `fail("...")` for user-visible domain failures (clean exit, formatted message).
 *
 * Handlers are typically `Effect.fn("Cli.<name>")(function*(args) { ... })`,
 * which adds a named tracing span per CLI invocation. Once all commands use
 * `effectCmd`, swapping the underlying `cmd()` factory for effect/cli's
 * `Command.make(...)` won't touch any handler bodies.
 */
export const effectCmd = opts => cmd({
  command: opts.command,
  aliases: opts.aliases,
  describe: opts.describe,
  builder: opts.builder,
  async handler(rawArgs) {
    // yargs typing wraps Args in ArgumentsCamelCase<WithDoubleDash<...>>; cast at the boundary.
    const args = rawArgs;
    const useInstance = typeof opts.instance === "function" ? opts.instance(args) : opts.instance !== false;
    if (!useInstance) {
      await AppRuntime.runPromise(opts.handler(args));
      return;
    }
    const directory = opts.directory?.(args) ?? process.cwd();
    // Two-phase: load ctx, then run body inside Instance.current ALS.
    // Effect's InstanceRef is provided via fiber context, but that context is
    // lost across `await` inside `Effect.promise(async () => ...)` callbacks
    // — when handlers re-enter Effect via `AppRuntime.runPromise(svc.method())`
    // there, attach() falls back to Instance.current ALS, which Node preserves
    // across awaits. Matches the pre-effectCmd `bootstrap()` behavior.
    const {
      store,
      ctx
    } = await AppRuntime.runPromise(InstanceStore.Service.use(store => store.load({
      directory
    }).pipe(Effect.map(ctx => ({
      store,
      ctx
    })))));
    try {
      await Instance.restore(ctx, () => AppRuntime.runPromise(opts.handler(args).pipe(Effect.provideService(InstanceRef, ctx))));
    } finally {
      await AppRuntime.runPromise(store.dispose(ctx));
    }
  }
});