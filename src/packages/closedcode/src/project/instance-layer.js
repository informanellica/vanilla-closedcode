/** @file Composed Effect layer wiring InstanceStore on top of the (lazily imported) InstanceBootstrap layer. */
import { Effect, Layer } from "effect";
import { InstanceStore } from "./instance-store.js";

/**
 * Layer that provides InstanceStore backed by the InstanceBootstrap default layer.
 * Bootstrap is imported dynamically so its heavy implementation graph is only
 * loaded when this layer is built.
 */
export const layer = Layer.unwrap(Effect.promise(async () => {
  const {
    InstanceBootstrap
  } = await import("./bootstrap.js");
  return InstanceStore.defaultLayer.pipe(Layer.provide(InstanceBootstrap.defaultLayer));
}));
export * as InstanceLayer from "./instance-layer.js";