/** @file Default ignore rules (build/cache folders and noise files) plus a matcher used to skip files during scanning and watching. */
import { Glob } from "core/util/glob";
/** Folder basenames that are always ignored anywhere in a path. */
const FOLDERS = new Set(["node_modules", "bower_components", ".pnpm-store", "vendor", ".npm", "dist", "build", "out", ".next", "target", "bin", "obj", ".git", ".svn", ".hg", ".vscode", ".idea", ".turbo", ".output", "desktop", ".sst", ".cache", ".webkit-cache", "__pycache__", ".pytest_cache", "mypy_cache", ".history", ".gradle"]);
/** Glob patterns for individual files/paths that should be ignored. */
const FILES = ["**/*.swp", "**/*.swo", "**/*.pyc",
// OS
"**/.DS_Store", "**/Thumbs.db",
// Logs & temp
"**/logs/**", "**/tmp/**", "**/temp/**", "**/*.log",
// Coverage/test outputs
"**/coverage/**", "**/.nyc_output/**"];
/** Combined list of default ignore patterns (file globs followed by folder names). */
export const PATTERNS = [...FILES, ...FOLDERS];
/**
 * Decide whether a path should be ignored. Whitelist patterns force inclusion;
 * otherwise any ignored folder segment or matching file/extra glob causes ignore.
 * @param {string} filepath - The path to test (may use `/` or `\` separators).
 * @param {Object} opts - Options with optional `whitelist` and `extra` glob arrays.
 * @returns {boolean} True if the path should be ignored.
 */
export function match(filepath, opts) {
  for (const pattern of opts?.whitelist || []) {
    if (Glob.match(pattern, filepath)) return false;
  }
  const parts = filepath.split(/[/\\]/);
  for (let i = 0; i < parts.length; i++) {
    if (FOLDERS.has(parts[i])) return true;
  }
  const extra = opts?.extra || [];
  for (const pattern of [...FILES, ...extra]) {
    if (Glob.match(pattern, filepath)) return true;
  }
  return false;
}
export * as FileIgnore from "./ignore.js";