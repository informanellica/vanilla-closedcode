/** @file The shell tool: parses commands with tree-sitter to discover file/path arguments for permission prompts, then spawns them with output streaming, truncation, timeout, and abort handling. */
import { Effect, Stream } from "effect";
import os from "os";
import { createWriteStream } from "node:fs";
import * as Tool from "./tool.js";
import path from "path";
import * as Log from "core/util/log";
import { containsPath } from "../project/instance-context.js";
import { InstanceState } from "#effect/instance-state.js";
import { lazy } from "#util/lazy.js";
import { createRequire } from "node:module";
import { Language } from "web-tree-sitter";
import { AppFileSystem } from "core/filesystem";
import { fileURLToPath } from "url";
import { Config } from "#config/config.js";
import { Flag } from "core/flag/flag";
import { Shell } from "#shell/shell.js";
import { ShellID } from "./shell/id.js";
import * as Truncate from "./truncate.js";
import { Plugin } from "#plugin/index.js";
import { ChildProcess } from "effect/unstable/process";
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import { ShellPrompt } from "./shell/prompt.js";
import { BashArity } from "#permission/arity.js";
export { Parameters } from "./shell/prompt.js";
const MAX_METADATA_LENGTH = 30_000;
const DEFAULT_TIMEOUT = Flag.CLOSEDCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS || 2 * 60 * 1000;
const CWD = new Set(["cd", "chdir", "popd", "pushd", "push-location", "set-location"]);
const FILES = new Set([...CWD, "rm", "cp", "mv", "mkdir", "touch", "chmod", "chown", "cat",
// Leave PowerShell aliases out for now. Common ones like cat/cp/mv/rm/mkdir
// already hit the entries above, and alias normalization should happen in one
// place later so we do not risk double-prompting.
"get-content", "set-content", "add-content", "copy-item", "move-item", "remove-item", "new-item", "rename-item"]);
const CMD_FILES = new Set(["copy", "del", "dir", "erase", "md", "mkdir", "move", "rd", "ren", "rename", "rmdir", "type"]);
const FLAGS = new Set(["-destination", "-literalpath", "-path"]);
const SWITCHES = new Set(["-confirm", "-debug", "-force", "-nonewline", "-recurse", "-verbose", "-whatif"]);
export const log = Log.create({
  service: "shell-tool"
});
/**
 * Resolve a tree-sitter wasm asset reference to a plain filesystem path,
 * accepting `file://` URLs, absolute paths, and module-relative references.
 * @param {string} asset - The asset reference (URL, absolute, or relative path).
 * @returns {string} The resolved filesystem path.
 */
const resolveWasm = asset => {
  if (asset.startsWith("file://")) return fileURLToPath(asset);
  if (asset.startsWith("/") || /^[a-z]:/i.test(asset)) return asset;
  const url = new URL(asset, import.meta.url);
  return fileURLToPath(url);
};
// Resolve the tree-sitter wasm files to plain filesystem paths. We must NOT use
// `import(... , { with: { type: "wasm" } })` here: Node rejects that form at
// runtime ("Import attribute type wasm is not supported"). require.resolve
// returns the on-disk path without importing the module, which is all
// Parser.init/Language.load need.
const requireWasm = createRequire(import.meta.url);
/**
 * Extract the meaningful tokens (command name and argument-like elements) of a
 * tree-sitter command node, skipping separators and redirections.
 * @param {Object} node - A tree-sitter command syntax node.
 * @returns {Array} An Array of {type, text} token objects.
 */
function parts(node) {
  const out = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    if (child.type === "command_elements") {
      for (let j = 0; j < child.childCount; j++) {
        const item = child.child(j);
        if (!item || item.type === "command_argument_sep" || item.type === "redirection") continue;
        out.push({
          type: item.type,
          text: item.text
        });
      }
      continue;
    }
    if (child.type !== "command_name" && child.type !== "command_name_expr" && child.type !== "word" && child.type !== "string" && child.type !== "raw_string" && child.type !== "concatenation") {
      continue;
    }
    out.push({
      type: child.type,
      text: child.text
    });
  }
  return out;
}
/**
 * Return the trimmed source text of a command node, preferring the enclosing
 * redirected statement so redirections are included in the captured command.
 * @param {Object} node - A tree-sitter command syntax node.
 * @returns {string} The command's source text.
 */
