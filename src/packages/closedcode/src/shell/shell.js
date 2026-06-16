/** @file Shell discovery and process control: locates/selects a usable shell per platform, builds invocation args, and kills shell process trees. */
import { Flag } from "core/flag/flag";
import { lazy } from "#util/lazy.js";
import { Filesystem } from "#util/filesystem.js";
import { which } from "#util/which.js";
import path from "path";
import { spawn } from "child_process";
import { setTimeout as sleep } from "node:timers/promises";
/** Milliseconds to wait after SIGTERM before escalating to SIGKILL. */
const SIGKILL_TIMEOUT_MS = 200;
/**
 * Per-shell metadata keyed by shell name.
 * `login`/`posix` mark POSIX login shells, `ps` marks PowerShell-family shells, and `deny` excludes a shell from acceptable selection.
 */
const META = {
  bash: {
    login: true,
    posix: true
  },
  dash: {
    login: true,
    posix: true
  },
  fish: {
    deny: true,
    login: true
  },
  ksh: {
    login: true,
    posix: true
  },
  nu: {
    deny: true
  },
  powershell: {
    ps: true
  },
  pwsh: {
    ps: true
  },
  sh: {
    login: true,
    posix: true
  },
  zsh: {
    login: true,
    posix: true
  }
};
/**
 * Kills a spawned process and its entire child tree. On Windows uses `taskkill /t`; on POSIX sends SIGTERM to the process group then escalates to SIGKILL, falling back to killing the process directly.
 * @param {Object} proc - The child process to kill (must expose `pid` and `kill`).
 * @param {Object} opts - Options; `opts.exited` is an optional predicate function that returns true once the process has already exited.
 * @returns {Promise<void>} Resolves once kill attempts have completed.
 */
export async function killTree(proc, opts) {
  const pid = proc.pid;
  if (!pid || opts?.exited?.()) return;
  if (process.platform === "win32") {
    await new Promise(resolve => {
      const killer = spawn("taskkill", ["/pid", String(pid), "/f", "/t"], {
        stdio: "ignore",
        windowsHide: true
      });
      killer.once("exit", () => resolve());
      killer.once("error", () => resolve());
    });
    return;
  }
  try {
    process.kill(-pid, "SIGTERM");
    await sleep(SIGKILL_TIMEOUT_MS);
    if (!opts?.exited?.()) {
      process.kill(-pid, "SIGKILL");
    }
  } catch (_e) {
    proc.kill("SIGTERM");
    await sleep(SIGKILL_TIMEOUT_MS);
    if (!opts?.exited?.()) {
      proc.kill("SIGKILL");
    }
  }
}
/**
 * Resolves a shell reference to its full executable path. On non-Windows returns the input unchanged; on Windows normalizes the path and, for bare or git-bash references, resolves via git-bash detection or PATH lookup.
 * @param {string} file - A shell name or path.
 * @returns {string} The resolved shell path.
 */
function full(file) {
  if (process.platform !== "win32") return file;
  const shell = Filesystem.windowsPath(file);
  if (path.win32.dirname(shell) !== ".") {
    if (shell.startsWith("/") && name(shell) === "bash") return gitbash() || shell;
    return shell;
  }
  if (name(shell) === "bash") return gitbash() || which(shell) || shell;
  return which(shell) || shell;
}
/**
 * Looks up the metadata entry for a shell by its base name.
 * @param {string} file - A shell name or path.
 * @returns {Object} The metadata record, or undefined when unknown.
 */
function meta(file) {
  return META[name(file)];
}
/**
 * Reports whether a shell is allowed (not flagged `deny`).
 * @param {string} file - A shell name or path.
 * @returns {boolean} True unless the shell is denied.
 */
function ok(file) {
  return meta(file)?.deny !== true;
}
/**
 * Reports whether a path is absolute (after Windows-path normalization).
 * @param {string} file - A path.
 * @returns {boolean} True when the path is absolute.
 */
function rooted(file) {
  return path.isAbsolute(Filesystem.windowsPath(file));
}
/**
 * Resolves a shell reference to an existing executable path, returning undefined if it cannot be found. Absolute paths must point at an existing file; relative names are resolved via PATH.
 * @param {string} file - A shell name or path.
 * @returns {string} The resolved existing path, or undefined.
 */
function resolve(file) {
  const shell = full(file);
  if (rooted(shell)) {
    if (Filesystem.stat(shell)?.isFile()) return shell;
    return;
  }
  return which(shell) ?? undefined;
}
/**
 * Lists candidate Windows shells (pwsh, powershell, git-bash, and COMSPEC/cmd), de-duplicated and resolved to full paths.
 * @returns {Array<string>} The candidate shell paths.
 */
function win() {
  return Array.from(new Set([which("pwsh"), which("powershell"), gitbash(), process.env.COMSPEC || "cmd.exe"].filter(item => Boolean(item)).map(full)));
}
/**
 * Lists candidate Unix shells from /etc/shells, falling back to bash/zsh/sh when that file is missing or empty.
 * @returns {Promise<Array<string>>} The candidate shell paths.
 */
async function unix() {
  const text = await Filesystem.readText("/etc/shells").catch(() => "");
  if (text) return Array.from(new Set(text.split("\n").filter(line => line.trim() && !line.startsWith("#"))));
  return ["/bin/bash", "/bin/zsh", "/bin/sh"];
}
/**
 * Picks a usable shell: prefers the requested file when it resolves (and, if required, is acceptable), otherwise falls back to the first platform candidate.
 * @param {string} file - The preferred shell name or path.
 * @param {Object} opts - Options; when `opts.acceptable` is true, denied shells are skipped.
 * @returns {string} The chosen shell path.
 */
