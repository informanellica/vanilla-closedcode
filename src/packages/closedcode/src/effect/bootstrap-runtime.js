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
export const BootstrapLayer = Layer.mergeAll(Config.defaultLayer, Plugin.defaultLayer, ShareNext.defaultLayer, Format.defaultLayer, LSP.defaultLayer, File.defaultLayer, FileWatcher.defaultLayer, Vcs.defaultLayer, Snapshot.defaultLayer, Bus.defaultLayer).pipe(Layer.provide(Observability.layer));
export const BootstrapRuntime = ManagedRuntime.make(BootstrapLayer, {
  memoMap
});