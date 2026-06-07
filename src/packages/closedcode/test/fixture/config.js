import {  Config  } from "@/config/config.js"
import {  emptyConsoleState  } from "@/config/console-state.js"
import {  Effect, Layer  } from "effect"
function make(overrides = {}) {
  return Config.Service.of({
    get: () => Effect.succeed({}),
    getGlobal: () => Effect.succeed({}),
    getConsoleState: () => Effect.succeed(emptyConsoleState),
    update: () => Effect.void,
    updateGlobal: (config) =>
      Effect.succeed({ info: config, changed: false }),
    invalidate: () => Effect.void,
    directories: () => Effect.succeed([]),
    waitForDependencies: () => Effect.void,
    ...overrides,
  });
}
function layer(overrides) {
  return Layer.succeed(Config.Service, make(overrides));
}
export { make, layer };
export * as TestConfig from "./config.js";