function select(file, opts) {
  if (file && (!opts?.acceptable || ok(file))) {
    const shell = resolve(file);
    if (shell) return shell;
  }
  if (process.platform === "win32") return win()[0];
  return fallback();
}
/**
 * Locates the Git Bash executable on Windows, honoring the CLOSEDCODE_GIT_BASH_PATH flag and otherwise deriving it from the git install location.
 * @returns {string} The path to bash.exe, or undefined when not on Windows or not found.
 */
export function gitbash() {
  if (process.platform !== "win32") return;
  if (Flag.CLOSEDCODE_GIT_BASH_PATH) return Flag.CLOSEDCODE_GIT_BASH_PATH;
  const git = which("git");
  if (!git) return;
  const file = path.join(git, "..", "..", "bin", "bash.exe");
  if (Filesystem.stat(file)?.size) return file;
}
/**
 * Returns a last-resort default shell: zsh on macOS, otherwise bash if on PATH, else /bin/sh.
 * @returns {string} The fallback shell path.
 */
function fallback() {
  if (process.platform === "darwin") return "/bin/zsh";
  const bash = which("bash");
  if (bash) return bash;
  return "/bin/sh";
}
/**
 * Extracts the lowercased base name of a shell from its path (without extension on Windows).
 * @param {string} file - A shell name or path.
 * @returns {string} The lowercased shell base name.
 */
export function name(file) {
  if (process.platform === "win32") return path.win32.parse(Filesystem.windowsPath(file)).name.toLowerCase();
  return path.basename(file).toLowerCase();
}
/**
 * Reports whether the shell should be invoked as a login shell.
 * @param {string} file - A shell name or path.
 * @returns {boolean} True for login shells.
 */
export function login(file) {
  return meta(file)?.login === true;
}
/**
 * Reports whether the shell is a POSIX-style shell.
 * @param {string} file - A shell name or path.
 * @returns {boolean} True for POSIX shells.
 */
export function posix(file) {
  return meta(file)?.posix === true;
}
/**
 * Reports whether the shell is a PowerShell-family shell.
 * @param {string} file - A shell name or path.
 * @returns {boolean} True for PowerShell/pwsh.
 */
export function ps(file) {
  return meta(file)?.ps === true;
}
/**
 * Builds a descriptor for a shell: its full path, a display name (base name if resolvable, else full path), and whether it is acceptable.
 * @param {string} file - A shell name or path.
 * @returns {Object} An object `{ path, name, acceptable }`.
 */
function info(file) {
  const item = full(file);
  const n = name(item);
  return {
    path: item,
    name: resolve(n) ? n : item,
    acceptable: ok(item)
  };
}
/**
 * Builds the argv used to run a command in the given shell, sourcing profile files and changing into `cwd` where applicable. Handles bash/zsh login-shell sourcing, nu/fish/cmd/PowerShell, and a generic `-c` fallback.
 * @param {string} file - The shell name or path.
 * @param {string} command - The command string to execute.
 * @param {string} cwd - The working directory to change into before running the command.
 * @returns {Array<string>} The argument vector to pass when spawning the shell.
 */
export function args(file, command, cwd) {
  const n = name(file);
  if (n === "nu" || n === "fish") return ["-c", command];
  if (n === "zsh") {
    return ["-l", "-c", `
        [[ -f ~/.zshenv ]] && source ~/.zshenv >/dev/null 2>&1 || true
        [[ -f "\${ZDOTDIR:-$HOME}/.zshrc" ]] && source "\${ZDOTDIR:-$HOME}/.zshrc" >/dev/null 2>&1 || true
        cd -- "$1"
        eval ${JSON.stringify(command)}
      `, "closedcode", cwd];
  }
  if (n === "bash") {
    return ["-l", "-c", `
        shopt -s expand_aliases
        [[ -f ~/.bashrc ]] && source ~/.bashrc >/dev/null 2>&1 || true
        cd -- "$1"
        eval ${JSON.stringify(command)}
      `, "closedcode", cwd];
  }
  if (n === "cmd") return ["/c", command];
  if (ps(file)) return ["-NoProfile", "-Command", command];
  return ["-c", command];
}
/** Lazily-computed default preferred shell, derived from the SHELL env var. */
const defaultPreferred = lazy(() => select(process.env.SHELL));
/** Lazily-computed default acceptable shell (denied shells excluded), derived from the SHELL env var. */
const defaultAcceptable = lazy(() => select(process.env.SHELL, {
  acceptable: true
}));
/**
 * Returns the preferred shell to use, honoring an explicit config value or falling back to the lazily-computed default.
 * @param {string} configShell - An explicitly configured shell, if any.
 * @returns {string} The preferred shell path.
 */
export function preferred(configShell) {
  if (configShell) return select(configShell);
  return defaultPreferred();
}
/** Clears the cached default preferred shell so it is recomputed on next access. */
preferred.reset = () => defaultPreferred.reset();
/**
 * Returns an acceptable shell to use (excluding denied shells), honoring an explicit config value or falling back to the lazily-computed default.
 * @param {string} configShell - An explicitly configured shell, if any.
 * @returns {string} The acceptable shell path.
 */
export function acceptable(configShell) {
  if (configShell) return select(configShell, {
    acceptable: true
  });
  return defaultAcceptable();
}
/** Clears the cached default acceptable shell so it is recomputed on next access. */
acceptable.reset = () => defaultAcceptable.reset();
/**
 * Lists the available shells on this platform as descriptors, keeping only those that resolve to an existing executable.
 * @returns {Promise<Array<Object>>} An array of shell descriptors `{ path, name, acceptable }`.
 */
export async function list() {
  const shells = process.platform === "win32" ? win() : await unix();
  return shells.filter(s => resolve(s)).map(info);
}
export * as Shell from "./shell.js";