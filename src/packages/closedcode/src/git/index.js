/** @file Git service: spawns the git CLI with hardened config to query branches, status, diffs, and file contents. */
import { CrossSpawnSpawner } from "core/cross-spawn-spawner";
import { Effect, Layer, Context, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
/** Global git CLI flags applied to every invocation to make output deterministic and portable across platforms. */
const cfg = ["--no-optional-locks", "-c", "core.autocrlf=false", "-c", "core.fsmonitor=false", "-c", "core.longpaths=true", "-c", "core.symlinks=true", "-c", "core.quotepath=false"];
/**
 * Read a command result's stdout text with surrounding whitespace trimmed.
 * @param {Object} result - Command result with a text() accessor.
 * @returns {string} Trimmed stdout.
 */
const out = result => result.text().trim();
/**
 * Split NUL-delimited git output into non-empty records.
 * @param {string} text - Raw NUL-separated output (from git -z).
 * @returns {Array<string>} Non-empty fields.
 */
const nuls = text => text.split("\0").filter(Boolean);
/**
 * Build a synthetic failed command result from a thrown error.
 * @param {*} err - Error or value describing the spawn failure.
 * @returns {Object} Result with exitCode 1, empty text/stdout, and the error message in stderr.
 */
const fail = err => ({
  exitCode: 1,
  text: () => "",
  stdout: Buffer.alloc(0),
  stderr: Buffer.from(err instanceof Error ? err.message : String(err))
});
/**
 * Map a git porcelain/diff status code to a coarse change kind.
 * @param {string} code - Two-character porcelain status or single name-status letter.
 * @returns {string} One of "added", "deleted", or "modified".
 */
const kind = code => {
  if (code === "??") return "added";
  if (code.includes("U")) return "modified";
  if (code.includes("A") && !code.includes("D")) return "added";
  if (code.includes("D") && !code.includes("A")) return "deleted";
  return "modified";
};
/** Effect Context service tag for the Git service. */
export class Service extends Context.Service()("@closedcode/Git") {}
/** Effect Layer that constructs the Git service over a child-process spawner. */
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  /**
   * Run the git CLI with the hardened global flags and capture its output.
   * @param {Array<string>} args - Git subcommand arguments (appended after the global config flags).
   * @param {Object} opts - Spawn options ({cwd, env}).
   * @returns {Effect} Effect yielding {exitCode, text, stdout, stderr}; failures resolve to a synthetic failed result.
   */
  const run = Effect.fn("Git.run")(function* (args, opts) {
    const proc = ChildProcess.make("git", [...cfg, ...args], {
      cwd: opts.cwd,
      env: opts.env,
      extendEnv: true,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe"
    });
    const handle = yield* spawner.spawn(proc);
    const [stdout, stderr] = yield* Effect.all([Stream.mkString(Stream.decodeText(handle.stdout)), Stream.mkString(Stream.decodeText(handle.stderr))], {
      concurrency: 2
    });
    return {
      exitCode: yield* handle.exitCode,
      text: () => stdout,
      stdout: Buffer.from(stdout),
      stderr: Buffer.from(stderr)
    };
  }, Effect.scoped, Effect.catch(err => Effect.succeed(fail(err))));
  /**
   * Run git and return only its stdout text.
   * @param {Array<string>} args - Git subcommand arguments.
   * @param {Object} opts - Spawn options ({cwd, env}).
   * @returns {Effect} Effect yielding stdout as a string.
   */
  const text = Effect.fn("Git.text")(function* (args, opts) {
    return (yield* run(args, opts)).text();
  });
  /**
   * Run git and return its stdout split into trimmed, non-empty lines.
   * @param {Array<string>} args - Git subcommand arguments.
   * @param {Object} opts - Spawn options ({cwd, env}).
   * @returns {Effect} Effect yielding an array of non-empty lines.
   */
  const lines = Effect.fn("Git.lines")(function* (args, opts) {
    return (yield* text(args, opts)).split(/\r?\n/).map(item => item.trim()).filter(Boolean);
  });
  /**
   * List the local branch short names in a repository.
   * @param {string} cwd - Repository working directory.
   * @returns {Effect} Effect yielding an array of branch names.
   */
  const refs = Effect.fnUntraced(function* (cwd) {
    return yield* lines(["for-each-ref", "--format=%(refname:short)", "refs/heads"], {
      cwd
    });
  });
  /**
   * Resolve the configured init.defaultBranch if it exists among the repo's branches.
   * @param {string} cwd - Repository working directory.
   * @param {Array<string>} list - Existing local branch names to validate against.
   * @returns {Effect} Effect yielding {name, ref} or undefined when not configured/present.
   */
  const configured = Effect.fnUntraced(function* (cwd, list) {
    const result = yield* run(["config", "init.defaultBranch"], {
      cwd
    });
    const name = out(result);
    if (!name || !list.includes(name)) return;
    return {
      name,
      ref: name
    };
  });
  /**
   * Choose the primary remote, preferring "origin", then a sole remote, then "upstream".
   * @param {string} cwd - Repository working directory.
   * @returns {Effect} Effect yielding the chosen remote name, or undefined when none exist.
   */
  const primary = Effect.fnUntraced(function* (cwd) {
    const list = yield* lines(["remote"], {
      cwd
    });
    if (list.includes("origin")) return "origin";
    if (list.length === 1) return list[0];
    if (list.includes("upstream")) return "upstream";
    return list[0];
  });
  /**
   * Get the current checked-out branch name.
   * @param {string} cwd - Repository working directory.
   * @returns {Effect} Effect yielding the branch name, or undefined when detached/unavailable.
   */
  const branch = Effect.fn("Git.branch")(function* (cwd) {
    const result = yield* run(["symbolic-ref", "--quiet", "--short", "HEAD"], {
      cwd
    });
    if (result.exitCode !== 0) return;
    const text = out(result);
    return text || undefined;
  });
  /**
   * Get the path of the working directory relative to the repository root.
   * @param {string} cwd - Repository working directory (may be a subdirectory).
   * @returns {Effect} Effect yielding the relative prefix path, or "" at the repo root/on failure.
   */
  const prefix = Effect.fn("Git.prefix")(function* (cwd) {
    const result = yield* run(["rev-parse", "--show-prefix"], {
      cwd
    });
    if (result.exitCode !== 0) return "";
    return out(result);
  });
  /**
   * Determine the repository's default branch, trying the primary remote's HEAD,
   * then init.defaultBranch, then "main"/"master".
   * @param {string} cwd - Repository working directory.
   * @returns {Effect} Effect yielding {name, ref} for the default branch, or undefined when undeterminable.
   */
  const defaultBranch = Effect.fn("Git.defaultBranch")(function* (cwd) {
    const remote = yield* primary(cwd);
    if (remote) {
      const head = yield* run(["symbolic-ref", `refs/remotes/${remote}/HEAD`], {
        cwd
      });
      if (head.exitCode === 0) {
        const ref = out(head).replace(/^refs\/remotes\//, "");
        const name = ref.startsWith(`${remote}/`) ? ref.slice(`${remote}/`.length) : "";
        if (name) return {
          name,
          ref
        };
      }
    }
    const list = yield* refs(cwd);
    const next = yield* configured(cwd, list);
    if (next) return next;
    if (list.includes("main")) return {
      name: "main",
      ref: "main"
    };
    if (list.includes("master")) return {
      name: "master",
      ref: "master"
    };
  });
  /**
   * Check whether the repository has a resolvable HEAD commit (i.e. at least one commit).
   * @param {string} cwd - Repository working directory.
   * @returns {Effect} Effect yielding true when HEAD verifies.
   */
  const hasHead = Effect.fn("Git.hasHead")(function* (cwd) {
    const result = yield* run(["rev-parse", "--verify", "HEAD"], {
      cwd
    });
    return result.exitCode === 0;
  });
  /**
   * Compute the merge base (best common ancestor) of two revisions.
   * @param {string} cwd - Repository working directory.
   * @param {string} base - The base revision.
   * @param {string} head - The other revision (defaults to "HEAD").
   * @returns {Effect} Effect yielding the merge-base commit hash, or undefined when none/on failure.
   */
  const mergeBase = Effect.fn("Git.mergeBase")(function* (cwd, base, head = "HEAD") {
    const result = yield* run(["merge-base", base, head], {
      cwd
    });
    if (result.exitCode !== 0) return;
    const text = out(result);
    return text || undefined;
  });
  /**
   * Read the contents of a file at a specific revision via `git show`.
   * @param {string} cwd - Repository working directory.
   * @param {string} ref - Revision/ref to read from.
   * @param {string} file - File path relative to the repo (or to prefix).
   * @param {string} prefix - Optional path prefix prepended to file.
   * @returns {Effect} Effect yielding the file text, or "" when missing/binary/on failure.
   */
  const show = Effect.fn("Git.show")(function* (cwd, ref, file, prefix = "") {
    const target = prefix ? `${prefix}${file}` : file;
    const result = yield* run(["show", `${ref}:${target}`], {
      cwd
    });
    if (result.exitCode !== 0) return "";
    if (result.stdout.includes(0)) return "";
    return result.text();
  });
  /**
   * List the working-tree changes (including untracked files) for a repository.
   * @param {string} cwd - Repository working directory.
   * @returns {Effect} Effect yielding an array of {file, code, status} entries.
   */
  const status = Effect.fn("Git.status")(function* (cwd) {
    return nuls(yield* text(["status", "--porcelain=v1", "--untracked-files=all", "--no-renames", "-z", "--", "."], {
      cwd
    })).flatMap(item => {
      const file = item.slice(3);
      if (!file) return [];
      const code = item.slice(0, 2);
      return [{
        file,
        code,
        status: kind(code)
      }];
    });
  });
  /**
   * List the name-status changes between a ref and the working tree.
   * @param {string} cwd - Repository working directory.
   * @param {string} ref - Revision to diff against.
   * @returns {Effect} Effect yielding an array of {file, code, status} entries.
   */
  const diff = Effect.fn("Git.diff")(function* (cwd, ref) {
    const list = nuls(yield* text(["diff", "--no-ext-diff", "--no-renames", "--name-status", "-z", ref, "--", "."], {
      cwd
    }));
    return list.flatMap((code, idx) => {
      if (idx % 2 !== 0) return [];
      const file = list[idx + 1];
      if (!code || !file) return [];
      return [{
        file,
        code,
        status: kind(code)
      }];
    });
  });
  /**
   * Compute per-file added/deleted line counts between a ref and the working tree.
   * @param {string} cwd - Repository working directory.
   * @param {string} ref - Revision to diff against.
   * @returns {Effect} Effect yielding an array of {file, additions, deletions} entries (binary files report 0/0).
   */
  const stats = Effect.fn("Git.stats")(function* (cwd, ref) {
    return nuls(yield* text(["diff", "--no-ext-diff", "--no-renames", "--numstat", "-z", ref, "--", "."], {
      cwd
    })).flatMap(item => {
      const a = item.indexOf("\t");
      const b = item.indexOf("\t", a + 1);
      if (a === -1 || b === -1) return [];
      const file = item.slice(b + 1);
      if (!file) return [];
      const adds = item.slice(0, a);
      const dels = item.slice(a + 1, b);
      const additions = adds === "-" ? 0 : Number.parseInt(adds || "0", 10);
      const deletions = dels === "-" ? 0 : Number.parseInt(dels || "0", 10);
      return [{
        file,
        additions: Number.isFinite(additions) ? additions : 0,
        deletions: Number.isFinite(deletions) ? deletions : 0
      }];
    });
  });
  return Service.of({
    run,
    branch,
    prefix,
    defaultBranch,
    hasHead,
    mergeBase,
    show,
    status,
    diff,
    stats
  });
}));
/** Git service Layer with its default cross-spawn spawner dependency provided. */
export const defaultLayer = layer.pipe(Layer.provide(CrossSpawnSpawner.defaultLayer));
export * as Git from "./index.js";