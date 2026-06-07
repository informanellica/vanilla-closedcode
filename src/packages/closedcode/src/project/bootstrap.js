import { Plugin } from "../plugin/index.js";
import { Format } from "../format/index.js";
import { LSP } from "@/lsp/lsp.js";
import { File } from "../file/index.js";
import { Snapshot } from "../snapshot/index.js";
import * as Project from "./project.js";
import * as Vcs from "./vcs.js";
import { Bus } from "../bus/index.js";
import { InstanceState } from "@/effect/instance-state.js";
import { FileWatcher } from "@/file/watcher.js";
import { ShareNext } from "@/share/share-next.js";
import { Effect, Layer } from "effect";
import { Config } from "@/config/config.js";
import { Service } from "./bootstrap-service.js";
export { Service } from "./bootstrap-service.js";
export const layer = Layer.effect(Service, Effect.gen(function* () {
  // Yield each bootstrap dep at layer init so `run` itself has R = never.
  // InstanceStore imports only the lightweight tag from bootstrap-service.ts,
  // so it can depend on bootstrap without importing this implementation graph.
  const config = yield* Config.Service;
  const file = yield* File.Service;
  const fileWatcher = yield* FileWatcher.Service;
  const format = yield* Format.Service;
  const lsp = yield* LSP.Service;
  const plugin = yield* Plugin.Service;
  const project = yield* Project.Service;
  const shareNext = yield* ShareNext.Service;
  const snapshot = yield* Snapshot.Service;
  const vcs = yield* Vcs.Service;
  const run = Effect.gen(function* () {
    const ctx = yield* InstanceState.context;
    yield* Effect.logInfo("bootstrapping", {
      directory: ctx.directory
    });
    // everything depends on config so eager load it for nice traces
    yield* config.get();
    // Plugin can mutate config so it has to be initialized before anything else.
    yield* plugin.init();
    // Each service self-manages its own slow work via Effect.forkScoped against
    // its per-instance state scope. We just await materialization here.
    yield* Effect.forEach([lsp, shareNext, format, file, fileWatcher, vcs, snapshot, project], s => s.init().pipe(Effect.catchCause(cause => Effect.logWarning("init failed", {
      cause
    }))), {
      concurrency: "unbounded",
      discard: true
    }).pipe(Effect.withSpan("InstanceBootstrap.init"));
  }).pipe(Effect.withSpan("InstanceBootstrap"));
  return Service.of({
    run
  });
}));
export const defaultLayer = layer.pipe(Layer.provide([Bus.layer, Config.defaultLayer, File.defaultLayer, FileWatcher.defaultLayer, Format.defaultLayer, LSP.defaultLayer, Plugin.defaultLayer, Project.defaultLayer, ShareNext.defaultLayer, Snapshot.defaultLayer, Vcs.defaultLayer]));
export * as InstanceBootstrap from "./bootstrap.js";