/** @file HTTP API handlers for the "provider" group: listing available/connected providers and driving provider auth (methods, authorize, callback). */
import { ProviderAuth } from "#provider/auth.js";
import { Config } from "#config/config.js";
import { ModelsDev } from "#provider/models.js";
import { Provider } from "#provider/provider.js";
import { mapValues } from "remeda";
import { Effect, Schema } from "effect";
import { HttpServerResponse } from "effect/unstable/http";
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi";
import { InstanceHttpApi } from "../api.js";
/**
 * Registers the handlers for the "provider" HTTP API group on the instance API.
 * @type {Object}
 */
export const providerHandlers = HttpApiBuilder.group(InstanceHttpApi, "provider", handlers => Effect.gen(function* () {
  const cfg = yield* Config.Service;
  const provider = yield* Provider.Service;
  const svc = yield* ProviderAuth.Service;
  /**
   * Lists providers available to this instance: local providers from the models catalog (filtered by
   * enabled/disabled config) merged with already-connected providers, plus default model IDs and connected keys.
   * @returns {Effect} Effect yielding `{all, default, connected}`.
   */
  const list = Effect.fn("ProviderHttpApi.list")(function* () {
    const config = yield* cfg.get();
    const all = yield* ModelsDev.Service.use(s => s.get());
    const disabled = new Set(config.disabled_providers ?? []);
    const enabled = config.enabled_providers ? new Set(config.enabled_providers) : undefined;
    const filtered = {};
    for (const [key, value] of Object.entries(all)) {
      if ((enabled ? enabled.has(key) : true) && !disabled.has(key) && Provider.isLocalProvider(Provider.fromModelsDevProvider(value))) filtered[key] = value;
    }
    const connected = yield* provider.list();
    const providers = Object.assign(mapValues(filtered, item => Provider.fromModelsDevProvider(item)), connected);
    return {
      all: Object.values(providers),
      default: Provider.defaultModelIDs(providers),
      connected: Object.keys(connected)
    };
  });
  /**
   * Returns the supported auth methods per provider.
   * @returns {Effect} Effect yielding the auth methods.
   */
  const auth = Effect.fn("ProviderHttpApi.auth")(function* () {
    return yield* svc.methods();
  });
  /**
   * Authorizes a provider using the chosen method and inputs, failing with BadRequest on error.
   * @param {Object} ctx - Handler context; `params.providerID` is the provider, `payload` carries `method` and `inputs`.
   * @returns {Effect} Effect yielding the authorize result, or failing with HttpApiError.BadRequest.
   */
  const authorize = Effect.fn("ProviderHttpApi.authorize")(function* (ctx) {
    return yield* svc.authorize({
      providerID: ctx.params.providerID,
      method: ctx.payload.method,
      inputs: ctx.payload.inputs
    }).pipe(Effect.catch(() => Effect.fail(new HttpApiError.BadRequest({}))));
  });
  /**
   * Raw authorize handler that reads and decodes the JSON request body itself before delegating to `authorize`,
   * returning an empty 200 when there is no result or a JSON response otherwise.
   * @param {Object} ctx - Handler context; `params` carries the provider and `request` exposes the raw body.
   * @returns {Effect} Effect yielding an HTTP response (empty 200 or JSON), or failing with HttpApiError.BadRequest.
   */
  const authorizeRaw = Effect.fn("ProviderHttpApi.authorizeRaw")(function* (ctx) {
    const body = yield* Effect.orDie(ctx.request.text);
    const payload = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(ProviderAuth.AuthorizeInput))(body).pipe(Effect.mapError(() => new HttpApiError.BadRequest({})));
    const result = yield* authorize({
      params: ctx.params,
      payload
    });
    if (result === undefined) return HttpServerResponse.empty({
      status: 200
    });
    return HttpServerResponse.jsonUnsafe(result);
  });
  /**
   * Completes an OAuth-style provider auth flow with the returned code, failing with BadRequest on error.
   * @param {Object} ctx - Handler context; `params.providerID` is the provider, `payload` carries `method` and `code`.
   * @returns {Effect} Effect yielding `true` on success, or failing with HttpApiError.BadRequest.
   */
  const callback = Effect.fn("ProviderHttpApi.callback")(function* (ctx) {
    yield* svc.callback({
      providerID: ctx.params.providerID,
      method: ctx.payload.method,
      code: ctx.payload.code
    }).pipe(Effect.catch(() => Effect.fail(new HttpApiError.BadRequest({}))));
    return true;
  });
  return handlers.handle("list", list).handle("auth", auth).handleRaw("authorize", authorizeRaw).handle("callback", callback);
}));