function source(node) {
  return (node.parent?.type === "redirected_statement" ? node.parent.text : node.text).trim();
}
/**
 * Collect all `command` descendant nodes within a parse tree node.
 * @param {Object} node - A tree-sitter syntax node (typically the root).
 * @returns {Array} An Array of command syntax nodes.
 */
function commands(node) {
  return node.descendantsOfType("command").filter(child => Boolean(child));
}
/**
 * Strip a single matching pair of surrounding single or double quotes.
 * @param {string} text - The possibly-quoted token text.
 * @returns {string} The unquoted text, or the input unchanged if not quoted.
 */
function unquote(text) {
  if (text.length < 2) return text;
  const first = text[0];
  const last = text[text.length - 1];
  if ((first === '"' || first === "'") && first === last) return text.slice(1, -1);
  return text;
}
/**
 * Expand a leading `~` (home directory) in a path-like token.
 * @param {string} text - The token possibly beginning with `~`.
 * @returns {string} The token with `~` expanded to the home directory.
 */
function home(text) {
  if (text === "~") return os.homedir();
  if (text.startsWith("~/") || text.startsWith("~\\")) return path.join(os.homedir(), text.slice(2));
  return text;
}
/**
 * Look up an environment variable, matching case-insensitively on Windows.
 * @param {string} key - The environment variable name.
 * @returns {string} The variable's value, or undefined if unset.
 */
function envValue(key) {
  if (process.platform !== "win32") return process.env[key];
  const name = Object.keys(process.env).find(item => item.toLowerCase() === key.toLowerCase());
  return name ? process.env[name] : undefined;
}
/**
 * Resolve the value of an automatic shell variable (HOME, PWD, PSHOME).
 * @param {string} key - The variable name (case-insensitive).
 * @param {string} cwd - The current working directory (value for PWD).
 * @param {string} shell - The shell executable path (PSHOME is its directory).
 * @returns {string} The variable value, or undefined if not an automatic variable.
 */
function auto(key, cwd, shell) {
  const name = key.toUpperCase();
  if (name === "HOME") return os.homedir();
  if (name === "PWD") return cwd;
  if (name === "PSHOME") return path.dirname(shell);
}
/**
 * Expand environment-variable and automatic-variable references in a token
 * (`${env:X}`, `$env:X`, `$HOME`/`$PWD`/`$PSHOME`) and then expand `~`.
 * @param {string} text - The token to expand.
 * @param {string} cwd - Current working directory for PWD/relative expansion.
 * @param {string} shell - Shell executable path for PSHOME.
 * @returns {string} The expanded token.
 */
function expand(text, cwd, shell) {
  const out = unquote(text).replace(/\$\{env:([^}]+)\}/gi, (_, key) => envValue(key) || "").replace(/\$env:([A-Za-z_][A-Za-z0-9_]*)/gi, (_, key) => envValue(key) || "").replace(/\$(HOME|PWD|PSHOME)(?=$|[\\/])/gi, (_, key) => auto(key, cwd, shell) || "");
  return home(out);
}
/**
 * Strip a PowerShell provider qualifier from a path, returning the bare path
 * only for the filesystem provider. Returns undefined for non-filesystem
 * providers (e.g. `Env:`) and leaves drive-letter paths (`C:`) untouched.
 * @param {string} text - The possibly provider-qualified path token.
 * @returns {string} The filesystem path, or undefined if not a filesystem path.
 */
