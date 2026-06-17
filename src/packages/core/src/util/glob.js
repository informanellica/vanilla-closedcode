import { glob, globSync } from "glob";
import { minimatch } from "minimatch";
/** @file Glob namespace wrapping the `glob`/`minimatch` libraries for filesystem scanning and matching. */
export let Glob;
(function (_Glob) {
  /**
   * Translate this module's option shape into the underlying `glob` library options.
   * @param {Object} options - Caller options (cwd, absolute, dot, symlink, include).
   * @returns {Object} Options accepted by the `glob`/`globSync` functions.
   */
  function toGlobOptions(options) {
    return {
      cwd: options.cwd,
      absolute: options.absolute,
      dot: options.dot,
      follow: options.symlink ?? false,
      nodir: options.include !== "all"
    };
  }
  /**
   * Asynchronously scan the filesystem for paths matching a glob pattern.
   * @param {string} pattern - The glob pattern to match.
   * @param {Object} options - Scan options (cwd, absolute, dot, symlink, include).
   * @returns {Promise<Array>} A promise resolving to the matched paths.
   */
  async function scan(pattern, options = {}) {
    return glob(pattern, toGlobOptions(options));
  }
  _Glob.scan = scan;
  /**
   * Synchronously scan the filesystem for paths matching a glob pattern.
   * @param {string} pattern - The glob pattern to match.
   * @param {Object} options - Scan options (cwd, absolute, dot, symlink, include).
   * @returns {Array} The matched paths.
   */
  function scanSync(pattern, options = {}) {
    return globSync(pattern, toGlobOptions(options));
  }
  _Glob.scanSync = scanSync;
  /**
   * Test whether a single file path matches a glob pattern (dotfiles included).
   * @param {string} pattern - The glob pattern.
   * @param {string} filepath - The path to test.
   * @returns {boolean} True when the path matches the pattern.
   */
  function match(pattern, filepath) {
    return minimatch(filepath, pattern, {
      dot: true
    });
  }
  _Glob.match = match;
})(Glob || (Glob = {}));