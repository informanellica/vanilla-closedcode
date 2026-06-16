/**
 * @file Provider registry and model resolution. Loads provider definitions, merges
 * config/auth/env overrides, and exposes helpers — including the locality checks
 * that enforce closedcode's local-only egress policy — used to instantiate models.
 * @module closedcode/provider
 */

import fuzzysort from "fuzzysort";
import { Config } from "#config/config.js";
import { mapValues, mergeDeep, omit, pickBy, sortBy } from "remeda";
import { NoSuchModelError } from "ai";
import * as Log from "core/util/log";
import { Npm } from "core/npm";
import { Hash } from "core/util/hash";
import { Plugin } from "../plugin/index.js";
import * as ModelsDev from "./models.js";
import { Auth } from "../auth/index.js";
import { Env } from "../env/index.js";
import { Flag } from "core/flag/flag";
import { zod } from "#util/effect-zod.js";
import { namedSchemaError } from "#util/named-schema-error.js";
import { iife } from "#util/iife.js";
import { Global } from "core/global";
import path from "path";
import { pathToFileURL } from "url";
import { Effect, Layer, Context, Schema } from "effect";
import { InstanceState } from "#effect/instance-state.js";
import { AppFileSystem } from "core/filesystem";
import { isRecord } from "#util/record.js";
import { optionalOmitUndefined, withStatics } from "#util/schema.js";
import * as ProviderTransform from "./transform.js";
import { ModelID, ProviderID } from "./schema.js";
const log = Log.create({
  service: "provider"
});
/**
 * Determine whether a host string is a private/loopback/link-local IPv4 address
 * (loopback 127/8, RFC 1918 10/8, 172.16/12, 192.168/16, and link-local 169.254/16).
 * @param {string} host - The host string to test.
 * @returns {boolean} True for a private/loopback IPv4 address; false otherwise or when not an IPv4 literal.
 */
function isPrivateIPv4(host) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if ([a, b, Number(m[3]), Number(m[4])].some(n => n < 0 || n > 255)) return false;
  if (a === 127) return true;
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  return false;
}
/**
 * Determine whether a host string is a loopback/private/link-local IPv6 address
 * (::1 loopback, fc00::/7 unique-local, fe80::/10 link-local).
 * @param {string} host - The host string to test.
 * @returns {boolean} True for a loopback/private/link-local IPv6 address; false otherwise.
 */
function isPrivateIPv6(host) {
  const lower = host.toLowerCase();
  if (lower === "::1") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower.startsWith("fe80:") || lower.startsWith("fe80::")) return true;
  return false;
}
/**
 * Determine whether a URL points at the local machine or a private network. Treats
 * `localhost`, loopback, RFC 1918 / link-local IPv4, ULA / loopback / link-local
 * IPv6, and `.local` / `.lan` / `.internal` hostnames as local.
 * @param {string} url - The URL to inspect.
 * @returns {boolean} True when the URL host is local or private; false otherwise or when the URL is unparseable.
 */
export function isLocalURL(url) {
  try {
    let {
      hostname
    } = new URL(url);
    if (hostname.startsWith("[") && hostname.endsWith("]")) hostname = hostname.slice(1, -1);
    if (hostname === "localhost") return true;
    if (isPrivateIPv4(hostname)) return true;
    if (hostname.includes(":") && isPrivateIPv6(hostname)) return true;
    if (hostname.endsWith(".local") || hostname.endsWith(".lan") || hostname.endsWith(".internal")) return true;
    return false;
  } catch {
    return false;
  }
}
/**
 * Determine whether a provider talks only to local endpoints, checking its base URL
 * and every model's API URL via {@link isLocalURL}.
 * @param {Object} provider - The provider definition (`options.baseURL` and `models[id].api.url` are read).
 * @returns {boolean} True when the provider's base URL or any model URL is local.
 */
export function isLocalProvider(provider) {
  const baseURL = provider.options?.baseURL;
  if (typeof baseURL === "string" && isLocalURL(baseURL)) return true;
  return Object.values(provider.models ?? {}).some(model => {
    const url = model.api?.url;
    return typeof url === "string" && isLocalURL(url);
  });
}
/**
 * Wrap a Server-Sent-Events Response so that a stalled stream is aborted if no
 * chunk arrives within `ms`. Returns the response unchanged for non-positive
 * timeouts, bodyless responses, or non-SSE content types.
 * @param {Response} res - The fetch Response to wrap.
 * @param {number} ms - The per-chunk read timeout in milliseconds.
 * @param {AbortController} ctl - The controller aborted when a read times out.
 * @returns {Response} The original or a timeout-guarded Response.
 */
