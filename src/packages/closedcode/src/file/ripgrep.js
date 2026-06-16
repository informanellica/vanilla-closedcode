/** @file Ripgrep service: locates (or optionally downloads) the `rg` binary and exposes file-listing, content search, and directory-tree streaming as Effects. */
import path from "path";
import { AppFileSystem } from "core/filesystem";
import { Cause, Context, Effect, Fiber, Layer, Queue, Schema, Stream } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/unstable/http";
import { ChildProcess } from "effect/unstable/process";
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import { CrossSpawnSpawner } from "core/cross-spawn-spawner";
import { Global } from "core/global";
import * as Log from "core/util/log";
import { sanitizedProcessEnv } from "core/util/closedcode-process";
import { which } from "#util/which.js";
import { zod } from "#util/effect-zod.js";
import { NonNegativeInt, withStatics } from "#util/schema.js";
const log = Log.create({
  service: "ripgrep"
});
// Tool binaries (ripgrep, LSP servers, ...) are NOT auto-downloaded by default:
// using search/file-listing must not trigger unsolicited network egress. Opt in
// with CLOSEDCODE_ENABLE_TOOL_DOWNLOAD=1 (CLOSEDCODE_ENABLE_LSP_DOWNLOAD also works).
const TOOL_DOWNLOAD_ENABLED = ["1", "true"].includes(process.env["CLOSEDCODE_ENABLE_TOOL_DOWNLOAD"]) || ["1", "true"].includes(process.env["CLOSEDCODE_ENABLE_LSP_DOWNLOAD"]);
const VERSION = "15.1.0";
const PLATFORM = {
  "arm64-darwin": {
    platform: "aarch64-apple-darwin",
    extension: "tar.gz"
  },
  "arm64-linux": {
    platform: "aarch64-unknown-linux-gnu",
    extension: "tar.gz"
  },
  "x64-darwin": {
    platform: "x86_64-apple-darwin",
    extension: "tar.gz"
  },
  "x64-linux": {
    platform: "x86_64-unknown-linux-musl",
    extension: "tar.gz"
  },
  "arm64-win32": {
    platform: "aarch64-pc-windows-msvc",
    extension: "zip"
  },
  "ia32-win32": {
    platform: "i686-pc-windows-msvc",
    extension: "zip"
  },
  "x64-win32": {
    platform: "x86_64-pc-windows-msvc",
    extension: "zip"
  }
};
const TimeStats = Schema.Struct({
  secs: NonNegativeInt,
  nanos: NonNegativeInt,
  human: Schema.String
});
const Stats = Schema.Struct({
  elapsed: TimeStats,
  searches: NonNegativeInt,
  searches_with_match: NonNegativeInt,
  bytes_searched: NonNegativeInt,
  bytes_printed: NonNegativeInt,
  matched_lines: NonNegativeInt,
  matches: NonNegativeInt
});
const PathText = Schema.Struct({
  text: Schema.String
});
const Begin = Schema.Struct({
  type: Schema.Literal("begin"),
  data: Schema.Struct({
    path: PathText
  })
});
export const SearchMatch = Schema.Struct({
  path: PathText,
  lines: Schema.Struct({
    text: Schema.String
  }),
  line_number: NonNegativeInt,
  absolute_offset: NonNegativeInt,
  submatches: Schema.Array(Schema.Struct({
    match: Schema.Struct({
      text: Schema.String
    }),
    start: NonNegativeInt,
    end: NonNegativeInt
  }))
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
export const Match = Schema.Struct({
  type: Schema.Literal("match"),
  data: SearchMatch
});
const End = Schema.Struct({
  type: Schema.Literal("end"),
  data: Schema.Struct({
    path: PathText,
    binary_offset: Schema.NullOr(NonNegativeInt),
    stats: Stats
  })
});
const Summary = Schema.Struct({
  type: Schema.Literal("summary"),
  data: Schema.Struct({
    elapsed_total: TimeStats,
    stats: Stats
  })
});
const Result = Schema.Union([Begin, Match, End, Summary]);
const decodeResult = Schema.decodeUnknownEffect(Schema.fromJsonString(Result));
/** Effect service tag for the ripgrep wrapper. */
export class Service extends Context.Service()("@closedcode/Ripgrep") {}
/**
 * Build a sanitized environment for spawning ripgrep, dropping RIPGREP_CONFIG_PATH.
 * @returns {Object} Environment variable map.
 */
function env() {
  const env = sanitizedProcessEnv();
  delete env.RIPGREP_CONFIG_PATH;
  return env;
}
/**
 * Normalize an AbortSignal's reason into an Error (defaulting to an AbortError).
 * @param {AbortSignal} signal - The abort signal whose reason to convert.
 * @returns {Error} The abort error.
 */
function aborted(signal) {
  const err = signal?.reason;
  if (err instanceof Error) return err;
  const out = new Error("Aborted");
  out.name = "AbortError";
  return out;
}
/**
 * Produce an Effect that fails when the given signal aborts (never resolves otherwise).
 * @param {AbortSignal} signal - The abort signal to watch (may be undefined).
 * @returns {Effect} Effect that fails with the abort error.
 */
function waitForAbort(signal) {
  if (!signal) return Effect.never;
  if (signal.aborted) return Effect.fail(aborted(signal));
  return Effect.callback(resume => {
    const onabort = () => resume(Effect.fail(aborted(signal)));
    signal.addEventListener("abort", onabort, {
      once: true
    });
    return Effect.sync(() => signal.removeEventListener("abort", onabort));
  });
}
/**
 * Build a named RipgrepError from stderr text and an exit code.
 * @param {string} stderr - The captured stderr output.
 * @param {number} code - The process exit code.
 * @returns {Error} The constructed error.
 */
function error(stderr, code) {
  const err = new Error(stderr.trim() || `ripgrep failed with code ${code}`);
  err.name = "RipgrepError";
  return err;
}
/**
 * Normalize a ripgrep-reported path, stripping a leading `./` (or `.\`) prefix.
 * @param {string} file - The path as emitted by ripgrep.
 * @returns {string} The cleaned, normalized path.
 */
function clean(file) {
  return path.normalize(file.replace(/^\.[\\/]/, ""));
}
/**
 * Return a copy of a match-data record with its path text cleaned.
 * @param {Object} data - A ripgrep match `data` object containing a `path.text`.
 * @returns {Object} The record with normalized path text.
 */
function row(data) {
  return {
    ...data,
    path: {
      ...data.path,
      text: clean(data.path.text)
    }
  };
}
/**
 * Decode one line of ripgrep `--json` output into a Result, wrapping decode failures.
 * @param {string} line - A single JSON line from ripgrep stdout.
 * @returns {Effect} Effect yielding the decoded Result or failing with an Error.
 */
function parse(line) {
  return decodeResult(line).pipe(Effect.mapError(cause => new Error("invalid ripgrep output", {
    cause
  })));
}
/**
 * Fail a stream queue with the given error.
 * @param {Object} queue - The Effect Queue backing a callback stream.
 * @param {*} err - The error to fail with.
 * @returns {void}
 */
function fail(queue, err) {
  Queue.failCauseUnsafe(queue, Cause.fail(err));
}
/**
 * Build ripgrep CLI args for listing files.
 * @param {Object} input - Listing options (follow, hidden, maxDepth, glob).
 * @returns {Array} Array of argument strings.
 */
function filesArgs(input) {
  const args = ["--no-config", "--files", "--glob=!.git/*"];
  if (input.follow) args.push("--follow");
  if (input.hidden !== false) args.push("--hidden");
  if (input.hidden === false) args.push("--glob=!.*");
  if (input.maxDepth !== undefined) args.push(`--max-depth=${input.maxDepth}`);
  if (input.glob) {
    for (const glob of input.glob) args.push(`--glob=${glob}`);
  }
  args.push(".");
  return args;
}
/**
 * Build ripgrep CLI args for a content search (JSON output).
 * @param {Object} input - Search options (follow, glob, limit, pattern, file).
 * @returns {Array} Array of argument strings.
 */
function searchArgs(input) {
  const args = ["--no-config", "--json", "--hidden", "--glob=!.git/*", "--no-messages"];
  if (input.follow) args.push("--follow");
  if (input.glob) {
    for (const glob of input.glob) args.push(`--glob=${glob}`);
  }
  if (input.limit) args.push(`--max-count=${input.limit}`);
  args.push("--", input.pattern, ...(input.file ?? ["."]));
  return args;
}
/**
 * Race an effect against an optional abort signal, failing early if it aborts.
 * @param {Effect} effect - The effect to run.
 * @param {AbortSignal} signal - The abort signal (may be undefined).
 * @returns {Effect} The (possibly raced) effect.
 */
function raceAbort(effect, signal) {
  return signal ? effect.pipe(Effect.raceFirst(waitForAbort(signal))) : effect;
}
/**
 * Layer providing the Ripgrep service. Resolves the `rg` binary (PATH, cached
 * download dir, or optional GitHub download when tool-download is enabled) and
 * exposes `files`, `tree`, and `search`.
 * @type {Layer}
 */
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const fs = yield* AppFileSystem.Service;
  const http = HttpClient.filterStatusOk(yield* HttpClient.HttpClient);
  const spawner = yield* ChildProcessSpawner;
  /**
   * Spawn a process and collect its full stdout, stderr, and exit code.
   * @param {string} command - Executable to run.
   * @param {Array} args - Argument list.
   * @param {Object} opts - Spawn options (e.g. cwd).
   * @returns {Effect} Effect yielding {stdout, stderr, code}.
   */
  const run = Effect.fnUntraced(function* (command, args, opts) {
    const handle = yield* spawner.spawn(ChildProcess.make(command, args, {
      cwd: opts?.cwd,
      extendEnv: true,
      stdin: "ignore"
    }));
    const [stdout, stderr, code] = yield* Effect.all([Stream.mkString(Stream.decodeText(handle.stdout)), Stream.mkString(Stream.decodeText(handle.stderr)), handle.exitCode], {
      concurrency: "unbounded"
    });
    return {
      stdout,
      stderr,
      code
    };
  }, Effect.scoped);
  /**
   * Extract the downloaded ripgrep archive (zip via PowerShell, tar.gz via tar) and copy the binary to target.
   * @param {string} archive - Path to the downloaded archive file.
   * @param {Object} config - Platform config {platform, extension}.
   * @param {string} target - Destination path for the extracted `rg` binary.
   * @returns {Effect} Effect that completes once the binary is in place.
   */
  const extract = Effect.fnUntraced(function* (archive, config, target) {
    const dir = yield* fs.makeTempDirectoryScoped({
      directory: Global.Path.bin,
      prefix: "ripgrep-"
    });
    if (config.extension === "zip") {
      const shell = (yield* Effect.sync(() => which("powershell.exe") ?? which("pwsh.exe"))) ?? "powershell.exe";
      const result = yield* run(shell, ["-NoProfile", "-NonInteractive", "-Command", `$global:ProgressPreference = 'SilentlyContinue'; Expand-Archive -LiteralPath '${archive.replaceAll("'", "''")}' -DestinationPath '${dir.replaceAll("'", "''")}' -Force`]);
      if (result.code !== 0) {
        return yield* Effect.fail(error(result.stderr || result.stdout, result.code));
      }
    }
    if (config.extension === "tar.gz") {
      const result = yield* run("tar", ["-xzf", archive, "-C", dir]);
      if (result.code !== 0) {
        return yield* Effect.fail(error(result.stderr || result.stdout, result.code));
      }
    }
    const extracted = path.join(dir, `ripgrep-${VERSION}-${config.platform}`, process.platform === "win32" ? "rg.exe" : "rg");
    if (!(yield* fs.isFile(extracted))) {
      return yield* Effect.fail(new Error(`ripgrep archive did not contain executable: ${extracted}`));
    }
    yield* fs.copyFile(extracted, target);
    if (process.platform === "win32") return;
    yield* fs.chmod(target, 0o755);
  }, Effect.scoped);
  /**
   * Cached resolution of the ripgrep binary path: prefers a system `rg` on PATH,
   * then a previously downloaded copy, otherwise downloads it (if enabled).
   * @type {Effect}
   */
  const filepath = yield* Effect.cached(Effect.gen(function* () {
    const system = yield* Effect.sync(() => which(process.platform === "win32" ? "rg.exe" : "rg"));
    if (system && (yield* fs.isFile(system).pipe(Effect.orDie))) return system;
    const target = path.join(Global.Path.bin, `rg${process.platform === "win32" ? ".exe" : ""}`);
    if (yield* fs.isFile(target).pipe(Effect.orDie)) return target;
    const platformKey = `${process.arch}-${process.platform}`;
    const config = PLATFORM[platformKey];
    if (!config) {
      return yield* Effect.fail(new Error(`unsupported platform for ripgrep: ${platformKey}`));
    }
    if (!TOOL_DOWNLOAD_ENABLED) {
      return yield* Effect.fail(new Error("ripgrep (rg) is not installed and auto-download is disabled. Install ripgrep on your PATH, or set CLOSEDCODE_ENABLE_TOOL_DOWNLOAD=1 to allow downloading it."));
    }
    const filename = `ripgrep-${VERSION}-${config.platform}.${config.extension}`;
    const url = `https://github.com/BurntSushi/ripgrep/releases/download/${VERSION}/${filename}`;
    const archive = path.join(Global.Path.bin, filename);
    log.info("downloading ripgrep", {
      url
    });
    yield* fs.ensureDir(Global.Path.bin).pipe(Effect.orDie);
    const bytes = yield* HttpClientRequest.get(url).pipe(http.execute, Effect.flatMap(response => response.arrayBuffer), Effect.mapError(cause => cause instanceof Error ? cause : new Error(String(cause))));
    if (bytes.byteLength === 0) {
      return yield* Effect.fail(new Error(`failed to download ripgrep from ${url}`));
    }
    yield* fs.writeWithDirs(archive, new Uint8Array(bytes));
    yield* extract(archive, config, target);
    yield* fs.remove(archive, {
      force: true
    }).pipe(Effect.ignore);
    return target;
  }));
  /**
   * Ensure the working directory exists, failing with an ENOENT-style error otherwise.
   * @param {string} cwd - Directory expected to exist.
   * @returns {Effect} Effect that completes if the directory exists, else fails.
   */
  const check = Effect.fnUntraced(function* (cwd) {
    if (yield* fs.isDir(cwd).pipe(Effect.orDie)) return;
    return yield* Effect.fail(Object.assign(new Error(`No such file or directory: '${cwd}'`), {
      code: "ENOENT",
      errno: -2,
      path: cwd
    }));
  });
  /**
   * Build a ChildProcess spec for the resolved ripgrep binary.
   * @param {string} cwd - Working directory for the process.
   * @param {Array} args - Ripgrep argument list.
   * @returns {Effect} Effect yielding the ChildProcess spec.
   */
  const command = Effect.fnUntraced(function* (cwd, args) {
    const binary = yield* filepath;
    return ChildProcess.make(binary, args, {
      cwd,
      env: env(),
      extendEnv: true,
      stdin: "ignore"
    });
  });
  /**
   * Stream the list of files under a directory as cleaned path strings, honoring an abort signal.
   * @param {Object} input - {cwd, follow, hidden, maxDepth, glob, signal}.
   * @returns {Stream} Stream of file path strings.
   */
  const files = input => Stream.callback(queue => Effect.gen(function* () {
    yield* Effect.forkScoped(Effect.gen(function* () {
      yield* check(input.cwd);
      const handle = yield* spawner.spawn(yield* command(input.cwd, filesArgs(input)));
      const stderr = yield* Stream.mkString(Stream.decodeText(handle.stderr)).pipe(Effect.forkScoped);
      const stdout = yield* Stream.decodeText(handle.stdout).pipe(Stream.splitLines, Stream.filter(line => line.length > 0), Stream.runForEach(line => Effect.sync(() => Queue.offerUnsafe(queue, clean(line)))), Effect.forkScoped);
      const code = yield* raceAbort(handle.exitCode, input.signal);
      yield* Fiber.join(stdout);
      if (code === 0 || code === 1) {
        Queue.endUnsafe(queue);
        return;
      }
      fail(queue, error(yield* Fiber.join(stderr), code));
    }).pipe(Effect.catch(err => Effect.sync(() => {
      fail(queue, err);
    }))));
  }));
  /**
   * Run a content search and collect match rows, reporting partiality on exit code 2.
   * @param {Object} input - {cwd, pattern, file, glob, follow, limit, signal}.
   * @returns {Effect} Effect yielding {items, partial}.
   */
  const search = Effect.fn("Ripgrep.search")(function* (input) {
    yield* check(input.cwd);
    const program = Effect.scoped(Effect.gen(function* () {
      const handle = yield* spawner.spawn(yield* command(input.cwd, searchArgs(input)));
      const [items, stderr, code] = yield* Effect.all([Stream.decodeText(handle.stdout).pipe(Stream.splitLines, Stream.filter(line => line.length > 0), Stream.mapEffect(parse), Stream.filter(item => item.type === "match"), Stream.map(item => row(item.data)), Stream.runCollect, Effect.map(chunk => [...chunk])), Stream.mkString(Stream.decodeText(handle.stderr)), handle.exitCode], {
        concurrency: "unbounded"
      });
      if (code !== 0 && code !== 1 && code !== 2) {
        return yield* Effect.fail(error(stderr, code));
      }
      return {
        items: code === 1 ? [] : items,
        partial: code === 2
      };
    }));
    return yield* raceAbort(program, input.signal);
  });
  /**
   * Build a breadth-first directory-tree listing (directories only) up to an optional limit.
   * @param {Object} input - {cwd, signal, limit}.
   * @returns {Effect} Effect yielding a newline-joined tree string (with a truncation note when limited).
   */
  const tree = Effect.fn("Ripgrep.tree")(function* (input) {
    log.info("tree", input);
    const list = Array.from(yield* files({
      cwd: input.cwd,
      signal: input.signal
    }).pipe(Stream.runCollect));
    /**
     * Get or create a named child node under a tree node.
     * @param {Object} node - Parent node with a `children` Map.
     * @param {string} name - Child directory name.
     * @returns {Object} The existing or newly created child node.
     */
    function child(node, name) {
      const item = node.children.get(name);
      if (item) return item;
      const next = {
        name,
        children: new Map()
      };
      node.children.set(name, next);
      return next;
    }
    /**
     * Count all descendant nodes of a tree node (recursive).
     * @param {Object} node - The node whose descendants to count.
     * @returns {number} Total descendant count.
     */
    function count(node) {
      return Array.from(node.children.values()).reduce((sum, child) => sum + 1 + count(child), 0);
    }
    const root = {
      name: "",
      children: new Map()
    };
    for (const file of list) {
      if (file.includes(".opencode") || file.includes(".closedcode")) continue;
      const parts = file.split(path.sep);
      if (parts.length < 2) continue;
      let node = root;
      for (const part of parts.slice(0, -1)) {
        node = child(node, part);
      }
    }
    const total = count(root);
    const limit = input.limit ?? total;
    const lines = [];
    const queue = Array.from(root.children.values()).sort((a, b) => a.name.localeCompare(b.name)).map(node => ({
      node,
      path: node.name
    }));
    let used = 0;
    for (let i = 0; i < queue.length && used < limit; i++) {
      const item = queue[i];
      lines.push(item.path);
      used++;
      queue.push(...Array.from(item.node.children.values()).sort((a, b) => a.name.localeCompare(b.name)).map(node => ({
        node,
        path: `${item.path}/${node.name}`
      })));
    }
    if (total > used) lines.push(`[${total - used} truncated]`);
    return lines.join("\n");
  });
  return Service.of({
    files,
    tree,
    search
  });
}));
export const defaultLayer = layer.pipe(Layer.provide(FetchHttpClient.layer), Layer.provide(AppFileSystem.defaultLayer), Layer.provide(CrossSpawnSpawner.defaultLayer));
export * as Ripgrep from "./ripgrep.js";