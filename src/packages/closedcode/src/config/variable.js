/** @file Config variable interpolation: expands {env:VAR} and {file:path} tokens in config text. */
export * as ConfigVariable from "./variable.js";
import path from "path";
import os from "os";
import { Filesystem } from "#util/filesystem.js";
import { InvalidError } from "./error.js";
/**
 * Resolve the source identifier (used for error reporting) of a substitution input.
 * @param {Object} input - Either a `{type: "path", path}` input or one carrying its own `source`.
 * @returns {string} The config file path when type is "path", otherwise the provided source string.
 */
function source(input) {
  return input.type === "path" ? input.path : input.source;
}
/**
 * Resolve the base directory used to resolve relative {file:...} references.
 * @param {Object} input - Either a `{type: "path", path}` input or one carrying its own `dir`.
 * @returns {string} The directory of the config file when type is "path", otherwise the provided dir.
 */
function dir(input) {
  return input.type === "path" ? path.dirname(input.path) : input.dir;
}

/**
 * Apply {env:VAR} and {file:path} substitutions to config text.
 * {env:VAR} is replaced by the environment variable's value (empty string if unset).
 * {file:path} is replaced by the JSON-escaped trimmed contents of the referenced file;
 * relative paths resolve against the config directory, `~/` expands to the home directory,
 * and tokens on lines starting with `//` are left untouched. Missing files either throw an
 * InvalidError or expand to empty depending on `input.missing`.
 * @param {Object} input - Substitution input.
 * @param {string} input.text - The raw config text to process.
 * @param {string} input.missing - How to handle missing files: "error" (default, throw) or "empty".
 * @param {string} input.type - Discriminator; "path" means `input.path` is used for dir/source.
 * @param {string} input.path - Config file path (when type is "path").
 * @param {string} input.dir - Base directory for relative references (when not type "path").
 * @param {string} input.source - Source identifier for error messages (when not type "path").
 * @returns {Promise<string>} The text with all env and file tokens expanded.
 */
export async function substitute(input) {
  const missing = input.missing ?? "error";
  let text = input.text.replace(/\{env:([^}]+)\}/g, (_, varName) => {
    return process.env[varName] || "";
  });
  const fileMatches = Array.from(text.matchAll(/\{file:[^}]+\}/g));
  if (!fileMatches.length) return text;
  const configDir = dir(input);
  const configSource = source(input);
  let out = "";
  let cursor = 0;
  for (const match of fileMatches) {
    const token = match[0];
    const index = match.index;
    out += text.slice(cursor, index);
    const lineStart = text.lastIndexOf("\n", index - 1) + 1;
    const prefix = text.slice(lineStart, index).trimStart();
    if (prefix.startsWith("//")) {
      out += token;
      cursor = index + token.length;
      continue;
    }
    let filePath = token.replace(/^\{file:/, "").replace(/\}$/, "");
    if (filePath.startsWith("~/")) {
      filePath = path.join(os.homedir(), filePath.slice(2));
    }
    const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(configDir, filePath);
    const fileContent = (await Filesystem.readText(resolvedPath).catch(error => {
      if (missing === "empty") return "";
      const errMsg = `bad file reference: "${token}"`;
      if (error.code === "ENOENT") {
        throw new InvalidError({
          path: configSource,
          message: errMsg + ` ${resolvedPath} does not exist`
        }, {
          cause: error
        });
      }
      throw new InvalidError({
        path: configSource,
        message: errMsg
      }, {
        cause: error
      });
    })).trim();
    out += JSON.stringify(fileContent).slice(1, -1);
    cursor = index + token.length;
  }
  out += text.slice(cursor);
  return out;
}