function provider(text) {
  const match = text.match(/^([A-Za-z]+)::(.*)$/);
  if (match) {
    if (match[1].toLowerCase() !== "filesystem") return;
    return match[2];
  }
  const prefix = text.match(/^([A-Za-z]+):(.*)$/);
  if (!prefix) return text;
  if (prefix[1].length === 1) return text;
  return;
}
/**
 * Detect whether a token contains dynamic/computed content (subexpressions,
 * command substitution, or unresolved variables) that cannot be treated as a
 * static path for permission scanning.
 * @param {string} text - The token to inspect.
 * @param {boolean} ps - Whether the active shell is PowerShell.
 * @returns {boolean} True if the token is dynamic and not a literal path.
 */
function dynamic(text, ps) {
  if (text.startsWith("(") || text.startsWith("@(")) return true;
  if (text.includes("$(") || text.includes("${") || text.includes("`")) return true;
  if (ps) return /\$(?!env:)/i.test(text);
  return text.includes("$");
}
/**
 * Return the literal (non-glob) prefix of a token up to the first glob
 * metacharacter (`?`, `*`, `[`); returns undefined if the token begins with a
 * glob character.
 * @param {string} text - The token to inspect.
 * @returns {string} The literal prefix, or undefined if it starts with a glob char.
 */