function wrapSSE(res, ms, ctl) {
  if (typeof ms !== "number" || ms <= 0) return res;
  if (!res.body) return res;
  if (!res.headers.get("content-type")?.includes("text/event-stream")) return res;
  const reader = res.body.getReader();
  const body = new ReadableStream({
    async pull(ctrl) {
      const part = await new Promise((resolve, reject) => {
        const id = setTimeout(() => {
          const err = new Error("SSE read timed out");
          ctl.abort(err);
          void reader.cancel(err);
          reject(err);
        }, ms);
        reader.read().then(part => {
          clearTimeout(id);
          resolve(part);
        }, err => {
          clearTimeout(id);
          reject(err);
        });
      });
      if (part.done) {
        ctrl.close();
        return;
      }
      ctrl.enqueue(part.value);
    },
    async cancel(reason) {
      ctl.abort(reason);
      await reader.cancel(reason);
    }
  });
  return new Response(body, {
    headers: new Headers(res.headers),
    status: res.status,
    statusText: res.statusText
  });
}
const BUNDLED_PROVIDERS = {
  "@ai-sdk/openai-compatible": () => import("@ai-sdk/openai-compatible").then(m => m.createOpenAICompatible)
};
const ProviderApiInfo = Schema.Struct({
  id: Schema.String,
  url: Schema.String,
  npm: Schema.String
});
const ProviderModalities = Schema.Struct({
  text: Schema.Boolean,
  audio: Schema.Boolean,
  image: Schema.Boolean,
  video: Schema.Boolean,
  pdf: Schema.Boolean
});
const ProviderInterleaved = Schema.Union([Schema.Boolean, Schema.Struct({
  field: Schema.Literals(["reasoning_content", "reasoning_details"])
})]);
const ProviderCapabilities = Schema.Struct({
  temperature: Schema.Boolean,
  reasoning: Schema.Boolean,
  attachment: Schema.Boolean,
  toolcall: Schema.Boolean,
  input: ProviderModalities,
  output: ProviderModalities,
  interleaved: ProviderInterleaved
});
const ProviderCacheCost = Schema.Struct({
  read: Schema.Finite,
  write: Schema.Finite
});
const ProviderCost = Schema.Struct({
  input: Schema.Finite,
  output: Schema.Finite,
  cache: ProviderCacheCost,
  experimentalOver200K: optionalOmitUndefined(Schema.Struct({
    input: Schema.Finite,
    output: Schema.Finite,
    cache: ProviderCacheCost
  }))
});
const ProviderLimit = Schema.Struct({
  context: Schema.Finite,
  input: optionalOmitUndefined(Schema.Finite),
  output: Schema.Finite
});
/** Schema for a fully-resolved model (merged from models.dev, config, env, and auth). */
export const Model = Schema.Struct({
  id: ModelID,
  providerID: ProviderID,
  api: ProviderApiInfo,
  name: Schema.String,
  family: optionalOmitUndefined(Schema.String),
  capabilities: ProviderCapabilities,
  cost: ProviderCost,
  limit: ProviderLimit,
  status: Schema.Literals(["alpha", "beta", "deprecated", "active"]),
  options: Schema.Record(Schema.String, Schema.Any),
  headers: Schema.Record(Schema.String, Schema.String),
  release_date: Schema.String,
  variants: optionalOmitUndefined(Schema.Record(Schema.String, Schema.Record(Schema.String, Schema.Any)))
}).annotate({
  identifier: "Model"
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
/** Schema for a resolved provider, including its source, env var names, key, and models. */
export const Info = Schema.Struct({
  id: ProviderID,
  name: Schema.String,
  source: Schema.Literals(["env", "config", "custom", "api"]),
  env: Schema.Array(Schema.String),
  key: optionalOmitUndefined(Schema.String),
  options: Schema.Record(Schema.String, Schema.Any),
  models: Schema.Record(Schema.String, Model)
}).annotate({
  identifier: "Provider"
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
const DefaultModelIDs = Schema.Record(Schema.String, Schema.String);
/** Schema for the /provider list response: all providers, default model per provider, and connected ids. */
export const ListResult = Schema.Struct({
  all: Schema.Array(Info),
  default: DefaultModelIDs,
  connected: Schema.Array(Schema.String)
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
/** Schema for the config-providers response: the config-defined providers and their default models. */
export const ConfigProvidersResult = Schema.Struct({
  providers: Schema.Array(Info),
  default: DefaultModelIDs
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
/**
 * Pick a default model id for each provider — the top of {@link sort}'s ordering.
 * Providers with no models are skipped (rather than crashing) so they still list.
 * @param {Object} providers - Map from provider id to a provider object with a `models` record.
 * @returns {Object} Map from provider id to its chosen default model id.
 */
export function defaultModelIDs(providers) {
  // A config-defined local provider (e.g. a freshly added Ollama endpoint) may
  // have zero models until they are pulled. sort([])[0] is undefined, so reading
  // `.id` would throw and crash the whole /provider route (HTTP 500), which is
  // why such a provider never appeared in the UI list. Skip providers with no
  // models so they still show up (just without a preselected default model).
  const result = {};
  for (const [providerID, item] of Object.entries(providers)) {
    const top = sort(Object.values(item.models))[0];
    if (top) result[providerID] = top.id;
  }
  return result;
}
/** Effect Context tag for the Provider service. */
export class Service extends Context.Service()("@closedcode/Provider") {}
/**
 * Convert a models.dev cost record into the internal cost shape, defaulting
 * missing fields to 0 and carrying over the optional >200k-context override.
 * @param {Object} c - The models.dev cost record (may be undefined).
 * @returns {Object} The internal cost object `{input, output, cache: {read, write}, ...}`.
 */
function cost(c) {
  const result = {
    input: c?.input ?? 0,
    output: c?.output ?? 0,
    cache: {
      read: c?.cache_read ?? 0,
      write: c?.cache_write ?? 0
    }
  };
  if (c?.context_over_200k) {
    result.experimentalOver200K = {
      cache: {
        read: c.context_over_200k.cache_read ?? 0,
        write: c.context_over_200k.cache_write ?? 0
      },
      input: c.context_over_200k.input,
      output: c.context_over_200k.output
    };
  }
  return result;
}
/**
 * Build an internal Model from a models.dev provider+model pair, deriving API
 * info, capabilities/modalities, cost, limits, and reasoning-effort variants.
 * @param {Object} provider - The models.dev provider record.
 * @param {Object} model - The models.dev model record.
 * @returns {Object} The internal Model object (with `variants` populated).
 */
function fromModelsDevModel(provider, model) {
  const base = {
    id: ModelID.make(model.id),
    providerID: ProviderID.make(provider.id),
    name: model.name,
    family: model.family,
    api: {
      id: model.id,
      url: model.provider?.api ?? provider.api ?? "",
      npm: model.provider?.npm ?? provider.npm ?? "@ai-sdk/openai-compatible"
    },
    status: model.status ?? "active",
    headers: {},
    options: {},
    cost: cost(model.cost),
    limit: {
      context: model.limit.context,
      input: model.limit.input,
      output: model.limit.output
    },
    capabilities: {
      temperature: model.temperature ?? false,
      reasoning: model.reasoning ?? false,
      attachment: model.attachment ?? false,
      toolcall: model.tool_call ?? true,
      input: {
        text: model.modalities?.input?.includes("text") ?? false,
        audio: model.modalities?.input?.includes("audio") ?? false,
        image: model.modalities?.input?.includes("image") ?? false,
        video: model.modalities?.input?.includes("video") ?? false,
        pdf: model.modalities?.input?.includes("pdf") ?? false
      },
      output: {
        text: model.modalities?.output?.includes("text") ?? false,
        audio: model.modalities?.output?.includes("audio") ?? false,
        image: model.modalities?.output?.includes("image") ?? false,
        video: model.modalities?.output?.includes("video") ?? false,
        pdf: model.modalities?.output?.includes("pdf") ?? false
      },
      interleaved: model.interleaved ?? false
    },
    release_date: model.release_date ?? "",
    variants: {}
  };
  return {
    ...base,
    variants: mapValues(ProviderTransform.variants(base), v => v)
  };
}
/**
 * Build an internal provider record from a models.dev provider, expanding each
 * model and adding synthetic `<id>-<mode>` entries for any experimental modes
 * (merging their cost/body/header overrides on top of the base model).
 * @param {Object} provider - The models.dev provider record.
 * @returns {Object} The internal provider object with id, name, env, and models.
 */
export function fromModelsDevProvider(provider) {
  const models = {};
  for (const [key, model] of Object.entries(provider.models)) {
    models[key] = fromModelsDevModel(provider, model);
    for (const [mode, opts] of Object.entries(model.experimental?.modes ?? {})) {
      const id = `${model.id}-${mode}`;
      const base = fromModelsDevModel(provider, model);
      models[id] = {
        ...base,
        id: ModelID.make(id),
        name: `${model.name} ${mode[0].toUpperCase()}${mode.slice(1)}`,
        cost: opts.cost ? mergeDeep(base.cost, cost(opts.cost)) : base.cost,
        options: opts.provider?.body ? Object.fromEntries(Object.entries(opts.provider.body).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v])) : base.options,
        headers: opts.provider?.headers ?? base.headers
      };
    }
  }
  return {
    id: ProviderID.make(provider.id),
    source: "custom",
    name: provider.name,
    env: [...(provider.env ?? [])],
    options: {},
    models
  };
}
/**
 * Layer building the Provider service. Resolves the full provider/model database
 * by merging the models.dev snapshot with plugin hooks, config, environment
 * variables, and stored auth — enforcing the local-only policy by dropping any
 * non-local provider — and exposes the lookup/SDK-resolution operations.
 */
const layer = Layer.effect(Service, Effect.gen(function* () {
  const fs = yield* AppFileSystem.Service;
  const config = yield* Config.Service;
  const auth = yield* Auth.Service;
  const env = yield* Env.Service;
  const plugin = yield* Plugin.Service;
  const modelsDevSvc = yield* ModelsDev.Service;
  const state = yield* InstanceState.make(() => Effect.gen(function* () {
    using _ = log.time("state");
    const cfg = yield* config.get();
    const modelsDev = yield* modelsDevSvc.get();
    const database = mapValues(modelsDev, fromModelsDevProvider);
    const providers = {};
    const languages = new Map();
    const modelLoaders = {};
    const varsLoaders = {};
    const sdk = new Map();
    log.info("init");
    /**
     * Deep-merge a partial provider into the resolved `providers` map, seeding
     * from the models.dev `database` entry on first sight (and ignoring unknown ids).
     * @param {string} providerID - The provider id.
     * @param {Object} provider - The partial provider to merge in.
     * @returns {void}
     */
    function mergeProvider(providerID, provider) {
      const existing = providers[providerID];
      if (existing) {
        providers[providerID] = mergeDeep(existing, provider);
        return;
      }
      const match = database[providerID];
      if (!match) return;
      providers[providerID] = mergeDeep(match, provider);
    }

    // load plugins first so config() hook runs before reading cfg.provider
    const plugins = yield* plugin.list();

    // now read config providers - includes any modifications from plugin config() hook
    const configProviders = Object.entries(cfg.provider ?? {});
    const disabled = new Set(cfg.disabled_providers ?? []);
    const enabled = cfg.enabled_providers ? new Set(cfg.enabled_providers) : null;
    /**
     * Apply the config allow/deny lists: a provider must be in `enabled_providers`
     * (when that list is set) and absent from `disabled_providers`.
     * @param {string} providerID - The provider id to check.
     * @returns {boolean} True when the provider is allowed by config.
     */
    function isProviderAllowed(providerID) {
      if (enabled && !enabled.has(providerID)) return false;
      if (disabled.has(providerID)) return false;
      return true;
    }
    for (const hook of plugins) {
      const p = hook.provider;
      const models = p?.models;
      if (!p || !models) continue;
      const providerID = ProviderID.make(p.id);
      if (disabled.has(providerID)) continue;
      const provider = database[providerID];
      if (!provider) continue;
      const pluginAuth = yield* auth.get(providerID).pipe(Effect.orDie);
      provider.models = yield* Effect.promise(async () => {
        const next = await models(provider, {
          auth: pluginAuth
        });
        return Object.fromEntries(Object.entries(next).map(([id, model]) => [id, {
          ...model,
          id: ModelID.make(id),
          providerID
        }]));
      });
    }

    // extend database from config
    for (const [providerID, provider] of configProviders) {
      const existing = database[providerID];
      const parsed = {
        id: ProviderID.make(providerID),
        name: provider.name ?? existing?.name ?? providerID,
        env: provider.env ?? existing?.env ?? [],
        options: mergeDeep(existing?.options ?? {}, provider.options ?? {}),
        source: "config",
        models: existing?.models ?? {}
      };
      for (const [modelID, model] of Object.entries(provider.models ?? {})) {
        const existingModel = parsed.models[model.id ?? modelID];
        const apiID = model.id ?? existingModel?.api.id ?? modelID;
        const apiNpm = model.provider?.npm ?? provider.npm ?? existingModel?.api.npm ?? modelsDev[providerID]?.npm ?? "@ai-sdk/openai-compatible";
        const name = iife(() => {
          if (model.name) return model.name;
          if (model.id && model.id !== modelID) return modelID;
          return existingModel?.name ?? modelID;
        });
        const parsedModel = {
          id: ModelID.make(modelID),
          api: {
            id: apiID,
            npm: apiNpm,
            url: model.provider?.api ?? provider?.api ?? existingModel?.api.url ?? modelsDev[providerID]?.api ?? ""
          },
          status: model.status ?? existingModel?.status ?? "active",
          name,
          providerID: ProviderID.make(providerID),
          capabilities: {
            temperature: model.temperature ?? existingModel?.capabilities.temperature ?? false,
            reasoning: model.reasoning ?? existingModel?.capabilities.reasoning ?? false,
            attachment: model.attachment ?? existingModel?.capabilities.attachment ?? false,
            toolcall: model.tool_call ?? existingModel?.capabilities.toolcall ?? true,
            input: {
              text: model.modalities?.input?.includes("text") ?? existingModel?.capabilities.input.text ?? true,
              audio: model.modalities?.input?.includes("audio") ?? existingModel?.capabilities.input.audio ?? false,
              image: model.modalities?.input?.includes("image") ?? existingModel?.capabilities.input.image ?? false,
              video: model.modalities?.input?.includes("video") ?? existingModel?.capabilities.input.video ?? false,
              pdf: model.modalities?.input?.includes("pdf") ?? existingModel?.capabilities.input.pdf ?? false
            },
            output: {
              text: model.modalities?.output?.includes("text") ?? existingModel?.capabilities.output.text ?? true,
              audio: model.modalities?.output?.includes("audio") ?? existingModel?.capabilities.output.audio ?? false,
              image: model.modalities?.output?.includes("image") ?? existingModel?.capabilities.output.image ?? false,
              video: model.modalities?.output?.includes("video") ?? existingModel?.capabilities.output.video ?? false,
              pdf: model.modalities?.output?.includes("pdf") ?? existingModel?.capabilities.output.pdf ?? false
            },
            interleaved: model.interleaved ?? existingModel?.capabilities.interleaved ?? false
          },
          cost: {
            input: model?.cost?.input ?? existingModel?.cost?.input ?? 0,
            output: model?.cost?.output ?? existingModel?.cost?.output ?? 0,
            cache: {
              read: model?.cost?.cache_read ?? existingModel?.cost?.cache.read ?? 0,
              write: model?.cost?.cache_write ?? existingModel?.cost?.cache.write ?? 0
            }
          },
          options: mergeDeep(existingModel?.options ?? {}, model.options ?? {}),
          limit: {
            context: model.limit?.context ?? existingModel?.limit?.context ?? 0,
            input: model.limit?.input ?? existingModel?.limit?.input,
            output: model.limit?.output ?? existingModel?.limit?.output ?? 0
          },
          headers: mergeDeep(existingModel?.headers ?? {}, model.headers ?? {}),
          family: model.family ?? existingModel?.family ?? "",
          release_date: model.release_date ?? existingModel?.release_date ?? "",
          variants: {}
        };
        const merged = mergeDeep(ProviderTransform.variants(parsedModel), model.variants ?? {});
        parsedModel.variants = mapValues(pickBy(merged, v => !v.disabled), v => omit(v, ["disabled"]));
        parsed.models[modelID] = parsedModel;
      }
      database[providerID] = parsed;
    }

    // load env
    const envs = yield* env.all();
    for (const [id, provider] of Object.entries(database)) {
      const providerID = ProviderID.make(id);
      if (disabled.has(providerID)) continue;
      const apiKey = provider.env.map(item => envs[item]).find(Boolean);
      if (!apiKey) continue;
      mergeProvider(providerID, {
        source: "env",
        key: provider.env.length === 1 ? apiKey : undefined
      });
    }

    // load apikeys
    const auths = yield* auth.all().pipe(Effect.orDie);
    for (const [id, provider] of Object.entries(auths)) {
      const providerID = ProviderID.make(id);
      if (disabled.has(providerID)) continue;
      if (provider.type === "api") {
        mergeProvider(providerID, {
          source: "api",
          key: provider.key
        });
      }
    }

    // plugin auth loader - database now has entries for config providers
    for (const plugin of plugins) {
      if (!plugin.auth) continue;
      const providerID = ProviderID.make(plugin.auth.provider);
      if (disabled.has(providerID)) continue;
      const stored = yield* auth.get(providerID).pipe(Effect.orDie);
      if (!stored) continue;
      if (!plugin.auth.loader) continue;
      const options = yield* Effect.promise(() => plugin.auth.loader(() => Effect.runPromise(auth.get(providerID).pipe(Effect.orDie)), database[plugin.auth.provider]));
      const opts = options ?? {};
      const patch = providers[providerID] ? {
        options: opts
      } : {
        source: "custom",
        options: opts
      };
      mergeProvider(providerID, patch);
    }

    // load config - re-apply with updated data
    for (const [id, provider] of configProviders) {
      const providerID = ProviderID.make(id);
      const partial = {
        source: "config"
      };
      if (provider.env) partial.env = provider.env;
      if (provider.name) partial.name = provider.name;
      if (provider.options) partial.options = provider.options;
      mergeProvider(providerID, partial);
    }
    for (const [id, provider] of Object.entries(providers)) {
      const providerID = ProviderID.make(id);
      if (!isProviderAllowed(providerID)) {
        delete providers[providerID];
        continue;
      }
      if (!isLocalProvider(provider)) {
        delete providers[providerID];
        continue;
      }
      const configProvider = cfg.provider?.[providerID];
      for (const [modelID, model] of Object.entries(provider.models)) {
        model.api.id = model.api.id ?? model.id ?? modelID;
        if (model.status === "alpha" && !Flag.CLOSEDCODE_ENABLE_EXPERIMENTAL_MODELS) delete provider.models[modelID];
        if (model.status === "deprecated") delete provider.models[modelID];
        if (configProvider?.blacklist && configProvider.blacklist.includes(modelID) || configProvider?.whitelist && !configProvider.whitelist.includes(modelID)) delete provider.models[modelID];
        if (!model.variants || Object.keys(model.variants).length === 0) {
          model.variants = mapValues(ProviderTransform.variants(model), v => v);
        }
        const configVariants = configProvider?.models?.[modelID]?.variants;
        if (configVariants && model.variants) {
          const merged = mergeDeep(model.variants, configVariants);
          model.variants = mapValues(pickBy(merged, v => !v.disabled), v => omit(v, ["disabled"]));
        }
      }
      if (Object.keys(provider.models).length === 0 && provider.source !== "config") {
        // A config-defined local provider (e.g. an Ollama endpoint the user just
        // added) may legitimately have no models yet — models get pulled/added
        // afterwards. Keep it so it still shows in the provider list; dropping it
        // here is why a freshly added Ollama provider never appeared (it has no
        // models-snapshot fallback the way lmstudio does).
        delete providers[providerID];
        continue;
      }
      log.info("found", {
        providerID
      });
    }
    return {
      models: languages,
      providers,
      sdk,
      modelLoaders,
      varsLoaders
    };
  }));
  // List all resolved providers (keyed by id).
  const list = Effect.fn("Provider.list")(() => InstanceState.use(state, s => s.providers));
  /**
   * Resolve (and cache) the AI-SDK provider instance for a model: assembles the
   * base URL, API key, and headers; installs a fetch wrapper that blocks any
   * non-local host (enforcing the local-only egress policy) and applies chunk/
   * request timeouts; then loads the bundled, npm-installed, or file:// provider
   * package. Wraps failures in {@link InitError}.
   * @param {Object} model - The resolved model (`providerID`, `api`, `headers`, ...).
   * @param {Object} s - The provider state (`providers`, `sdk` cache, `varsLoaders`).
   * @param {Object} envs - The environment variables used for URL interpolation.
   * @returns {Promise<Object>} The constructed provider SDK instance.
   */
  async function resolveSDK(model, s, envs) {
    try {
      using _ = log.time("getSDK", {
        providerID: model.providerID
      });
      const provider = s.providers[model.providerID];
      const options = {
        ...provider.options
      };
      if (model.api.npm.includes("@ai-sdk/openai-compatible") && options["includeUsage"] !== false) {
        options["includeUsage"] = true;
      }
      const baseURL = iife(() => {
        let url = typeof options["baseURL"] === "string" && options["baseURL"] !== "" ? options["baseURL"] : model.api.url;
        if (!url) return;
        const loader = s.varsLoaders[model.providerID];
        if (loader) {
          const vars = loader(options);
          for (const [key, value] of Object.entries(vars)) {
            const field = "${" + key + "}";
            url = url.replaceAll(field, value);
          }
        }
        url = url.replace(/\$\{([^}]+)\}/g, (item, key) => {
          const val = envs[String(key)];
          return val ?? item;
        });
        return url;
      });
      if (baseURL !== undefined) options["baseURL"] = baseURL;
      if (options["apiKey"] === undefined && provider.key) options["apiKey"] = provider.key;
      if (model.headers) options["headers"] = {
        ...options["headers"],
        ...model.headers
      };
      const key = Hash.fast(JSON.stringify({
        providerID: model.providerID,
        npm: model.api.npm,
        options
      }));
      const existing = s.sdk.get(key);
      if (existing) return existing;
      const customFetch = options["fetch"];
      const chunkTimeout = options["chunkTimeout"];
      delete options["chunkTimeout"];
      options["fetch"] = async (input, init) => {
        const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        let hostname;
        try {
          hostname = new URL(requestUrl).hostname;
        } catch {}
        if (hostname && !isLocalURL(requestUrl)) {
          throw new Error(`Blocked connection to external LLM provider (${hostname}). Only local LLM servers are allowed.`);
        }
        const fetchFn = customFetch ?? fetch;
        const opts = init ?? {};
        const chunkAbortCtl = typeof chunkTimeout === "number" && chunkTimeout > 0 ? new AbortController() : undefined;
        const signals = [];
        if (opts.signal) signals.push(opts.signal);
        if (chunkAbortCtl) signals.push(chunkAbortCtl.signal);
        if (options["timeout"] !== undefined && options["timeout"] !== null && options["timeout"] !== false) signals.push(AbortSignal.timeout(options["timeout"]));
        const combined = signals.length === 0 ? null : signals.length === 1 ? signals[0] : AbortSignal.any(signals);
        if (combined) opts.signal = combined;
        const res = await fetchFn(input, {
          ...opts,
          // Some fetch implementations reject timeout handling unless it is disabled.
          timeout: false
        });
        if (!chunkAbortCtl) return res;
        return wrapSSE(res, chunkTimeout, chunkAbortCtl);
      };
      const bundledLoader = BUNDLED_PROVIDERS[model.api.npm];
      if (bundledLoader) {
        log.info("using bundled provider", {
          providerID: model.providerID,
          pkg: model.api.npm
        });
        const factory = await bundledLoader();
        const loaded = factory({
          name: model.providerID,
          ...options
        });
        s.sdk.set(key, loaded);
        return loaded;
      }
      let installedPath;
      if (!model.api.npm.startsWith("file://")) {
        const item = await Npm.add(model.api.npm);
        if (!item.entrypoint) throw new Error(`Package ${model.api.npm} has no import entrypoint`);
        installedPath = item.entrypoint;
      } else {
        log.info("loading local provider", {
          pkg: model.api.npm
        });
        installedPath = model.api.npm;
      }

      // `installedPath` is a local entry path or an existing `file://` URL. Normalize
      // only path inputs so Node on Windows accepts the dynamic import.
      const importSpec = installedPath.startsWith("file://") ? installedPath : pathToFileURL(installedPath).href;
      const mod = await import(importSpec);
      const fn = mod[Object.keys(mod).find(key => key.startsWith("create"))];
      const loaded = fn({
        name: model.providerID,
        ...options
      });
      s.sdk.set(key, loaded);
      return loaded;
    } catch (e) {
      throw new InitError({
        providerID: model.providerID
      }, {
        cause: e
      });
    }
  }
  // Look up a resolved provider by id (undefined when not found).
  const getProvider = Effect.fn("Provider.getProvider")(providerID => InstanceState.use(state, s => s.providers[providerID]));
  // Look up a model by provider+model id, throwing ModelNotFoundError with fuzzy
  // suggestions when the provider or model is unknown.
  const getModel = Effect.fn("Provider.getModel")(function* (providerID, modelID) {
    const s = yield* InstanceState.get(state);
    const provider = s.providers[providerID];
    if (!provider) {
      const available = Object.keys(s.providers);
      const matches = fuzzysort.go(providerID, available, {
        limit: 3,
        threshold: -10000
      });
      throw new ModelNotFoundError({
        providerID,
        modelID,
        suggestions: matches.map(m => m.target)
      });
    }
    const info = provider.models[modelID];
    if (!info) {
      const available = Object.keys(provider.models);
      const matches = fuzzysort.go(modelID, available, {
        limit: 3,
        threshold: -10000
      });
      throw new ModelNotFoundError({
        providerID,
        modelID,
        suggestions: matches.map(m => m.target)
      });
    }
    return info;
  });
  // Resolve (and memoize) the AI-SDK language model for a model descriptor,
  // building the SDK via resolveSDK and mapping NoSuchModelError to ModelNotFoundError.
  const getLanguage = Effect.fn("Provider.getLanguage")(function* (model) {
    const s = yield* InstanceState.get(state);
    const envs = yield* env.all();
    const key = `${model.providerID}/${model.id}`;
    if (s.models.has(key)) return s.models.get(key);
    return yield* Effect.promise(async () => {
      const provider = s.providers[model.providerID];
      const sdk = await resolveSDK(model, s, envs);
      try {
        const language = s.modelLoaders[model.providerID] ? await s.modelLoaders[model.providerID](sdk, model.api.id, {
          ...provider.options,
          ...model.options
        }) : sdk.languageModel(model.api.id);
        s.models.set(key, language);
        return language;
      } catch (e) {
        if (e instanceof NoSuchModelError) throw new ModelNotFoundError({
          modelID: model.id,
          providerID: model.providerID
        }, {
          cause: e
        });
        throw e;
      }
    });
  });
  // Find the first model under a provider whose id contains one of the query
  // substrings (tried in order); returns undefined when nothing matches.
  const closest = Effect.fn("Provider.closest")(function* (providerID, query) {
    const s = yield* InstanceState.get(state);
    const provider = s.providers[providerID];
    if (!provider) return undefined;
    for (const item of query) {
      for (const modelID of Object.keys(provider.models)) {
        if (modelID.includes(item)) return {
          providerID,
          modelID
        };
      }
    }
    return undefined;
  });
  // Pick a small/auxiliary model: the configured small_model if set, else the
  // first provider model matching a priority substring (qwen/llama/gpt-oss).
  const getSmallModel = Effect.fn("Provider.getSmallModel")(function* (providerID) {
    const cfg = yield* config.get();
    if (cfg.small_model) {
      const parsed = parseModel(cfg.small_model);
      return yield* getModel(parsed.providerID, parsed.modelID);
    }
    const s = yield* InstanceState.get(state);
    const provider = s.providers[providerID];
    if (!provider) return undefined;
    const priority = ["qwen", "llama", "gpt-oss"];
    for (const item of priority) {
      for (const model of Object.keys(provider.models)) {
        if (model.includes(item)) return yield* getModel(providerID, ModelID.make(model));
      }
    }
    return undefined;
  });
  // Determine the default model: the configured `model`, else the most recently
  // used available model from state, else the first model of the first provider.
  const defaultModel = Effect.fn("Provider.defaultModel")(function* () {
    const cfg = yield* config.get();
    if (cfg.model) return parseModel(cfg.model);
    const s = yield* InstanceState.get(state);
    const recent = yield* fs.readJson(path.join(Global.Path.state, "model.json")).pipe(Effect.map(x => {
      if (!isRecord(x) || !Array.isArray(x.recent)) return [];
      return x.recent.flatMap(item => {
        if (!isRecord(item)) return [];
        if (typeof item.providerID !== "string") return [];
        if (typeof item.modelID !== "string") return [];
        return [{
          providerID: ProviderID.make(item.providerID),
          modelID: ModelID.make(item.modelID)
        }];
      });
    }), Effect.catch(() => Effect.succeed([])));
    for (const entry of recent) {
      const provider = s.providers[entry.providerID];
      if (!provider) continue;
      if (!provider.models[entry.modelID]) continue;
      return {
        providerID: entry.providerID,
        modelID: entry.modelID
      };
    }
    const provider = Object.values(s.providers).find(p => !cfg.provider || Object.keys(cfg.provider).includes(p.id));
    if (!provider) throw new Error("no providers found");
    const [model] = sort(Object.values(provider.models));
    if (!model) throw new Error("no models found");
    return {
      providerID: provider.id,
      modelID: model.id
    };
  });
  return Service.of({
    list,
    getProvider,
    getModel,
    getLanguage,
    closest,
    getSmallModel,
    defaultModel
  });
}));
/** The Provider layer with all its service dependencies provided. */
export const defaultLayer = Layer.suspend(() => layer.pipe(Layer.provide(AppFileSystem.defaultLayer), Layer.provide(Env.defaultLayer), Layer.provide(Config.defaultLayer), Layer.provide(Auth.defaultLayer), Layer.provide(Plugin.defaultLayer), Layer.provide(ModelsDev.defaultLayer)));
const priority = ["qwen", "llama", "gpt-oss"];
/**
 * Sort models into a preferred display order: by priority family
 * (qwen/llama/gpt-oss) first, then "latest"-tagged ids, then id descending.
 * @param {Array} models - The models to sort.
 * @returns {Array} The sorted models.
 */
export function sort(models) {
  return sortBy(models, [model => priority.findIndex(filter => model.id.includes(filter)), "desc"], [model => model.id.includes("latest") ? 0 : 1, "asc"], [model => model.id, "desc"]);
}
/**
 * Split a "provider/model" string into branded provider and model ids (the model
 * portion may itself contain slashes, which are rejoined).
 * @param {string} model - A "providerID/modelID" string.
 * @returns {Object} `{providerID, modelID}` with branded ids.
 */
export function parseModel(model) {
  const [providerID, ...rest] = model.split("/");
  return {
    providerID: ProviderID.make(providerID),
    modelID: ModelID.make(rest.join("/"))
  };
}
/** Error: the requested provider or model id was not found (carries fuzzy suggestions). */
export const ModelNotFoundError = namedSchemaError("ProviderModelNotFoundError", {
  providerID: ProviderID,
  modelID: ModelID,
  suggestions: Schema.optional(Schema.Array(Schema.String))
});
/** Error: the provider SDK could not be constructed (wraps the underlying cause). */
export const InitError = namedSchemaError("ProviderInitError", {
  providerID: ProviderID
});
export * as Provider from "./provider.js";
