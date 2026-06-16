/**
 * @file Configuration schema and loader. Defines the closedcode config shape and
 * merges layered sources (global, project `.closedcode`, env) into the effective
 * configuration consumed across the app.
 * @module closedcode/config
 */

import * as Log from "core/util/log";
import path from "path";
import { pathToFileURL } from "url";
import os from "os";
import z from "zod";
import { mergeDeep } from "remeda";
import { Global } from "core/global";
import fsNode from "fs/promises";
import { NamedError } from "core/util/error";
import { Flag } from "core/flag/flag";
import { Auth } from "../auth/index.js";
import { Env } from "../env/index.js";
import { applyEdits, modify } from "jsonc-parser";
import { InstallationLocal, InstallationVersion } from "core/installation/version";
import { existsSync } from "fs";
import { Account } from "#account/account.js";
import { isRecord } from "#util/record.js";
import { AppFileSystem } from "core/filesystem";
import { InstanceState } from "#effect/instance-state.js";
import { Context, Duration, Effect, Exit, Fiber, Layer, Option, Schema } from "effect";
import { EffectFlock } from "core/util/effect-flock";
import { containsPath } from "../project/instance-context.js";
import { zod } from "#util/effect-zod.js";
import { NonNegativeInt, PositiveInt, withStatics } from "#util/schema.js";
import { ConfigAgent } from "./agent.js";
import { ConfigCommand } from "./command.js";
import { ConfigFormatter } from "./formatter.js";
import { ConfigLayout } from "./layout.js";
import { ConfigLSP } from "./lsp.js";
import { ConfigManaged } from "./managed.js";
import { ConfigMCP } from "./mcp.js";
import { ConfigModelID } from "./model-id.js";
import { ConfigParse } from "./parse.js";
import { ConfigPaths } from "./paths.js";
import { ConfigPermission } from "./permission.js";
import { ConfigPlugin } from "./plugin.js";
import { ConfigProvider } from "./provider.js";
import { ConfigServer } from "./server.js";
import { ConfigSkills } from "./skills.js";
import { ConfigVariable } from "./variable.js";
import { Npm } from "core/npm";
const log = Log.create({
  service: "config"
});

// Custom merge function that concatenates array fields instead of replacing them
// Keep remeda's deep conditional merge type out of hot config-loading paths; TS profiling showed it dominates here.
function mergeConfig(target, source) {
  return mergeDeep(target, source);
}
function mergeConfigConcatArrays(target, source) {
  const merged = mergeConfig(target, source);
  if (target.instructions && source.instructions) {
    merged.instructions = Array.from(new Set([...target.instructions, ...source.instructions]));
  }
  return merged;
}
function normalizeLoadedConfig(data, source) {
  if (!isRecord(data)) return data;
  const copy = {
    ...data
  };
  const hadLegacy = "theme" in copy || "keybinds" in copy || "tui" in copy;
  if (!hadLegacy) return copy;
  delete copy.theme;
  delete copy.keybinds;
  delete copy.tui;
  log.warn("tui keys in closedcode config are deprecated; move them to tui.json", {
    path: source
  });
  return copy;
}
async function resolveLoadedPlugins(config, filepath) {
  if (!config.plugin) return config;
  for (let i = 0; i < config.plugin.length; i++) {
    // Normalize path-like plugin specs while we still know which config file declared them.
    // This prevents `./plugin.mjs` from being reinterpreted relative to some later merge location.
    config.plugin[i] = await ConfigPlugin.resolvePluginSpec(config.plugin[i], filepath);
  }
  return config;
}
export const Server = ConfigServer.Server.zod;
export const Layout = ConfigLayout.Layout.zod;
const LogLevelRef = Schema.Literals(["DEBUG", "INFO", "WARN", "ERROR"]).annotate({
  identifier: "LogLevel",
  description: "Log level"
});

