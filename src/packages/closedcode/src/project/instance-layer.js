import { Effect, Layer } from "effect";
import { InstanceStore } from "./instance-store.js";
export const layer = Layer.unwrap(Effect.promise(async () => {
  const {
    InstanceBootstrap
  } = await import("./bootstrap.js");
  return InstanceStore.defaultLayer.pipe(Layer.provide(InstanceBootstrap.defaultLayer));
}));
export * as InstanceLayer from "./instance-layer.js";