/** @file Cross-platform external-application detection and path resolution (macOS .app lookup, Windows `where` resolution, WSL path translation). */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join } from "node:path";
/**
 * Check whether a named external application is available on this machine.
 * @param {string} appName - The application name to look for.
 * @returns {boolean} True on Windows/Linux (always assumed available) or when the macOS app is found.
 */
export function checkAppExists(appName) {
  if (process.platform === "win32") return true;
  if (process.platform === "linux") return true;
  return checkMacosApp(appName);
}
/**
 * Resolve a launchable executable path for the named application.
 * @param {string} appName - The application name to resolve.
 * @returns {string} On non-Windows the name unchanged; on Windows the resolved .exe path, or null when not found.
 */
export function resolveAppPath(appName) {
  if (process.platform !== "win32") return appName;
  return resolveWindowsAppPath(appName);
}
/**
 * Translate a path between Windows and WSL (Unix) namespaces via `wslpath`.
 * @param {string} path - The path to translate; a leading "~" is expanded to the WSL $HOME.
 * @param {string} mode - "windows" to convert to a Windows path, otherwise to a Unix path.
 * @returns {string} The translated path (or the input unchanged when not on win32).
 * @throws {Error} When invoking wslpath fails.
 */
export function wslPath(path, mode) {
  if (process.platform !== "win32") return path;
  const flag = mode === "windows" ? "-w" : "-u";
  try {
    if (path.startsWith("~")) {
      const suffix = path.slice(1);
      const cmd = `wslpath ${flag} "$HOME${suffix.replace(/"/g, '\\"')}"`;
      const output = execFileSync("wsl", ["-e", "sh", "-lc", cmd]);
      return output.toString().trim();
    }
    const output = execFileSync("wsl", ["-e", "wslpath", flag, path]);
    return output.toString().trim();
  } catch (error) {
    throw new Error(`Failed to run wslpath: ${String(error)}`, {
      cause: error
    });
  }
}
/**
 * Detect a macOS application by checking the standard Applications folders and PATH.
 * @param {string} appName - The application name (without the .app suffix).
 * @returns {boolean} True when the .app bundle exists or the name is on PATH.
 */
function checkMacosApp(appName) {
  const locations = [`/Applications/${appName}.app`, `/System/Applications/${appName}.app`];
  const home = process.env.HOME;
  if (home) locations.push(`${home}/Applications/${appName}.app`);
  if (locations.some(location => existsSync(location))) return true;
  try {
    execFileSync("which", [appName]);
    return true;
  } catch {
    return false;
  }
}
/**
 * Resolve a Windows executable for an application name using `where`, falling back
 * to parsing .cmd/.bat shims (for the %~dp0-relative .exe), then a fuzzy directory scan.
 * @param {string} appName - The application name to resolve.
 * @returns {string} The resolved .exe path, the first `where` candidate, or null when nothing is found.
 */
function resolveWindowsAppPath(appName) {
  let output;
  try {
    output = execFileSync("where", [appName]).toString();
  } catch {
    return null;
  }
  const paths = output.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
  const hasExt = (path, ext) => extname(path).toLowerCase() === `.${ext}`;
  const exe = paths.find(path => hasExt(path, "exe"));
  if (exe) return exe;
  const resolveCmd = path => {
    const content = readFileSync(path, "utf8");
    for (const token of content.split('"').map(value => value.trim())) {
      const lower = token.toLowerCase();
      if (!lower.includes(".exe")) continue;
      const index = lower.indexOf("%~dp0");
      if (index >= 0) {
        const base = dirname(path);
        const suffix = token.slice(index + 5);
        const resolved = suffix.replace(/\//g, "\\").split("\\").filter(part => part && part !== ".").reduce((current, part) => {
          if (part === "..") return dirname(current);
          return join(current, part);
        }, base);
        if (existsSync(resolved)) return resolved;
      }
      if (existsSync(token)) return token;
    }
    return null;
  };
  for (const path of paths) {
    if (hasExt(path, "cmd") || hasExt(path, "bat")) {
      const resolved = resolveCmd(path);
      if (resolved) return resolved;
    }
    if (!extname(path)) {
      const cmd = `${path}.cmd`;
      if (existsSync(cmd)) {
        const resolved = resolveCmd(cmd);
        if (resolved) return resolved;
      }
      const bat = `${path}.bat`;
      if (existsSync(bat)) {
        const resolved = resolveCmd(bat);
        if (resolved) return resolved;
      }
    }
  }
  const key = appName.split("").filter(value => /[a-z0-9]/i.test(value)).map(value => value.toLowerCase()).join("");
  if (key) {
    for (const path of paths) {
      const dirs = [dirname(path), dirname(dirname(path)), dirname(dirname(dirname(path)))];
      for (const dir of dirs) {
        try {
          for (const entry of readdirSync(dir)) {
            const candidate = join(dir, entry);
            if (!hasExt(candidate, "exe")) continue;
            const stem = entry.replace(/\.exe$/i, "");
            const name = stem.split("").filter(value => /[a-z0-9]/i.test(value)).map(value => value.toLowerCase()).join("");
            if (name.includes(key) || key.includes(name)) return candidate;
          }
        } catch {
          continue;
        }
      }
    }
  }
  return paths[0] ?? null;
}