// The Effect Schema is the canonical source of truth. The `.zod` compatibility
// surface is derived so existing Express validators keep working without a
// parallel Zod definition.
//
// The walker emits `z.object({...})` which is non-strict by default. Config
// historically uses `.strict()` (additionalProperties: false in openapi.json),
// so layer that on after derivation.  Re-apply the Config ref afterward
// since `.strict()` strips the walker's meta annotation.
export const Info = Schema.Struct({
  $schema: Schema.optional(Schema.String).annotate({
    description: "JSON schema reference for configuration validation"
  }),
  shell: Schema.optional(Schema.String).annotate({
    description: "Default shell to use for terminal and bash tool"
  }),
  logLevel: Schema.optional(LogLevelRef).annotate({
    description: "Log level"
  }),
  server: Schema.optional(ConfigServer.Server).annotate({
    description: "Server configuration for closedcode serve and web commands"
  }),
  command: Schema.optional(Schema.Record(Schema.String, ConfigCommand.Info)).annotate({
    description: "Command configuration"
  }),
  skills: Schema.optional(ConfigSkills.Info).annotate({
    description: "Additional skill folder paths"
  }),
  watcher: Schema.optional(Schema.Struct({
    ignore: Schema.optional(Schema.mutable(Schema.Array(Schema.String)))
  })),
  snapshot: Schema.optional(Schema.Boolean).annotate({
    description: "Enable or disable snapshot tracking. When false, filesystem snapshots are not recorded and undoing or reverting will not undo/redo file changes. Defaults to true."
  }),
  // User-facing plugin config is stored as Specs; provenance gets attached later while configs are merged.
  plugin: Schema.optional(Schema.mutable(Schema.Array(ConfigPlugin.Spec))),
  share: Schema.optional(Schema.Literals(["manual", "auto", "disabled"])).annotate({
    description: "Control sharing behavior:'manual' allows manual sharing via commands, 'auto' enables automatic sharing, 'disabled' disables all sharing"
  }),
  autoshare: Schema.optional(Schema.Boolean).annotate({
    description: "@deprecated Use 'share' field instead. Share newly created sessions automatically"
  }),
  autoupdate: Schema.optional(Schema.Union([Schema.Boolean, Schema.Literal("notify")])).annotate({
    description: "Automatically update to the latest version. Set to true to auto-update, false to disable, or 'notify' to show update notifications"
  }),
  disabled_providers: Schema.optional(Schema.mutable(Schema.Array(Schema.String))).annotate({
    description: "Disable providers that are loaded automatically"
  }),
  enabled_providers: Schema.optional(Schema.mutable(Schema.Array(Schema.String))).annotate({
    description: "When set, ONLY these providers will be enabled. All other providers will be ignored"
  }),
  model: Schema.optional(ConfigModelID).annotate({
    description: "Model to use in the format of provider/model, eg lmstudio/openai/gpt-oss-20b"
  }),
  small_model: Schema.optional(ConfigModelID).annotate({
    description: "Small model to use for tasks like title generation in the format of provider/model"
  }),
  default_agent: Schema.optional(Schema.String).annotate({
    description: "Default agent to use when none is specified. Must be a primary agent. Falls back to 'build' if not set or if the specified agent is invalid."
  }),
  username: Schema.optional(Schema.String).annotate({
    description: "Custom username to display in conversations instead of system username"
  }),
  mode: Schema.optional(Schema.StructWithRest(Schema.Struct({
    build: Schema.optional(ConfigAgent.Info),
    plan: Schema.optional(ConfigAgent.Info)
  }), [Schema.Record(Schema.String, ConfigAgent.Info)])).annotate({
    description: "@deprecated Use `agent` field instead."
  }),
  agent: Schema.optional(Schema.StructWithRest(Schema.Struct({
    // primary
    plan: Schema.optional(ConfigAgent.Info),
    build: Schema.optional(ConfigAgent.Info),
    // subagent
    general: Schema.optional(ConfigAgent.Info),
    explore: Schema.optional(ConfigAgent.Info),
    // specialized
    title: Schema.optional(ConfigAgent.Info),
    summary: Schema.optional(ConfigAgent.Info),
    compaction: Schema.optional(ConfigAgent.Info)
  }), [Schema.Record(Schema.String, ConfigAgent.Info)])).annotate({
    description: "Agent configuration"
  }),
  provider: Schema.optional(Schema.Record(Schema.String, ConfigProvider.Info)).annotate({
    description: "Custom provider configurations and model overrides"
  }),
  mcp: Schema.optional(Schema.Record(Schema.String, Schema.Union([ConfigMCP.Info,
  // Matches the legacy `{ enabled: false }` form used to disable a server.
  Schema.Struct({
    enabled: Schema.Boolean
  })]))).annotate({
    description: "MCP (Model Context Protocol) server configurations"
  }),
  formatter: Schema.optional(ConfigFormatter.Info).annotate({
    description: "Enable or configure formatters. Omit or set to false to disable, true to enable built-ins, or an object to enable built-ins with overrides."
  }),
  lsp: Schema.optional(ConfigLSP.Info).annotate({
    description: "Enable or configure LSP servers. Omit or set to false to disable, true to enable built-ins, or an object to enable built-ins with overrides."
  }),
  instructions: Schema.optional(Schema.mutable(Schema.Array(Schema.String))).annotate({
    description: "Additional instruction files or patterns to include"
  }),
  layout: Schema.optional(ConfigLayout.Layout).annotate({
    description: "@deprecated Always uses stretch layout."
  }),
  permission: Schema.optional(ConfigPermission.Info),
  tools: Schema.optional(Schema.Record(Schema.String, Schema.Boolean)),
  enterprise: Schema.optional(Schema.Struct({
    url: Schema.optional(Schema.String).annotate({
      description: "Enterprise URL"
    })
  })),
  tool_output: Schema.optional(Schema.Struct({
    max_lines: Schema.optional(PositiveInt).annotate({
      description: "Maximum lines of tool output before it is truncated and saved to disk (default: 2000)"
    }),
    max_bytes: Schema.optional(PositiveInt).annotate({
      description: "Maximum bytes of tool output before it is truncated and saved to disk (default: 51200)"
    })
  })).annotate({
    description: "Thresholds for truncating tool output. When output exceeds either limit, the full text is written to the truncation directory and a preview is returned."
  }),
  compaction: Schema.optional(Schema.Struct({
    auto: Schema.optional(Schema.Boolean).annotate({
      description: "Enable automatic compaction when context is full (default: true)"
    }),
    prune: Schema.optional(Schema.Boolean).annotate({
      description: "Enable pruning of old tool outputs (default: true)"
    }),
    tail_turns: Schema.optional(NonNegativeInt).annotate({
      description: "Number of recent user turns, including their following assistant/tool responses, to keep verbatim during compaction (default: 2)"
    }),
    preserve_recent_tokens: Schema.optional(NonNegativeInt).annotate({
      description: "Maximum number of tokens from recent turns to preserve verbatim after compaction"
    }),
    reserved: Schema.optional(NonNegativeInt).annotate({
      description: "Token buffer for compaction. Leaves enough window to avoid overflow during compaction."
    })
  })),
  experimental: Schema.optional(Schema.Struct({
    disable_paste_summary: Schema.optional(Schema.Boolean),
    batch_tool: Schema.optional(Schema.Boolean).annotate({
      description: "Enable the batch tool"
    }),
    openTelemetry: Schema.optional(Schema.Boolean).annotate({
      description: "Enable OpenTelemetry spans for AI SDK calls (using the 'experimental_telemetry' flag)"
    }),
    primary_tools: Schema.optional(Schema.mutable(Schema.Array(Schema.String))).annotate({
      description: "Tools that should only be available to primary agents."
    }),
    continue_loop_on_deny: Schema.optional(Schema.Boolean).annotate({
      description: "Continue the agent loop when a tool call is denied"
    }),
    mcp_timeout: Schema.optional(PositiveInt).annotate({
      description: "Timeout in milliseconds for model context protocol (MCP) requests"
    })
  }))
}).annotate({
  identifier: "Config"
}).pipe(withStatics(s => ({
  zod: zod(s).strict().meta({
    ref: "Config"
  })
})));

