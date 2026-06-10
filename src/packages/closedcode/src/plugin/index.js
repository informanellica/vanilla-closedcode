import { Config } from "#config/config.js";
import { Bus } from "../bus/index.js";
import * as Log from "core/util/log";
import { createOpencodeClient } from "sdk";
import { Flag } from "core/flag/flag";
import { Session } from "#session/session.js";
import { NamedError } from "core/util/error";
import { Effect, Layer, Context, Stream } from "effect";
import { EffectBridge } from "#effect/bridge.js";
import { InstanceState } from "#effect/instance-state.js";
import { errorMessage } from "#util/error.js";
import { PluginLoader } from "./loader.js";
import { parsePluginSpecifier, readPluginId, readV1Plugin, resolvePluginId } from "./shared.js";
import { registerAdapter } from "#control-plane/adapters/index.js";
const log = Log.create({
  service: "plugin"
});

// Hook names that follow the (input, output) => Promise<void> trigger pattern

export class Service extends Context.Service()("@closedcode/Plugin") {}

// Built-in plugins that are directly imported (not installed from npm)
const INTERNAL_PLUGINS = [];
function isServerPlugin(value) {
  return typeof value === "function";
}
function getServerPlugin(value) {
  if (isServerPlugin(value)) return value;
  if (!value || typeof value !== "object" || !("server" in value)) return;
  if (!isServerPlugin(value.server)) return;
  return value.server;
}
function getLegacyPlugins(mod) {
  const seen = new Set();
  const result = [];
  for (const entry of Object.values(mod)) {
    if (seen.has(entry)) continue;
    seen.add(entry);
    const plugin = getServerPlugin(entry);
    if (!plugin) throw new TypeError("Plugin export is not a function");
    result.push(plugin);
  }
  return result;
}
async function applyPlugin(load, input, hooks) {
  const plugin = readV1Plugin(load.mod, load.spec, "server", "detect");
  if (plugin) {
    await resolvePluginId(load.source, load.spec, load.target, readPluginId(plugin.id, load.spec), load.pkg);
    hooks.push(await plugin.server(input, load.options));
    return;
  }
  for (const server of getLegacyPlugins(load.mod)) {
    hooks.push(await server(input, load.options));
  }
}
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const bus = yield* Bus.Service;
  const config = yield* Config.Service;
  const state = yield* InstanceState.make(Effect.fn("Plugin.state")(function* (ctx) {
    const hooks = [];
    const bridge = yield* EffectBridge.make();
    function publishPluginError(message) {
      bridge.fork(bus.publish(Session.Event.Error, {
        error: new NamedError.Unknown({
          message
        }).toObject()
      }));
    }
    const {
      Server
    } = yield* Effect.promise(() => import("../server/server.js"));
    const client = createOpencodeClient({
      baseUrl: "http://localhost:4096",
      directory: ctx.directory,
      headers: Flag.CLOSEDCODE_SERVER_PASSWORD ? {
        Authorization: `Basic ${Buffer.from(`${Flag.CLOSEDCODE_SERVER_USERNAME ?? "closedcode"}:${Flag.CLOSEDCODE_SERVER_PASSWORD}`).toString("base64")}`
      } : undefined,
      fetch: async (...args) => Server.Default().app.fetch(...args)
    });
    const cfg = yield* config.get();
    const input = {
      client,
      project: ctx.project,
      worktree: ctx.worktree,
      directory: ctx.directory,
      experimental_workspace: {
        register(type, adapter) {
          registerAdapter(ctx.project.id, type, adapter);
        }
      },
      get serverUrl() {
        return Server.url ?? new URL("http://localhost:4096");
      },
      // Shell ($) helper is not available; plugins must use child_process.
      $: undefined
    };
    for (const plugin of INTERNAL_PLUGINS) {
      log.info("loading internal plugin", {
        name: plugin.name
      });
      const init = yield* Effect.tryPromise({
        try: () => plugin(input),
        catch: err => {
          log.error("failed to load internal plugin", {
            name: plugin.name,
            error: err
          });
        }
      }).pipe(Effect.option);
      if (init._tag === "Some") hooks.push(init.value);
    }
    const plugins = Flag.CLOSEDCODE_PURE ? [] : cfg.plugin_origins ?? [];
    if (Flag.CLOSEDCODE_PURE && cfg.plugin_origins?.length) {
      log.info("skipping external plugins in pure mode", {
        count: cfg.plugin_origins.length
      });
    }
    if (plugins.length) yield* config.waitForDependencies();
    const loaded = yield* Effect.promise(() => PluginLoader.loadExternal({
      items: plugins,
      kind: "server",
      report: {
        start(candidate) {
          log.info("loading plugin", {
            path: candidate.plan.spec
          });
        },
        missing(candidate, _retry, message) {
          log.warn("plugin has no server entrypoint", {
            path: candidate.plan.spec,
            message
          });
        },
        error(candidate, _retry, stage, error, resolved) {
          const spec = candidate.plan.spec;
          const cause = error instanceof Error ? error.cause ?? error : error;
          const message = stage === "load" ? errorMessage(error) : errorMessage(cause);
          if (stage === "install") {
            const parsed = parsePluginSpecifier(spec);
            log.error("failed to install plugin", {
              pkg: parsed.pkg,
              version: parsed.version,
              error: message
            });
            publishPluginError(`Failed to install plugin ${parsed.pkg}@${parsed.version}: ${message}`);
            return;
          }
          if (stage === "compatibility") {
            log.warn("plugin incompatible", {
              path: spec,
              error: message
            });
            publishPluginError(`Plugin ${spec} skipped: ${message}`);
            return;
          }
          if (stage === "entry") {
            log.error("failed to resolve plugin server entry", {
              path: spec,
              error: message
            });
            publishPluginError(`Failed to load plugin ${spec}: ${message}`);
            return;
          }
          log.error("failed to load plugin", {
            path: spec,
            target: resolved?.entry,
            error: message
          });
          publishPluginError(`Failed to load plugin ${spec}: ${message}`);
        }
      }
    }));
    for (const load of loaded) {
      if (!load) continue;

      // Keep plugin execution sequential so hook registration and execution
      // order remains deterministic across plugin runs.
      yield* Effect.tryPromise({
        try: () => applyPlugin(load, input, hooks),
        catch: err => {
          const message = errorMessage(err);
          log.error("failed to load plugin", {
            path: load.spec,
            error: message
          });
          return message;
        }
      }).pipe(Effect.catch(() => {
        // TODO: make proper events for this
        // bus.publish(Session.Event.Error, {
        //   error: new NamedError.Unknown({
        //     message: `Failed to load plugin ${load.spec}: ${message}`,
        //   }).toObject(),
        // })
        return Effect.void;
      }));
    }

    // Notify plugins of current config
    for (const hook of hooks) {
      yield* Effect.tryPromise({
        try: () => Promise.resolve(hook.config?.(cfg)),
        catch: err => {
          log.error("plugin config hook failed", {
            error: err
          });
        }
      }).pipe(Effect.ignore);
    }

    // Subscribe to bus events, fiber interrupted when scope closes
    yield* bus.subscribeAll().pipe(Stream.runForEach(input => Effect.sync(() => {
      for (const hook of hooks) {
        void hook["event"]?.({
          event: input
        });
      }
    })), Effect.forkScoped);
    return {
      hooks
    };
  }));
  const trigger = Effect.fn("Plugin.trigger")(function* (name, input, output) {
    if (!name) return output;
    const s = yield* InstanceState.get(state);
    for (const hook of s.hooks) {
      const fn = hook[name];
      if (!fn) continue;
      yield* Effect.promise(async () => fn(input, output));
    }
    return output;
  });
  const list = Effect.fn("Plugin.list")(function* () {
    const s = yield* InstanceState.get(state);
    return s.hooks;
  });
  const init = Effect.fn("Plugin.init")(function* () {
    yield* InstanceState.get(state);
  });
  return Service.of({
    trigger,
    list,
    init
  });
}));
export const defaultLayer = layer.pipe(Layer.provide(Bus.layer), Layer.provide(Config.defaultLayer));
export * as Plugin from "./index.js";
