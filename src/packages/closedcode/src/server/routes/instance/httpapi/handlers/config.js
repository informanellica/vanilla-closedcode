/** @file HttpApi handler implementations for the config group: read config, update config (marking the instance for disposal), and list providers with defaults. */
import { Config } from "#config/config.js";
import { Provider } from "#provider/provider.js";
import * as InstanceState from "#effect/instance-state.js";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { InstanceHttpApi } from "../api.js";
import { markInstanceForDisposal } from "../lifecycle.js";
/**
 * Builds the request handlers for the "config" HttpApi group, wiring the get,
 * update, and providers endpoints to the Config and Provider services.
 * @param {Object} handlers - The HttpApiBuilder handler registry for the config group.
 * @returns {Effect} An Effect that resolves to the registry with all config endpoints handled.
 */
export const configHandlers = HttpApiBuilder.group(InstanceHttpApi, "config", handlers => Effect.gen(function* () {
  const providerSvc = yield* Provider.Service;
  const configSvc = yield* Config.Service;
  /**
   * Handler for the "get" endpoint: returns the current resolved configuration.
   * @returns {Effect} An Effect resolving to the current config object.
   */
  const get = Effect.fn("ConfigHttpApi.get")(function* () {
    return yield* configSvc.get();
  });
  /**
   * Handler for the "update" endpoint: persists the new config and marks the
   * current instance for disposal so it reloads with the updated configuration.
   * @param {Object} ctx - The request context whose payload is the new config to apply.
   * @returns {Effect} An Effect resolving to the applied config payload.
   */
  const update = Effect.fn("ConfigHttpApi.update")(function* (ctx) {
    yield* configSvc.update(ctx.payload);
    yield* markInstanceForDisposal(yield* InstanceState.context);
    return ctx.payload;
  });
  /**
   * Handler for the "providers" endpoint: lists configured providers and the
   * default model IDs derived from them.
   * @returns {Effect} An Effect resolving to an object with the providers array and default model IDs.
   */
  const providers = Effect.fn("ConfigHttpApi.providers")(function* () {
    const providers = yield* providerSvc.list();
    return {
      providers: Object.values(providers),
      default: Provider.defaultModelIDs(providers)
    };
  });
  return handlers.handle("get", get).handle("update", update).handle("providers", providers);
}));