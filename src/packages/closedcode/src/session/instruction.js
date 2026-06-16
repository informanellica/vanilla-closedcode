/**
 * @file Instruction loading: discovers and reads project/global/configured
 * instruction files (AGENTS.md and friends), fetches remote instruction URLs,
 * and attaches nearby instruction files when the model reads source files.
 */
import path from "path";
import { Effect, Layer, Context } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/unstable/http";
import { Config } from "#config/config.js";
import { InstanceState } from "#effect/instance-state.js";
import { Flag } from "core/flag/flag";
import { AppFileSystem } from "core/filesystem";
import { withTransientReadRetry } from "#util/effect-http-client.js";
import { Global } from "core/global";
const FILES = ["AGENTS.md", "CONTEXT.md" // deprecated
];
/**
 * Collect the set of file paths already loaded into context via completed,
 * non-compacted `read` tool calls (from each tool result's `metadata.loaded`).
 * @param {Array} messages - Session messages, each with a `parts` array.
 * @returns {Set} A set of string file paths already read.
 */
function extract(messages) {
  const paths = new Set();
  for (const msg of messages) {
    for (const part of msg.parts) {
      if (part.type === "tool" && part.tool === "read" && part.state.status === "completed") {
        if (part.state.time.compacted) continue;
        const loaded = part.state.metadata?.loaded;
        if (!loaded || !Array.isArray(loaded)) continue;
        for (const p of loaded) {
          if (typeof p === "string") paths.add(p);
        }
      }
    }
  }
  return paths;
}
/** Effect service tag for the instruction-loading API (clear/systemPaths/system/find/resolve). */
export class Service extends Context.Service()("@closedcode/Instruction") {}
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const cfg = yield* Config.Service;
  const fs = yield* AppFileSystem.Service;
  const global = yield* Global.Service;
  const http = HttpClient.filterStatusOk(withTransientReadRetry(yield* HttpClient.HttpClient));
  const globalFiles = [path.join(global.config, "AGENTS.md")];
  const state = yield* InstanceState.make(Effect.fn("Instruction.state")(() => Effect.succeed({
    // Track which instruction files have already been attached for a given assistant message.
    claims: new Map()
  })));
  /**
   * Glob a relative instruction pattern upward from the working directory to
   * the worktree root (or from the global config dir when project config is
   * disabled), swallowing errors as an empty result.
   * @param {string} instruction - Relative glob pattern for instruction files.
   * @returns {Effect} An Effect yielding an array of matched file paths.
   */
  const relative = Effect.fnUntraced(function* (instruction) {
    const ctx = yield* InstanceState.context;
    if (!Flag.CLOSEDCODE_DISABLE_PROJECT_CONFIG) {
      return yield* fs.globUp(instruction, ctx.directory, ctx.worktree).pipe(Effect.catch(() => Effect.succeed([])));
    }
    return yield* fs.globUp(instruction, global.config, global.config).pipe(Effect.catch(() => Effect.succeed([])));
  });
  /**
   * Read an instruction file's contents, returning an empty string on error.
   * @param {string} filepath - Absolute path to the instruction file.
   * @returns {Effect} An Effect yielding the file contents (or "" on failure).
   */
  const read = Effect.fnUntraced(function* (filepath) {
    return yield* fs.readFileString(filepath).pipe(Effect.catch(() => Effect.succeed("")));
  });
  /**
   * Fetch a remote instruction URL (5s timeout), decoding the body as text and
   * returning an empty string on any failure.
   * @param {string} url - HTTP(S) URL of the remote instruction document.
   * @returns {Effect} An Effect yielding the decoded body text (or "" on failure).
   */
  const fetch = Effect.fnUntraced(function* (url) {
    const res = yield* http.execute(HttpClientRequest.get(url)).pipe(Effect.timeout(5000), Effect.catch(() => Effect.succeed(null)));
    if (!res) return "";
    const body = yield* res.arrayBuffer.pipe(Effect.catch(() => Effect.succeed(new ArrayBuffer(0))));
    return new TextDecoder().decode(body);
  });
  /**
   * Forget the per-message record of which instruction files have already been
   * attached for the given assistant message.
   * @param {string} messageID - The assistant message id whose claims to clear.
   * @returns {Effect} An Effect that mutates the in-memory claims map.
   */
  const clear = Effect.fn("Instruction.clear")(function* (messageID) {
    const s = yield* InstanceState.get(state);
    s.claims.delete(messageID);
  });
  /**
   * Resolve the set of system-level instruction file paths: the first existing
   * global AGENTS.md, the first project-level match (unless disabled), and any
   * local (non-URL) paths from config.instructions (with ~ expansion and globs).
   * @returns {Effect} An Effect yielding a Set of absolute instruction file paths.
   */
  const systemPaths = Effect.fn("Instruction.systemPaths")(function* () {
    const config = yield* cfg.get();
    const ctx = yield* InstanceState.context;
    const paths = new Set();
    for (const file of globalFiles) {
      if (yield* fs.existsSafe(file)) {
        paths.add(path.resolve(file));
        break;
      }
    }

    // The first project-level match wins so we don't stack instruction files from every ancestor.
    if (!Flag.CLOSEDCODE_DISABLE_PROJECT_CONFIG) {
      for (const file of FILES) {
        const matches = yield* fs.findUp(file, ctx.directory, ctx.worktree);
        if (matches.length > 0) {
          matches.forEach(item => paths.add(path.resolve(item)));
          break;
        }
      }
    }
    if (config.instructions) {
      for (const raw of config.instructions) {
        if (raw.startsWith("https://") || raw.startsWith("http://")) continue;
        const instruction = raw.startsWith("~/") ? path.join(global.home, raw.slice(2)) : raw;
        const matches = yield* (path.isAbsolute(instruction) ? fs.glob(path.basename(instruction), {
          cwd: path.dirname(instruction),
          absolute: true,
          include: "file"
        }) : relative(instruction)).pipe(Effect.catch(() => Effect.succeed([])));
        matches.forEach(item => paths.add(path.resolve(item)));
      }
    }
    return paths;
  });
  /**
   * Build the system instruction blocks: read all local system instruction
   * files and fetch all configured remote instruction URLs, formatting each
   * non-empty result as "Instructions from: <source>\n<content>".
   * @returns {Effect} An Effect yielding an array of formatted instruction strings.
   */
  const system = Effect.fn("Instruction.system")(function* () {
    const config = yield* cfg.get();
    const paths = yield* systemPaths();
    const urls = (config.instructions ?? []).filter(item => item.startsWith("https://") || item.startsWith("http://"));
    const files = yield* Effect.forEach(Array.from(paths), read, {
      concurrency: 8
    });
    const remote = yield* Effect.forEach(urls, fetch, {
      concurrency: 4
    });
    return [...Array.from(paths).flatMap((item, i) => files[i] ? [`Instructions from: ${item}\n${files[i]}`] : []), ...urls.flatMap((item, i) => remote[i] ? [`Instructions from: ${item}\n${remote[i]}`] : [])];
  });
  /**
   * Find the first known instruction file (from FILES) directly inside a
   * directory.
   * @param {string} dir - Directory to look in.
   * @returns {Effect} An Effect yielding the resolved file path, or undefined if none exists.
   */
  const find = Effect.fn("Instruction.find")(function* (dir) {
    for (const file of FILES) {
      const filepath = path.resolve(path.join(dir, file));
      if (yield* fs.existsSafe(filepath)) return filepath;
    }
    return undefined;
  });
  /**
   * Given a file the model just read, walk upward from that file to the
   * worktree root and attach any nearby instruction files not already covered
   * by system paths, prior reads, or earlier attachments for this message.
   * Each instruction file is attached at most once per message.
   * @param {Array} messages - Current session messages (to detect already-loaded files).
   * @param {string} filepath - The source file path that was read.
   * @param {string} messageID - The assistant message id used to dedupe attachments.
   * @returns {Effect} An Effect yielding an array of `{ filepath, content }` instruction attachments.
   */
  const resolve = Effect.fn("Instruction.resolve")(function* (messages, filepath, messageID) {
    const sys = yield* systemPaths();
    const already = extract(messages);
    const results = [];
    const s = yield* InstanceState.get(state);
    const root = path.resolve(yield* InstanceState.directory);
    const target = path.resolve(filepath);
    let current = path.dirname(target);

    // Walk upward from the file being read and attach nearby instruction files once per message.
    while (current.startsWith(root) && current !== root) {
      const found = yield* find(current);
      if (!found || found === target || sys.has(found) || already.has(found)) {
        current = path.dirname(current);
        continue;
      }
      let set = s.claims.get(messageID);
      if (!set) {
        set = new Set();
        s.claims.set(messageID, set);
      }
      if (set.has(found)) {
        current = path.dirname(current);
        continue;
      }
      set.add(found);
      const content = yield* read(found);
      if (content) {
        results.push({
          filepath: found,
          content: `Instructions from: ${found}\n${content}`
        });
      }
      current = path.dirname(current);
    }
    return results;
  });
  return Service.of({
    clear,
    systemPaths,
    system,
    find,
    resolve
  });
}));
export const defaultLayer = layer.pipe(Layer.provide(Config.defaultLayer), Layer.provide(Global.layer), Layer.provide(AppFileSystem.defaultLayer), Layer.provide(FetchHttpClient.layer));
/**
 * Public helper returning the set of file paths already read into context.
 * @param {Array} messages - Session messages to inspect.
 * @returns {Set} A set of string file paths already loaded via read tool calls.
 */
export function loaded(messages) {
  return extract(messages);
}
export * as Instruction from "./instruction.js";