// Uses the shared `DeepMutable` from `@/util/schema`. See the definition
// there for why the local variant is needed over `Types.DeepMutable` from
// effect-smol (the upstream version collapses `unknown` to `{}`).

export class Service extends Context.Service()("@closedcode/Config") {}
function globalConfigFile() {
  const candidates = ["closedcode.jsonc", "closedcode.json", "config.json"].map(file => path.join(Global.Path.config, file));
  for (const file of candidates) {
    if (existsSync(file)) return file;
  }
  return candidates[0];
}
function patchJsonc(input, patch, path = []) {
  if (!isRecord(patch)) {
    const edits = modify(input, path, patch, {
      formattingOptions: {
        insertSpaces: true,
        tabSize: 2
      }
    });
    return applyEdits(input, edits);
  }
  return Object.entries(patch).reduce((result, [key, value]) => patchJsonc(result, value, [...path, key]), input);
}
function writable(info) {
  const {
    plugin_origins: _plugin_origins,
    ...next
  } = info;
  return next;
}
function writableGlobal(info) {
  const next = writable(info);
  // When a user changes config from a value back to default in the Desktop app, we don't want to leave a blank `"shell": "",` key
  if ("shell" in next && next.shell === "") return {
    ...next,
    shell: undefined
  };
  return next;
}
export const ConfigDirectoryTypoError = NamedError.create("ConfigDirectoryTypoError", z.object({
  path: z.string(),
  dir: z.string(),
  suggestion: z.string()
}));
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const fs = yield* AppFileSystem.Service;
  const authSvc = yield* Auth.Service;
  const accountSvc = yield* Account.Service;
  const env = yield* Env.Service;
  const npmSvc = yield* Npm.Service;
  const readConfigFile = Effect.fnUntraced(function* (filepath) {
    return yield* fs.readFileString(filepath).pipe(Effect.catchIf(e => e.reason._tag === "NotFound", () => Effect.succeed(undefined)), Effect.orDie);
  });
  const loadConfig = Effect.fnUntraced(function* (text, options) {
    const source = "path" in options ? options.path : options.source;
    const expanded = yield* Effect.promise(() => ConfigVariable.substitute("path" in options ? {
      text,
      type: "path",
      path: options.path
    } : {
      text,
      type: "virtual",
      ...options
    }));
    const parsed = ConfigParse.jsonc(expanded, source);
    const data = ConfigParse.effectSchema(Info, normalizeLoadedConfig(parsed, source), source);
    if (!("path" in options)) return data;
    yield* Effect.promise(() => resolveLoadedPlugins(data, options.path));
    // No $schema auto-injection: closedcode does not host a public config schema,
    // so writing a dead URL into the user's config would break editor validation.
    return data;
  });
  const loadFile = Effect.fnUntraced(function* (filepath) {
    log.info("loading", {
      path: filepath
    });
    const text = yield* readConfigFile(filepath);
    if (!text) return {};
    return yield* loadConfig(text, {
      path: filepath
    });
  });
  const loadGlobal = Effect.fnUntraced(function* () {
    let result = {};
    result = mergeConfig(result, yield* loadFile(path.join(Global.Path.config, "config.json")));
    result = mergeConfig(result, yield* loadFile(path.join(Global.Path.config, "closedcode.json")));
    result = mergeConfig(result, yield* loadFile(path.join(Global.Path.config, "closedcode.jsonc")));
    const legacy = path.join(Global.Path.config, "config");
    if (existsSync(legacy)) {
      yield* Effect.promise(() => import(pathToFileURL(legacy).href, {
        with: {
          type: "toml"
        }
      }).then(async mod => {
        const {
          provider,
          model,
          ...rest
        } = mod.default;
        if (provider && model) result.model = `${provider}/${model}`;
        result = mergeConfig(result, rest);
        await fsNode.writeFile(path.join(Global.Path.config, "config.json"), JSON.stringify(result, null, 2));
        await fsNode.unlink(legacy);
      }).catch(() => {}));
    }
    return result;
  });
  const [cachedGlobal, invalidateGlobal] = yield* Effect.cachedInvalidateWithTTL(loadGlobal().pipe(Effect.tapError(error => Effect.sync(() => log.error("failed to load global config, using defaults", {
    error: String(error)
  }))), Effect.orElseSucceed(() => ({}))), Duration.infinity);
  const getGlobal = Effect.fn("Config.getGlobal")(function* () {
    return yield* cachedGlobal;
  });
  const ensureGitignore = Effect.fn("Config.ensureGitignore")(function* (dir) {
    const gitignore = path.join(dir, ".gitignore");
    const hasIgnore = yield* fs.existsSafe(gitignore);
    if (!hasIgnore) {
      yield* fs.writeFileString(gitignore, ["node_modules", "package.json", "package-lock.json", ".gitignore"].join("\n")).pipe(Effect.catchIf(e => e.reason._tag === "PermissionDenied", () => Effect.void));
    }
  });
  const loadInstanceState = Effect.fn("Config.loadInstanceState")(function* (ctx) {
    const auth = yield* authSvc.all().pipe(Effect.orDie);
    let result = {};
    const consoleManagedProviders = new Set();
    let activeOrgName;
    const pluginScopeForSource = Effect.fnUntraced(function* (source) {
      if (source.startsWith("http://") || source.startsWith("https://")) return "global";
      if (source === "CLOSEDCODE_CONFIG_CONTENT") return "local";
      if (containsPath(source, ctx)) return "local";
      return "global";
    });
    const mergePluginOrigins = Effect.fnUntraced(function* (source,
    // mergePluginOrigins receives raw Specs from one config source, before provenance for this merge step
    // is attached.
    list,
    // Scope can be inferred from the source path, but some callers already know whether the config should
    // behave as global or local and can pass that explicitly.
    kind) {
      if (!list?.length) return;
      const hit = kind ?? (yield* pluginScopeForSource(source));
      // Merge newly seen plugin origins with previously collected ones, then dedupe by plugin identity while
      // keeping the winning source/scope metadata for downstream installs, writes, and diagnostics.
      const plugins = ConfigPlugin.deduplicatePluginOrigins([...(result.plugin_origins ?? []), ...list.map(spec => ({
        spec,
        source,
        scope: hit
      }))]);
      result.plugin = plugins.map(item => item.spec);
      result.plugin_origins = plugins;
    });
    const merge = (source, next, kind) => {
      result = mergeConfigConcatArrays(result, next);
      return mergePluginOrigins(source, next.plugin, kind);
    };
    // Remote ".well-known" config fetching is removed: this build never pulls
    // config (or remote-declared plugins/commands) from an external server.
    const global = yield* getGlobal();
    yield* merge(Global.Path.config, global, "global");
    if (Flag.CLOSEDCODE_CONFIG) {
      yield* merge(Flag.CLOSEDCODE_CONFIG, yield* loadFile(Flag.CLOSEDCODE_CONFIG));
      log.debug("loaded custom config", {
        path: Flag.CLOSEDCODE_CONFIG
      });
    }
    if (!Flag.CLOSEDCODE_DISABLE_PROJECT_CONFIG) {
      // Read project-local closedcode.json/jsonc config files.
      for (const name of ["closedcode"]) {
        for (const file of yield* ConfigPaths.files(name, ctx.directory, ctx.worktree).pipe(Effect.orDie)) {
          yield* merge(file, yield* loadFile(file), "local");
        }
      }
    }
    result.agent = result.agent || {};
    result.mode = result.mode || {};
    result.plugin = result.plugin || [];
    const directories = yield* ConfigPaths.directories(ctx.directory, ctx.worktree);
    if (Flag.CLOSEDCODE_CONFIG_DIR) {
      log.debug("loading config from CLOSEDCODE_CONFIG_DIR", {
        path: Flag.CLOSEDCODE_CONFIG_DIR
      });
    }
    const deps = [];
    for (const dir of directories) {
      if (dir.endsWith(".closedcode") || dir === Flag.CLOSEDCODE_CONFIG_DIR) {
        for (const file of ["closedcode.json", "closedcode.jsonc"]) {
          const source = path.join(dir, file);
          log.debug(`loading config from ${source}`);
          yield* merge(source, yield* loadFile(source));
          result.agent ??= {};
          result.mode ??= {};
          result.plugin ??= [];
        }
      }
      yield* ensureGitignore(dir).pipe(Effect.orDie);
      const dep = yield* npmSvc.install(dir, {
        add: [{
          name: "plugin",
          version: InstallationLocal ? undefined : InstallationVersion
        }]
      }).pipe(Effect.exit, Effect.tap(exit => Exit.isFailure(exit) ? Effect.sync(() => {
        log.warn("background dependency install failed", {
          dir,
          error: String(exit.cause)
        });
      }) : Effect.void), Effect.asVoid, Effect.forkDetach);
      deps.push(dep);
      result.command = mergeDeep(result.command ?? {}, yield* Effect.promise(() => ConfigCommand.load(dir)));
      result.agent = mergeDeep(result.agent ?? {}, yield* Effect.promise(() => ConfigAgent.load(dir)));
      result.agent = mergeDeep(result.agent ?? {}, yield* Effect.promise(() => ConfigAgent.loadMode(dir)));
      // Auto-discovered plugins under `.closedcode/plugin(s)` are already local files, so ConfigPlugin.load
      // returns normalized Specs and we only need to attach origin metadata here.
      const list = yield* Effect.promise(() => ConfigPlugin.load(dir));
      yield* mergePluginOrigins(dir, list);
    }
    if (process.env.CLOSEDCODE_CONFIG_CONTENT) {
      const source = "CLOSEDCODE_CONFIG_CONTENT";
      const next = yield* loadConfig(process.env.CLOSEDCODE_CONFIG_CONTENT, {
        dir: ctx.directory,
        source
      });
      yield* merge(source, next, "local");
      log.debug("loaded custom config from CLOSEDCODE_CONFIG_CONTENT");
    }
    const activeAccount = Option.getOrUndefined(yield* accountSvc.active().pipe(Effect.catch(() => Effect.succeed(Option.none()))));
    if (activeAccount?.active_org_id) {
      const accountID = activeAccount.id;
      const orgID = activeAccount.active_org_id;
      const url = activeAccount.url;
      yield* Effect.gen(function* () {
        const [configOpt, tokenOpt] = yield* Effect.all([accountSvc.config(accountID, orgID), accountSvc.token(accountID)], {
          concurrency: 2
        });
        if (Option.isSome(tokenOpt)) {
          process.env["CLOSEDCODE_CONSOLE_TOKEN"] = tokenOpt.value;
          yield* env.set("CLOSEDCODE_CONSOLE_TOKEN", tokenOpt.value);
        }
        if (Option.isSome(configOpt)) {
          const source = `${url}/api/config`;
          const next = yield* loadConfig(JSON.stringify(configOpt.value), {
            dir: path.dirname(source),
            source
          });
          for (const providerID of Object.keys(next.provider ?? {})) {
            consoleManagedProviders.add(providerID);
          }
          yield* merge(source, next, "global");
        }
      }).pipe(Effect.withSpan("Config.loadActiveOrgConfig"), Effect.catch(err => {
        log.debug("failed to fetch remote account config", {
          error: err instanceof Error ? err.message : String(err)
        });
        return Effect.void;
      }));
    }
    const managedDir = ConfigManaged.managedConfigDir();
    if (existsSync(managedDir)) {
      for (const file of ["closedcode.json", "closedcode.jsonc"]) {
        const source = path.join(managedDir, file);
        yield* merge(source, yield* loadFile(source), "global");
      }
    }

    // macOS managed preferences (.mobileconfig deployed via MDM) override everything
    const managed = yield* Effect.promise(() => ConfigManaged.readManagedPreferences());
    if (managed) {
      result = mergeConfigConcatArrays(result, yield* loadConfig(managed.text, {
        dir: path.dirname(managed.source),
        source: managed.source
      }));
    }
    for (const [name, mode] of Object.entries(result.mode ?? {})) {
      result.agent = mergeDeep(result.agent ?? {}, {
        [name]: {
          ...mode,
          mode: "primary"
        }
      });
    }
    if (Flag.CLOSEDCODE_PERMISSION) {
      result.permission = mergeDeep(result.permission ?? {}, JSON.parse(Flag.CLOSEDCODE_PERMISSION));
    }
    if (result.tools) {
      const perms = {};
      for (const [tool, enabled] of Object.entries(result.tools)) {
        const action = enabled ? "allow" : "deny";
        if (tool === "write" || tool === "edit" || tool === "patch") {
          perms.edit = action;
          continue;
        }
        perms[tool] = action;
      }
      result.permission = mergeDeep(perms, result.permission ?? {});
    }
    if (!result.username) result.username = os.userInfo().username;
    if (result.autoshare === true && !result.share) {
      result.share = "auto";
    }
    if (Flag.CLOSEDCODE_DISABLE_AUTOCOMPACT) {
      result.compaction = {
        ...result.compaction,
        auto: false
      };
    }
    if (Flag.CLOSEDCODE_DISABLE_PRUNE) {
      result.compaction = {
        ...result.compaction,
        prune: false
      };
    }
    return {
      config: result,
      directories,
      deps,
      consoleState: {
        consoleManagedProviders: Array.from(consoleManagedProviders),
        activeOrgName,
        switchableOrgCount: 0
      }
    };
  }, Effect.provideService(AppFileSystem.Service, fs));
  const state = yield* InstanceState.make(Effect.fn("Config.state")(function* (ctx) {
    return yield* loadInstanceState(ctx).pipe(Effect.orDie);
  }));
  const get = Effect.fn("Config.get")(function* () {
    return yield* InstanceState.use(state, s => s.config);
  });
  const directories = Effect.fn("Config.directories")(function* () {
    return yield* InstanceState.use(state, s => s.directories);
  });
  const getConsoleState = Effect.fn("Config.getConsoleState")(function* () {
    return yield* InstanceState.use(state, s => s.consoleState);
  });
  const waitForDependencies = Effect.fn("Config.waitForDependencies")(function* () {
    yield* InstanceState.useEffect(state, s => Effect.forEach(s.deps, Fiber.join, {
      concurrency: "unbounded"
    }).pipe(Effect.asVoid));
  });
  const update = Effect.fn("Config.update")(function* (config) {
    const dir = yield* InstanceState.directory;
    const file = path.join(dir, "config.json");
    const existing = yield* loadFile(file);
    yield* fs.writeFileString(file, JSON.stringify(mergeDeep(writable(existing), writable(config)), null, 2)).pipe(Effect.orDie);
  });
  const invalidate = Effect.fn("Config.invalidate")(function* () {
    yield* invalidateGlobal;
  });
  const updateGlobal = Effect.fn("Config.updateGlobal")(function* (config) {
    const file = globalConfigFile();
    const before = (yield* readConfigFile(file)) ?? "{}";
    const patch = writableGlobal(config);
    let next;
    let changed;
    if (!file.endsWith(".jsonc")) {
      const existing = ConfigParse.effectSchema(Info, ConfigParse.jsonc(before, file), file);
      const merged = mergeDeep(writable(existing), patch);
      const serialized = JSON.stringify(merged, null, 2);
      changed = serialized !== before;
      if (changed) yield* fs.writeFileString(file, serialized).pipe(Effect.orDie);
      next = merged;
    } else {
      const updated = patchJsonc(before, patch);
      next = ConfigParse.effectSchema(Info, ConfigParse.jsonc(updated, file), file);
      changed = updated !== before;
      if (changed) yield* fs.writeFileString(file, updated).pipe(Effect.orDie);
    }
    if (changed) yield* invalidate();
    return {
      info: next,
      changed
    };
  });
  return Service.of({
    get,
    getGlobal,
    getConsoleState,
    update,
    updateGlobal,
    invalidate,
    directories,
    waitForDependencies
  });
}));
export const defaultLayer = layer.pipe(Layer.provide(EffectFlock.defaultLayer), Layer.provide(AppFileSystem.defaultLayer), Layer.provide(Env.defaultLayer), Layer.provide(Auth.defaultLayer), Layer.provide(Account.defaultLayer), Layer.provide(Npm.defaultLayer));
export * as Config from "./config.js";