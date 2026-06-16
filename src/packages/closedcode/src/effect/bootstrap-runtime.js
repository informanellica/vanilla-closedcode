/** @file Minimal bootstrap Effect layer/runtime providing the subset of services needed during early startup (config, plugins, share, format, LSP, file/watcher, vcs, snapshot, bus). */
import { Layer, ManagedRuntime } from "effect";
import { Plugin } from "#plugin/index.js";
import { LSP } from "#lsp/lsp.js";
import { FileWatcher } from "#file/watcher.js";
import { Format } from "#format/index.js";
import { ShareNext } from "#share/share-next.js";
import { File } from "#file/index.js";
import { Vcs } from "#project/vcs.js";
import { Snapshot } from "#snapshot/index.js";
import { Bus } from "#bus/index.js";
import { Config } from "#config/config.js";
import * as Observability from "core/effect/observability";
import { memoMap } from "core/effect/memo-map";
/** The bootstrap Effect layer: the minimal set of services for early startup, with observability provided. */
export const BootstrapLayer = Layer.mergeAll(Config.defaultLayer, Plugin.defaultLayer, ShareNext.defaultLayer, Format.defaultLayer, LSP.defaultLayer, File.defaultLayer, FileWatcher.defaultLayer, Vcs.defaultLayer, Snapshot.defaultLayer, Bus.defaultLayer).pipe(Layer.provide(Observability.layer));
/** ManagedRuntime built from BootstrapLayer for running early-startup effects. */
export const BootstrapRuntime = ManagedRuntime.make(BootstrapLayer, {
  memoMap
});