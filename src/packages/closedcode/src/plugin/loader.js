/** @file PluginLoader namespace: normalizes configured plugins, resolves and imports their entrypoints through a staged pipeline, and loads all external plugins (with one optional retry for file plugins). */

import { checkPluginCompatibility, createPluginEntry, isDeprecatedPlugin, pluginSource, resolvePluginTarget } from "./shared.js";
import { ConfigPlugin } from "#config/plugin.js";
import { InstallationVersion } from "core/installation/version";
/** Namespace object exposing the plugin loading pipeline (resolve, load, loadExternal). */
export let PluginLoader;
(function (_PluginLoader) {
  // A normalized plugin declaration derived from config before any filesystem or npm work happens.

  // A plugin that has been resolved to a concrete target and entrypoint on disk.

  // A plugin target we could inspect, but which does not expose the requested kind of entrypoint.

  // A resolved plugin whose module has been imported successfully.

  // Normalize a config item into the loader's internal representation.
  /**
   * Normalize a raw config plugin item into a loader plan.
   * @param {*} item - A config plugin entry (spec string or [spec, options]).
   * @returns {Object} A plan {spec, options, deprecated}.
   */
  function plan(item) {
    const spec = ConfigPlugin.pluginSpecifier(item);
    return {
      spec,
      options: ConfigPlugin.pluginOptions(item),
      deprecated: isDeprecatedPlugin(spec)
    };
  }

  // Resolve a configured plugin into a concrete entrypoint that can later be imported.
  //
  // The stages here intentionally separate install/target resolution, entrypoint detection,
  // and compatibility checks so callers can report the exact reason a plugin was skipped.
  /**
   * Resolve a plan to a concrete, importable entrypoint for the given kind.
   *
   * Runs install/target resolution, entrypoint detection, and (for npm
   * plugins) a version compatibility check as distinct stages.
   * @param {Object} plan - The normalized plugin plan.
   * @param {string} kind - The desired entrypoint kind ("server" or "tui").
   * @returns {Promise<Object>} {ok: true, value} when resolved, otherwise {ok: false, stage, error|value}.
   */
  async function resolve(plan, kind) {
    // First make sure the plugin exists locally, installing npm plugins on demand.
    let target = "";
    try {
      target = await resolvePluginTarget(plan.spec);
    } catch (error) {
      return {
        ok: false,
        stage: "install",
        error
      };
    }
    if (!target) return {
      ok: false,
      stage: "install",
      error: new Error(`Plugin ${plan.spec} target is empty`)
    };

    // Then inspect the target for the requested server/tui entrypoint.
    let base;
    try {
      base = await createPluginEntry(plan.spec, target, kind);
    } catch (error) {
      return {
        ok: false,
        stage: "entry",
        error
      };
    }
    if (!base.entry) return {
      ok: false,
      stage: "missing",
      value: {
        ...plan,
        source: base.source,
        target: base.target,
        pkg: base.pkg,
        message: `Plugin ${plan.spec} does not expose a ${kind} entrypoint`
      }
    };

    // npm plugins can declare which closedcode versions they support; file plugins are treated
    // as local development code and skip this compatibility gate.
    if (base.source === "npm") {
      try {
        await checkPluginCompatibility(base.target, InstallationVersion, base.pkg);
      } catch (error) {
        return {
          ok: false,
          stage: "compatibility",
          error
        };
      }
    }
    return {
      ok: true,
      value: {
        ...plan,
        source: base.source,
        target: base.target,
        entry: base.entry,
        pkg: base.pkg
      }
    };
  }
  _PluginLoader.resolve = resolve;
  /**
   * Dynamically import a resolved plugin's entrypoint module.
   * @param {Object} row - A resolved plugin record with an `entry` URL/path.
   * @returns {Promise<Object>} {ok: true, value} (value includes `mod`), or {ok: false, error}.
   */
  async function load(row) {
    let mod;
    try {
      mod = await import(row.entry);
    } catch (error) {
      return {
        ok: false,
        error
      };
    }
    if (!mod) return {
      ok: false,
      error: new Error(`Plugin ${row.spec} module is empty`)
    };
    return {
      ok: true,
      value: {
        ...row,
        mod
      }
    };
  }
  _PluginLoader.load = load;
  // Run one candidate through the full pipeline: resolve, optionally surface a missing entry,
  // import the module, and finally let the caller transform the loaded plugin into any result type.
  /**
   * Run one candidate through the full resolve/load pipeline.
   *
   * Skips deprecated plugins, reports missing/error stages via callbacks, and
   * returns the loaded plugin (optionally transformed by `finish`).
   * @param {Object} candidate - A {origin, plan} candidate.
   * @param {string} kind - The desired entrypoint kind.
   * @param {boolean} retry - Whether this is a retry attempt (passed to callbacks).
   * @param {Function} finish - Optional transformer applied to the loaded plugin.
   * @param {Function} missing - Optional handler for plugins lacking the requested entrypoint.
   * @param {Object} report - Optional reporter with start/missing/error callbacks.
   * @returns {Promise<*>} The (possibly transformed) loaded plugin, or undefined if skipped/failed.
   */
  async function attempt(candidate, kind, retry, finish, missing, report) {
    const plan = candidate.plan;

    // Deprecated plugin packages are silently ignored because they are now built in.
    if (plan.deprecated) return;
    report?.start?.(candidate, retry);
    const resolved = await resolve(plan, kind);
    if (!resolved.ok) {
      if (resolved.stage === "missing") {
        // Missing entrypoints are handled separately so callers can still inspect package metadata,
        // for example to load theme files from a tui plugin package that has no code entrypoint.
        if (missing) {
          const value = await missing(resolved.value, candidate.origin, retry);
          if (value !== undefined) return value;
        }
        report?.missing?.(candidate, retry, resolved.value.message, resolved.value);
        return;
      }
      report?.error?.(candidate, retry, resolved.stage, resolved.error);
      return;
    }
    const loaded = await load(resolved.value);
    if (!loaded.ok) {
      report?.error?.(candidate, retry, "load", loaded.error, resolved.value);
      return;
    }

    // The default behavior is to return the successfully loaded plugin as-is, but callers can
    // provide a finisher to adapt the result into a more specific runtime shape.
    if (!finish) return loaded.value;
    return finish(loaded.value, candidate.origin, retry);
  }
  // Resolve and load all configured plugins in parallel.
  //
  // If `wait` is provided, file-based plugins that initially failed are retried once after the
  // caller finishes preparing dependencies. This supports local plugins that depend on an install
  // step happening elsewhere before their entrypoint becomes loadable.
  /**
   * Resolve and load all configured external plugins in parallel.
   *
   * When `wait` is provided, file plugins that failed on the first pass are
   * retried once after the caller's dependency preparation completes. Skipped
   * and failed entries are dropped while preserving successful order.
   * @param {Object} input - {items, kind, finish, missing, report, wait}.
   * @returns {Promise<Array>} The list of successfully loaded plugin results.
   */
  async function loadExternal(input) {
    const candidates = input.items.map(origin => ({
      origin,
      plan: plan(origin.spec)
    }));
    const list = [];
    for (const candidate of candidates) {
      list.push(attempt(candidate, input.kind, false, input.finish, input.missing, input.report));
    }
    const out = await Promise.all(list);
    if (input.wait) {
      let deps;
      for (let i = 0; i < candidates.length; i++) {
        if (out[i] !== undefined) continue;

        // Only local file plugins are retried. npm plugins already attempted installation during
        // the first pass, while file plugins may need the caller's dependency preparation to finish.
        const candidate = candidates[i];
        if (!candidate || pluginSource(candidate.plan.spec) !== "file") continue;
        deps ??= input.wait();
        await deps;
        out[i] = await attempt(candidate, input.kind, true, input.finish, input.missing, input.report);
      }
    }

    // Drop skipped/failed entries while preserving the successful result order.
    const ready = [];
    for (const item of out) if (item !== undefined) ready.push(item);
    return ready;
  }
  _PluginLoader.loadExternal = loadExternal;
})(PluginLoader || (PluginLoader = {}));