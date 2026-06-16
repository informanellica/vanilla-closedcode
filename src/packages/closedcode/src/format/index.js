/** @file Code-formatter service: discovers enabled formatters, matches them to file extensions, and runs them on files. */
import { Effect, Layer, Context, Schema } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { CrossSpawnSpawner } from "core/cross-spawn-spawner";
import { InstanceState } from "#effect/instance-state.js";
import path from "path";
import { mergeDeep } from "remeda";
import { Config } from "#config/config.js";
import * as Log from "core/util/log";
import * as Formatter from "./formatter.js";
import { zod } from "#util/effect-zod.js";
import { withStatics } from "#util/schema.js";
const log = Log.create({
  service: "format"
});
/** Effect Schema describing a formatter's reported status: its name, supported extensions, and whether it is enabled. */
export const Status = Schema.Struct({
  name: Schema.String,
  extensions: Schema.Array(Schema.String),
  enabled: Schema.Boolean
}).annotate({
  identifier: "FormatterStatus"
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
/** Effect Context service tag for the Format service. */
export class Service extends Context.Service()("@closedcode/Format") {}
/** Effect Layer that constructs the Format service, wiring config and a child-process spawner into formatter discovery and execution. */
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const config = yield* Config.Service;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const state = yield* InstanceState.make(Effect.fn("Format.state")(function* (ctx) {
    const commands = {};
    const formatters = {};
    /**
     * Resolve and cache the formatter command for a formatter definition.
     * @param {Object} item - Formatter definition with a name and an enabled() resolver.
     * @returns {Promise<*>} The resolved command (array of args) or false when the formatter is unavailable.
     */
    async function getCommand(item) {
      let cmd = commands[item.name];
      if (cmd === false || cmd === undefined) {
        cmd = await item.enabled(ctx);
        commands[item.name] = cmd;
      }
      return cmd;
    }
    /**
     * Determine whether a formatter is enabled (its command resolves to a value other than false).
     * @param {Object} item - Formatter definition.
     * @returns {Promise<boolean>} True when the formatter is available.
     */
    async function isEnabled(item) {
      const cmd = await getCommand(item);
      return cmd !== false;
    }
    /**
     * Find every enabled formatter whose extensions include the given extension.
     * @param {string} ext - File extension (including the leading dot, e.g. ".js").
     * @returns {Promise<Array>} Array of {item, cmd} entries for enabled matching formatters.
     */
    async function getFormatter(ext) {
      const matching = Object.values(formatters).filter(item => item.extensions.includes(ext));
      const checks = await Promise.all(matching.map(async item => {
        log.info("checking", {
          name: item.name,
          ext
        });
        const cmd = await getCommand(item);
        if (cmd) {
          log.info("enabled", {
            name: item.name,
            ext
          });
        }
        return {
          item,
          cmd
        };
      }));
      return checks.filter(x => x.cmd !== false).map(x => ({
        item: x.item,
        cmd: x.cmd
      }));
    }
    /**
     * Run every matching enabled formatter against a single file, in sequence.
     * @param {string} filepath - Absolute or relative path of the file to format.
     * @returns {Effect} Effect yielding true if any formatter ran, false when no formatter matched the extension.
     */
    function formatFile(filepath) {
      return Effect.gen(function* () {
        log.info("formatting", {
          file: filepath
        });
        const formatters = yield* Effect.promise(() => getFormatter(path.extname(filepath)));
        if (!formatters.length) return false;
        for (const {
          item,
          cmd
        } of formatters) {
          log.info("running", {
            command: cmd
          });
          const replaced = cmd.map(x => x.replace("$FILE", filepath));
          const dir = yield* InstanceState.directory;
          const code = yield* spawner.spawn(ChildProcess.make(replaced[0], replaced.slice(1), {
            cwd: dir,
            env: item.environment,
            extendEnv: true
          })).pipe(Effect.flatMap(handle => handle.exitCode), Effect.scoped, Effect.catch(() => Effect.sync(() => {
            log.error("failed to format file", {
              error: "spawn failed",
              command: cmd,
              ...item.environment,
              file: filepath
            });
            return ChildProcessSpawner.ExitCode(1);
          })));
          if (code !== 0) {
            log.error("failed", {
              command: cmd,
              ...item.environment
            });
          }
        }
        return true;
      });
    }
    const cfg = yield* config.get();
    if (!cfg.formatter) {
      log.info("all formatters are disabled");
      log.info("init");
      return {
        formatters,
        isEnabled,
        formatFile
      };
    }
    for (const item of Object.values(Formatter)) {
      formatters[item.name] = item;
    }
    if (cfg.formatter !== true) {
      for (const [name, item] of Object.entries(cfg.formatter)) {
        const builtIn = Formatter[name];

        // Ruff and uv are both the same formatter, so disabling either should disable both.
        if (["ruff", "uv"].includes(name) && (cfg.formatter.ruff?.disabled || cfg.formatter.uv?.disabled)) {
          // TODO combine formatters so shared backends like Ruff/uv don't need linked disable handling here.
          delete formatters.ruff;
          delete formatters.uv;
          continue;
        }
        if (item.disabled) {
          delete formatters[name];
          continue;
        }
        const info = mergeDeep(builtIn ?? {
          extensions: []
        }, item);
        formatters[name] = {
          ...info,
          name,
          extensions: info.extensions ?? [],
          enabled: builtIn && !info.command ? builtIn.enabled : async _context => info.command ?? false
        };
      }
    }
    log.info("init");
    return {
      formatters,
      isEnabled,
      formatFile
    };
  }));
  /** Eagerly initialize the per-instance formatter state (discovery side effects). */
  const init = Effect.fn("Format.init")(function* () {
    yield* InstanceState.get(state);
  });
  /**
   * Report the status of all known formatters for the current instance.
   * @returns {Effect} Effect yielding an array of {name, extensions, enabled} entries.
   */
  const status = Effect.fn("Format.status")(function* () {
    const {
      formatters,
      isEnabled
    } = yield* InstanceState.get(state);
    const result = [];
    for (const formatter of Object.values(formatters)) {
      const isOn = yield* Effect.promise(() => isEnabled(formatter));
      result.push({
        name: formatter.name,
        extensions: formatter.extensions,
        enabled: isOn
      });
    }
    return result;
  });
  /**
   * Format a single file with the current instance's configured formatters.
   * @param {string} filepath - Path of the file to format.
   * @returns {Effect} Effect yielding true if a formatter ran, false otherwise.
   */
  const file = Effect.fn("Format.file")(function* (filepath) {
    const {
      formatFile
    } = yield* InstanceState.get(state);
    return yield* formatFile(filepath);
  });
  return Service.of({
    init,
    status,
    file
  });
}));
/** Format service Layer with its default Config and cross-spawn spawner dependencies provided. */
export const defaultLayer = layer.pipe(Layer.provide(Config.defaultLayer), Layer.provide(CrossSpawnSpawner.defaultLayer));
export * as Format from "./index.js";