function prefix(text) {
  const match = /[?*[]/.exec(text);
  if (!match) return text;
  if (match.index === 0) return;
  return text.slice(0, match.index);
}
/**
 * Extract the path-like arguments from a command's token list, skipping the
 * command name, flags/switches, and special leading characters. For PowerShell
 * it also follows value-taking parameters (e.g. `-Path`) to grab their value.
 * @param {Array} list - The command's tokens (first entry is the command name).
 * @param {boolean} ps - Whether the active shell is PowerShell.
 * @param {boolean} cmd - Whether the active shell is cmd.exe (affects `/`-flag handling).
 * @returns {Array} An Array of path argument strings.
 */
function pathArgs(list, ps, cmd = false) {
  if (!ps) {
    return list.slice(1).filter(item => !item.text.startsWith("-") && !(cmd && item.text.startsWith("/")) && !(list[0]?.text === "chmod" && item.text.startsWith("+"))).map(item => item.text);
  }
  const out = [];
  let want = false;
  for (const item of list.slice(1)) {
    if (want) {
      out.push(item.text);
      want = false;
      continue;
    }
    if (item.type === "command_parameter") {
      const flag = item.text.toLowerCase();
      if (SWITCHES.has(flag)) continue;
      want = FLAGS.has(flag);
      continue;
    }
    out.push(item.text);
  }
  return out;
}
/**
 * Produce a metadata-sized preview of output, keeping the tail and prefixing
 * "..." when the text exceeds MAX_METADATA_LENGTH.
 * @param {string} text - The output text to preview.
 * @returns {string} The original text or a truncated tail preview.
 */
function preview(text) {
  if (text.length <= MAX_METADATA_LENGTH) return text;
  return "...\n\n" + text.slice(-MAX_METADATA_LENGTH);
}
/**
 * Keep only the tail of the output within the given line and byte budgets,
 * truncating a final overlong line mid-character on a UTF-8 boundary.
 * @param {string} text - The full output text.
 * @param {number} maxLines - Maximum number of trailing lines to keep.
 * @param {number} maxBytes - Maximum byte budget for the kept text.
 * @returns {Object} An object {text, cut} where `cut` indicates truncation occurred.
 */
function tail(text, maxLines, maxBytes) {
  const lines = text.split("\n");
  if (lines.length <= maxLines && Buffer.byteLength(text, "utf-8") <= maxBytes) {
    return {
      text,
      cut: false
    };
  }
  const out = [];
  let bytes = 0;
  for (let i = lines.length - 1; i >= 0 && out.length < maxLines; i--) {
    const size = Buffer.byteLength(lines[i], "utf-8") + (out.length > 0 ? 1 : 0);
    if (bytes + size > maxBytes) {
      if (out.length === 0) {
        const buf = Buffer.from(lines[i], "utf-8");
        let start = buf.length - maxBytes;
        if (start < 0) start = 0;
        while (start < buf.length && (buf[start] & 0xc0) === 0x80) start++;
        out.unshift(buf.subarray(start).toString("utf-8"));
      }
      break;
    }
    out.unshift(lines[i]);
    bytes += size;
  }
  return {
    text: out.join("\n"),
    cut: true
  };
}
/**
 * Parse a command string into a tree-sitter syntax tree using the bash or
 * PowerShell grammar.
 * @param {string} command - The raw command string.
 * @param {boolean} ps - Whether to use the PowerShell grammar.
 * @returns {Effect} An effect yielding the parsed tree-sitter tree.
 */
const parse = Effect.fn("ShellTool.parse")(function* (command, ps) {
  const tree = yield* Effect.promise(() => parser().then(p => (ps ? p.ps : p.bash).parse(command)));
  if (!tree) throw new Error("Failed to parse command");
  return tree;
});
/**
 * Issue the permission prompts implied by a scan result: an external-directory
 * prompt for out-of-tree file directories and a shell-command prompt for the
 * command patterns.
 * @param {Object} ctx - Tool execution context providing `ask`.
 * @param {Object} scan - Scan result with `dirs`, `patterns`, and `always` Sets.
 * @returns {Effect} An effect that resolves once all required prompts are answered.
 */
const ask = Effect.fn("ShellTool.ask")(function* (ctx, scan) {
  if (scan.dirs.size > 0) {
    const globs = Array.from(scan.dirs).map(dir => {
      if (process.platform === "win32") return AppFileSystem.normalizePathPattern(path.join(dir, "*"));
      return path.join(dir, "*");
    });
    yield* ctx.ask({
      permission: "external_directory",
      patterns: globs,
      always: globs,
      metadata: {}
    });
  }
  if (scan.patterns.size === 0) return;
  yield* ctx.ask({
    permission: ShellID.ToolID,
    patterns: Array.from(scan.patterns),
    always: Array.from(scan.always),
    metadata: {}
  });
});
/**
 * Build the ChildProcess spec to run a command: on Windows PowerShell it
 * invokes the shell with `-Command`, otherwise it runs the command through the
 * shell's `-c`/shell option, detaching on non-Windows platforms.
 * @param {string} shell - The shell executable path.
 * @param {string} command - The command string to execute.
 * @param {string} cwd - The working directory.
 * @param {Object} env - The environment variables.
 * @returns {Object} A ChildProcess specification.
 */
function cmd(shell, command, cwd, env) {
  if (process.platform === "win32" && Shell.ps(shell)) {
    return ChildProcess.make(shell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command], {
      cwd,
      env,
      stdin: "ignore",
      detached: false
    });
  }
  return ChildProcess.make(command, [], {
    shell,
    cwd,
    env,
    stdin: "ignore",
    detached: process.platform !== "win32"
  });
}
/**
 * Lazily initialize tree-sitter and load the bash and PowerShell grammars once,
 * returning the two configured parsers.
 * @returns {Promise<Object>} Resolves to {bash, ps} parser instances.
 */
const parser = lazy(async () => {
  const {
    Parser
  } = await import("web-tree-sitter");
  const treePath = requireWasm.resolve("web-tree-sitter/tree-sitter.wasm");
  await Parser.init({
    locateFile() {
      return treePath;
    }
  });
  const bashPath = requireWasm.resolve("tree-sitter-bash/tree-sitter-bash.wasm");
  const psPath = requireWasm.resolve("tree-sitter-powershell/tree-sitter-powershell.wasm");
  const [bashLanguage, psLanguage] = await Promise.all([Language.load(bashPath), Language.load(psPath)]);
  const bash = new Parser();
  bash.setLanguage(bashLanguage);
  const ps = new Parser();
  ps.setLanguage(psLanguage);
  return {
    bash,
    ps
  };
});
/**
 * The shell tool. Selects the configured shell, parses each command to find the
 * file/path arguments and directories it touches (prompting for read/external
 * access permissions), then runs the command with streamed output, byte/line
 * truncation to a spill file, a configurable timeout, and abort handling.
 * @type {Object}
 */
