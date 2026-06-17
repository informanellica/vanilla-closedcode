/** @file Module resolution helpers that resolve a module id relative to a directory. */
import { createRequire } from "node:module";
import path from "node:path";
export let Module;
(function (_Module) {
  /**
   * Resolves a module id as if required from the given directory's package.json.
   * Returns undefined if resolution fails.
   * @param {string} id - The module specifier to resolve (e.g. a package name).
   * @param {string} dir - The directory whose package.json anchors resolution.
   * @returns {string} The resolved absolute module path, or undefined if it cannot be resolved.
   */
  function resolve(id, dir) {
    try {
      return createRequire(path.join(dir, "package.json")).resolve(id);
    } catch {}
  }
  _Module.resolve = resolve;
})(Module || (Module = {}));