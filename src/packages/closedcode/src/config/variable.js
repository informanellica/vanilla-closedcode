export * as ConfigVariable from "./variable.js";
import path from "path";
import os from "os";
import { Filesystem } from "@/util/filesystem.js";
import { InvalidError } from "./error.js";
function source(input) {
  return input.type === "path" ? input.path : input.source;
}
function dir(input) {
  return input.type === "path" ? path.dirname(input.path) : input.dir;
}

/** Apply {env:VAR} and {file:path} substitutions to config text. */
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