export const ShellTool = Tool.define(ShellID.ToolID, Effect.gen(function* () {
  const config = yield* Config.Service;
  const spawner = yield* ChildProcessSpawner;
  const fs = yield* AppFileSystem.Service;
  const trunc = yield* Truncate.Service;
  const plugin = yield* Plugin.Service;
  /**
   * Convert a POSIX-style path to a Windows path using the shell's `cygpath`
   * (for Git Bash / Cygwin style shells); returns undefined on failure.
   * @param {string} shell - The shell executable path.
   * @param {string} text - The POSIX path to convert.
   * @returns {Effect} An effect yielding the normalized Windows path, or undefined.
   */
  const cygpath = Effect.fn("ShellTool.cygpath")(function* (shell, text) {
    const lines = yield* spawner.lines(ChildProcess.make(shell, ["-lc", 'cygpath -w -- "$1"', "_", text])).pipe(Effect.catch(() => Effect.succeed([])));
    const file = lines[0]?.trim();
    if (!file) return;
    return AppFileSystem.normalizePath(file);
  });
  /**
   * Resolve a path token to an absolute filesystem path relative to `root`,
   * handling Windows/POSIX shell quirks (cygpath for posix-shell `/` paths,
   * Windows path normalization).
   * @param {string} text - The path token to resolve.
   * @param {string} root - The base directory to resolve relative paths against.
   * @param {string} shell - The shell executable path.
   * @returns {Effect} An effect yielding the resolved absolute path.
   */
  const resolvePath = Effect.fn("ShellTool.resolvePath")(function* (text, root, shell) {
    if (process.platform === "win32") {
      if (Shell.posix(shell) && text.startsWith("/") && AppFileSystem.windowsPath(text) === text) {
        const file = yield* cygpath(shell, text);
        if (file) return file;
      }
      return AppFileSystem.normalizePath(path.resolve(root, AppFileSystem.windowsPath(text)));
    }
    return path.resolve(root, text);
  });
  /**
   * Turn a single raw command argument into a resolved absolute path, returning
   * undefined when the argument is dynamic, glob-leading, or a non-filesystem
   * PowerShell provider path.
   * @param {string} arg - The raw argument token.
   * @param {string} cwd - The current working directory.
   * @param {boolean} ps - Whether the active shell is PowerShell.
   * @param {string} shell - The shell executable path.
   * @returns {Effect} An effect yielding the resolved path, or undefined.
   */
  const argPath = Effect.fn("ShellTool.argPath")(function* (arg, cwd, ps, shell) {
    const text = ps ? expand(arg, cwd, shell) : home(unquote(arg));
    const file = text && prefix(text);
    if (!file || dynamic(file, ps)) return;
    const next = ps ? provider(file) : file;
    if (!next) return;
    return yield* resolvePath(next, cwd, shell);
  });
  /**
   * Walk every command in the parse tree to build the permission scan: collects
   * out-of-tree directories touched by file-mutating commands (into `dirs`) and
   * the command source patterns plus their argv-prefix `always` rules.
   * @param {Object} root - The tree-sitter root node of the parsed command.
   * @param {string} cwd - The current working directory.
   * @param {boolean} ps - Whether the active shell is PowerShell.
   * @param {string} shell - The shell executable path.
   * @param {Object} instance - The instance context (used to test in-tree paths).
   * @returns {Effect} An effect yielding the scan {dirs, patterns, always} of Sets.
   */
  const collect = Effect.fn("ShellTool.collect")(function* (root, cwd, ps, shell, instance) {
    const scan = {
      dirs: new Set(),
      patterns: new Set(),
      always: new Set()
    };
    const shellKind = ShellID.toKind(Shell.name(shell));
    for (const node of commands(root)) {
      const command = parts(node);
      const tokens = command.map(item => item.text);
      const cmd = ps || shellKind === "cmd" ? tokens[0]?.toLowerCase() : tokens[0];
      if (cmd && (FILES.has(cmd) || shellKind === "cmd" && CMD_FILES.has(cmd))) {
        for (const arg of pathArgs(command, ps, shellKind === "cmd")) {
          const resolved = yield* argPath(arg, cwd, ps, shell);
          log.info("resolved path", {
            arg,
            resolved
          });
          if (!resolved || containsPath(resolved, instance)) continue;
          const dir = (yield* fs.isDir(resolved)) ? resolved : path.dirname(resolved);
          scan.dirs.add(dir);
        }
      }
      if (tokens.length && (!cmd || !CWD.has(cmd))) {
        scan.patterns.add(source(node));
        scan.always.add(BashArity.prefix(tokens).join(" ") + " *");
      }
    }
    return scan;
  });
  /**
   * Build the environment for the spawned command: the process environment
   * merged with any extra variables contributed by the `shell.env` plugin hook.
   * @param {Object} ctx - Tool execution context (sessionID, callID).
   * @param {string} cwd - The working directory passed to the hook.
   * @returns {Effect} An effect yielding the merged environment Object.
   */
  const shellEnv = Effect.fn("ShellTool.shellEnv")(function* (ctx, cwd) {
    const extra = yield* plugin.trigger("shell.env", {
      cwd,
      sessionID: ctx.sessionID,
      callID: ctx.callID
    }, {
      env: {}
    });
    return {
      ...process.env,
      ...extra.env
    };
  });
  /**
   * Spawn and supervise the command process: streams combined stdout/stderr
   * (publishing live previews via `ctx.metadata`), keeps a rolling buffer and
   * spills overflow output to a truncation file, and races process exit against
   * abort and timeout, killing the process on the latter two. Returns the final
   * tool result with the (possibly truncated) output, exit code, and metadata.
   * @param {Object} input - Run input: {shell, command, cwd, env, timeout, description}.
   * @param {Object} ctx - Tool execution context (metadata, abort signal).
   * @returns {Effect} An effect yielding the tool result {title, metadata, output}.
   */
  const run = Effect.fn("ShellTool.run")(function* (input, ctx) {
    const limits = yield* trunc.limits();
    const keep = limits.maxBytes * 2;
    let full = "";
    let last = "";
    const list = [];
    let used = 0;
    let file = "";
    let sink;
    let cut = false;
    let expired = false;
    let aborted = false;
    yield* ctx.metadata({
      metadata: {
        output: "",
        description: input.description
      }
    });
    const code = yield* Effect.scoped(Effect.gen(function* () {
      const handle = yield* spawner.spawn(cmd(input.shell, input.command, input.cwd, input.env));
      yield* Effect.forkScoped(Stream.runForEach(Stream.decodeText(handle.all), chunk => {
        const size = Buffer.byteLength(chunk, "utf-8");
        list.push({
          text: chunk,
          size
        });
        used += size;
        while (used > keep && list.length > 1) {
          const item = list.shift();
          if (!item) break;
          used -= item.size;
          cut = true;
        }
        last = preview(last + chunk);
        if (file) {
          sink?.write(chunk);
        } else {
          full += chunk;
          if (Buffer.byteLength(full, "utf-8") > limits.maxBytes) {
            return trunc.write(full).pipe(Effect.andThen(next => Effect.sync(() => {
              file = next;
              cut = true;
              sink = createWriteStream(next, {
                flags: "a"
              });
              full = "";
            })), Effect.andThen(ctx.metadata({
              metadata: {
                output: last,
                description: input.description
              }
            })));
          }
        }
        return ctx.metadata({
          metadata: {
            output: last,
            description: input.description
          }
        });
      }));
      const abort = Effect.callback(resume => {
        if (ctx.abort.aborted) return resume(Effect.void);
        const handler = () => resume(Effect.void);
        ctx.abort.addEventListener("abort", handler, {
          once: true
        });
        return Effect.sync(() => ctx.abort.removeEventListener("abort", handler));
      });
      const timeout = Effect.sleep(`${input.timeout + 100} millis`);
      const exit = yield* Effect.raceAll([handle.exitCode.pipe(Effect.map(code => ({
        kind: "exit",
        code
      }))), abort.pipe(Effect.map(() => ({
        kind: "abort",
        code: null
      }))), timeout.pipe(Effect.map(() => ({
        kind: "timeout",
        code: null
      })))]);
      if (exit.kind === "abort") {
        aborted = true;
        yield* handle.kill({
          forceKillAfter: "3 seconds"
        }).pipe(Effect.orDie);
      }
      if (exit.kind === "timeout") {
        expired = true;
        yield* handle.kill({
          forceKillAfter: "3 seconds"
        }).pipe(Effect.orDie);
      }
      return exit.kind === "exit" ? exit.code : null;
    })).pipe(Effect.orDie);
    const meta = [];
    if (expired) {
      meta.push(`shell tool terminated command after exceeding timeout ${input.timeout} ms. If this command is expected to take longer and is not waiting for interactive input, retry with a larger timeout value in milliseconds.`);
    }
    if (aborted) meta.push("User aborted the command");
    const raw = list.map(item => item.text).join("");
    const end = tail(raw, limits.maxLines, limits.maxBytes);
    if (end.cut) cut = true;
    if (!file && end.cut) {
      file = yield* trunc.write(raw);
    }
    let output = end.text;
    if (!output) output = "(no output)";
    if (cut && file) {
      output = `...output truncated...\n\nFull output saved to: ${file}\n\n` + output;
    }
    if (meta.length > 0) {
      output += "\n\n<shell_metadata>\n" + meta.join("\n") + "\n</shell_metadata>";
    }
    if (sink) {
      const stream = sink;
      yield* Effect.promise(() => new Promise(resolve => {
        stream.end(() => resolve());
        stream.on("error", () => resolve());
      }));
    }
    return {
      title: input.description,
      metadata: {
        output: last || preview(output),
        exit: code,
        description: input.description,
        truncated: cut,
        ...(cut && file ? {
          outputPath: file
        } : {})
      },
      output
    };
  });
  // Factory invoked per use: resolves the configured shell, renders its prompt,
  // and returns the tool definition (description, parameters, execute). The
  // execute step resolves the workdir, validates the timeout, runs the
  // permission scan, and then runs the command.
  return () => Effect.gen(function* () {
    const cfg = yield* config.get();
    const shell = Shell.acceptable(cfg.shell);
    const name = Shell.name(shell);
    const limits = yield* trunc.limits();
    const prompt = ShellPrompt.render(name, process.platform, limits);
    log.info("shell tool using shell", {
      shell
    });
    return {
      description: prompt.description,
      parameters: prompt.parameters,
      execute: (params, ctx) => Effect.gen(function* () {
        const executeInstance = yield* InstanceState.context;
        const cwd = params.workdir ? yield* resolvePath(params.workdir, executeInstance.directory, shell) : executeInstance.directory;
        if (params.timeout !== undefined && params.timeout < 0) {
          throw new Error(`Invalid timeout value: ${params.timeout}. Timeout must be a positive number.`);
        }
        const timeout = params.timeout ?? DEFAULT_TIMEOUT;
        const ps = Shell.ps(shell);
        yield* Effect.scoped(Effect.gen(function* () {
          const tree = yield* Effect.acquireRelease(parse(params.command, ps), tree => Effect.sync(() => tree.delete()));
          const scan = yield* collect(tree.rootNode, cwd, ps, shell, executeInstance);
          if (!containsPath(cwd, executeInstance)) scan.dirs.add(cwd);
          yield* ask(ctx, scan);
        }));
        return yield* run({
          shell,
          command: params.command,
          cwd,
          env: yield* shellEnv(ctx, cwd),
          timeout,
          description: params.description
        }, ctx);
      })
    };
  });
}));