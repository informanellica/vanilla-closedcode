/** @file Resolves an executable's full path, augmenting the search PATH with the global bin directory. */
import whichPkg from "which";
import path from "path";
import { Global } from "core/global";

/**
 * Resolves the absolute path of an executable, searching the given environment's PATH plus the global bin dir.
 *
 * @param {Object} env - Environment-like object; `PATH`/`Path` and `PATHEXT`/`PathExt` are consulted, falling back to `process.env`.
 * @param {string} cmd - Command name to locate.
 * @returns {string|null} The resolved executable path, or `null` if not found.
 */
export function which(cmd, env) {
  const base = env?.PATH ?? env?.Path ?? process.env.PATH ?? process.env.Path ?? "";
  const full = base ? base + path.delimiter + Global.Path.bin : Global.Path.bin;
  const result = whichPkg.sync(cmd, {
    nothrow: true,
    path: full,
    pathExt: env?.PATHEXT ?? env?.PathExt ?? process.env.PATHEXT ?? process.env.PathExt
  });
  return typeof result === "string" ? result : null;
}