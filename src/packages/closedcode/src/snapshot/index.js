import { Cause, Duration, Effect, Layer, Schedule, Schema, Semaphore, Context, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { formatPatch, structuredPatch } from "diff";
import path from "path";
import { CrossSpawnSpawner } from "core/cross-spawn-spawner";
import { InstanceState } from "#effect/instance-state.js";
import { AppFileSystem } from "core/filesystem";
import { Hash } from "core/util/hash";
import { Config } from "#config/config.js";
import { Global } from "core/global";
import * as Log from "core/util/log";
import { NonNegativeInt, withStatics } from "#util/schema.js";
import { zod } from "#util/effect-zod.js";
/**
 * @file Snapshot service: maintains a per-worktree shadow git repository (a
 * separate git-dir under the data directory) so file states can be tracked,
 * diffed, restored, and reverted without touching the project's own VCS.
 */

/** Schema describing a snapshot patch: a tree hash plus the list of touched files. */
export const Patch = Schema.Struct({
  hash: Schema.String,
  files: Schema.mutable(Schema.Array(Schema.String))
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
/** Schema describing a single file's diff: patch text, add/delete counts, and status. */
export const FileDiff = Schema.Struct({
  file: Schema.String,
  patch: Schema.String,
  additions: NonNegativeInt,
  deletions: NonNegativeInt,
  status: Schema.optional(Schema.Literals(["added", "deleted", "modified"]))
}).annotate({
  identifier: "SnapshotFileDiff"
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
const log = Log.create({
  service: "snapshot"
});
const prune = "7.days";
const limit = 2 * 1024 * 1024;
const core = ["-c", "core.longpaths=true", "-c", "core.symlinks=true"];
const cfg = ["-c", "core.autocrlf=false", ...core];
const quote = [...cfg, "-c", "core.quotepath=false"];
/** Effect Context service tag for the snapshot service. */
export class Service extends Context.Service()("@closedcode/Snapshot") {}
/**
 * Layer building the snapshot service. Wires the filesystem, child-process
 * spawner, and config, and exposes per-instance snapshot operations
 * (track/patch/restore/revert/diff/diffFull/cleanup).
 */
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const fs = yield* AppFileSystem.Service;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const config = yield* Config.Service;
  const locks = new Map();
  /**
   * Get (or lazily create) a single-permit semaphore keyed by git-dir, so
   * operations against the same shadow repo are serialized.
   * @param {string} key - The git-dir path used as the lock key.
   * @returns {Semaphore} The semaphore guarding that key.
   */
  const lock = key => {
    const hit = locks.get(key);
    if (hit) return hit;
    const next = Semaphore.makeUnsafe(1);
    locks.set(key, next);
    return next;
  };
  /**
   * Per-instance snapshot state factory. Computes the shadow git-dir for the
   * worktree and builds the suite of git-backed snapshot operations bound to it.
   * @param {Object} ctx - Instance context (directory, worktree, project).
   * @returns {Object} The set of snapshot operations for this instance.
   */
  const state = yield* InstanceState.make(Effect.fn("Snapshot.state")(function* (ctx) {
    const state = {
      directory: ctx.directory,
      worktree: ctx.worktree,
      gitdir: path.join(Global.Path.data, "snapshot", ctx.project.id, Hash.fast(ctx.worktree)),
      vcs: ctx.project.vcs
    };
    /**
     * Prefix a git argv with this instance's --git-dir / --work-tree flags.
     * @param {Array<string>} cmd - The git subcommand and its arguments.
     * @returns {Array<string>} The argv with the shadow git-dir/work-tree prepended.
     */
    const args = cmd => ["--git-dir", state.gitdir, "--work-tree", state.worktree, ...cmd];
    const enc = new TextEncoder();
    /**
     * Build a NUL-delimited stdin stream from a list (for --pathspec-file-nul / --stdin -z).
     * @param {Array<string>} list - The items to feed, joined and terminated with NUL bytes.
     * @returns {Stream} A stream emitting the encoded NUL-delimited payload.
     */
    const feed = list => Stream.make(enc.encode(list.join("\0") + "\0"));
    /**
     * Run a git command, capturing stdout/stderr/exit code; never throws
     * (failures are converted to a result with code 1 and the error in stderr).
     * @param {Array<string>} cmd - The full git argv.
     * @param {Object} opts - Spawn options (cwd, env, stdin).
     * @returns {Effect} Effect resolving to {code, text, stderr}.
     */
    const git = Effect.fnUntraced(function* (cmd, opts) {
      const proc = ChildProcess.make("git", cmd, {
        cwd: opts?.cwd,
        env: opts?.env,
        extendEnv: true,
        stdin: opts?.stdin
      });
      const handle = yield* spawner.spawn(proc);
      const [text, stderr] = yield* Effect.all([Stream.mkString(Stream.decodeText(handle.stdout)), Stream.mkString(Stream.decodeText(handle.stderr))], {
        concurrency: 2
      });
      const code = yield* handle.exitCode;
      return {
        code,
        text,
        stderr
      };
    }, Effect.scoped, Effect.catch(err => Effect.succeed({
      code: ChildProcessSpawner.ExitCode(1),
      text: "",
      stderr: err instanceof Error ? err.message : String(err)
    })));
    /**
     * Resolve which of the given paths are ignored by the source repo's
     * gitignore rules (pattern-based via --no-index, even for tracked paths).
     * @param {Array<string>} files - Candidate paths relative to the worktree.
     * @returns {Effect} Effect resolving to a Set of ignored paths.
     */
    const ignore = Effect.fnUntraced(function* (files) {
      if (!files.length) return new Set();
      const check = yield* git([...quote, "--git-dir", path.join(state.worktree, ".git"), "--work-tree", state.worktree, "check-ignore", "--no-index", "--stdin", "-z"], {
        cwd: state.directory,
        stdin: feed(files)
      });
      if (check.code !== 0 && check.code !== 1) return new Set();
      return new Set(check.text.split("\0").filter(Boolean));
    });
    /**
     * Remove the given paths from the snapshot index (git rm --cached) so they
     * are no longer tracked by the shadow repo.
     * @param {Array<string>} files - Paths to drop from the index.
     * @returns {Effect} Effect that completes once the paths are unstaged.
     */
    const drop = Effect.fnUntraced(function* (files) {
      if (!files.length) return;
      yield* git([...cfg, ...args(["rm", "--cached", "-f", "--ignore-unmatch", "--pathspec-from-file=-", "--pathspec-file-nul"])], {
        cwd: state.directory,
        stdin: feed(files)
      });
    });
    /**
     * Stage the given paths into the snapshot index (git add); logs a warning
     * on failure but does not throw.
     * @param {Array<string>} files - Paths to add to the index.
     * @returns {Effect} Effect that completes once the paths are staged.
     */
    const stage = Effect.fnUntraced(function* (files) {
      if (!files.length) return;
      const result = yield* git([...cfg, ...args(["add", "--all", "--sparse", "--pathspec-from-file=-", "--pathspec-file-nul"])], {
        cwd: state.directory,
        stdin: feed(files)
      });
      if (result.code === 0) return;
      log.warn("failed to add snapshot files", {
        exitCode: result.code,
        stderr: result.stderr
      });
    });
    /**
     * Check whether a path exists (dies on filesystem error).
     * @param {string} file - The path to check.
     * @returns {Effect} Effect resolving to a boolean.
     */
    const exists = file => fs.exists(file).pipe(Effect.orDie);
    /**
     * Read a file as a string, returning "" on any error.
     * @param {string} file - The path to read.
     * @returns {Effect} Effect resolving to the file contents or "".
     */
    const read = file => fs.readFileString(file).pipe(Effect.catch(() => Effect.succeed("")));
    /**
     * Remove a file, ignoring any error.
     * @param {string} file - The path to remove.
     * @returns {Effect} Effect that always completes.
     */
    const remove = file => fs.remove(file).pipe(Effect.catch(() => Effect.void));
    /**
     * Run an effect while holding this instance's git-dir lock (serializes
     * concurrent snapshot operations against the same shadow repo).
     * @param {Effect} fx - The effect to run under the lock.
     * @returns {Effect} The lock-guarded effect.
     */
    const locked = fx => lock(state.gitdir).withPermits(1)(fx);
    /**
     * Whether snapshots are active for this instance (git VCS and config not disabled).
     * @returns {Effect} Effect resolving to a boolean.
     */
    const enabled = Effect.fnUntraced(function* () {
      if (state.vcs !== "git") return false;
      return (yield* config.get()).snapshot !== false;
    });
    /**
     * Resolve the absolute path to the source repo's info/exclude file, if it exists.
     * @returns {Effect} Effect resolving to the path string, or undefined.
     */
    const excludes = Effect.fnUntraced(function* () {
      const result = yield* git(["rev-parse", "--path-format=absolute", "--git-path", "info/exclude"], {
        cwd: state.worktree
      });
      const file = result.text.trim();
      if (!file) return;
      if (!(yield* exists(file))) return;
      return file;
    });
    /**
     * Regenerate the shadow repo's info/exclude file: the source repo's
     * excludes plus any extra paths to block (e.g. large untracked files).
     * @param {Array<string>} list - Extra worktree-relative paths to exclude.
     * @returns {Effect} Effect that completes once the exclude file is written.
     */
    const sync = Effect.fnUntraced(function* (list = []) {
      const file = yield* excludes();
      const target = path.join(state.gitdir, "info", "exclude");
      const text = [file ? (yield* read(file)).trimEnd() : "", ...list.map(item => `/${item.replaceAll("\\", "/")}`)].filter(Boolean).join("\n");
      yield* fs.ensureDir(path.join(state.gitdir, "info")).pipe(Effect.orDie);
      yield* fs.writeFileString(target, text ? `${text}\n` : "").pipe(Effect.orDie);
    });
    /**
     * Refresh the snapshot index to mirror the worktree: list changed and
     * untracked files, drop newly-ignored ones, block oversized untracked
     * files via the exclude file, and stage the remaining candidates.
     * @returns {Effect} Effect that completes once the index reflects the worktree.
     */
    const add = Effect.fnUntraced(function* () {
      yield* sync();
      const [diff, other] = yield* Effect.all([git([...quote, ...args(["diff-files", "--name-only", "-z", "--", "."])], {
        cwd: state.directory
      }), git([...quote, ...args(["ls-files", "--others", "--exclude-standard", "-z", "--", "."])], {
        cwd: state.directory
      })], {
        concurrency: 2
      });
      if (diff.code !== 0 || other.code !== 0) {
        log.warn("failed to list snapshot files", {
          diffCode: diff.code,
          diffStderr: diff.stderr,
          otherCode: other.code,
          otherStderr: other.stderr
        });
        return;
      }
      const tracked = diff.text.split("\0").filter(Boolean);
      const untracked = other.text.split("\0").filter(Boolean);
      const all = Array.from(new Set([...tracked, ...untracked]));
      if (!all.length) return;

      // Resolve source-repo ignore rules against the exact candidate set.
      // --no-index keeps this pattern-based even when a path is already tracked.
      const ignored = yield* ignore(all);

      // Remove newly-ignored files from snapshot index to prevent re-adding
      if (ignored.size > 0) {
        const ignoredFiles = Array.from(ignored);
        log.info("removing gitignored files from snapshot", {
          count: ignoredFiles.length
        });
        yield* drop(ignoredFiles);
      }
      const allow = all.filter(item => !ignored.has(item));
      if (!allow.length) return;
      const large = new Set((yield* Effect.all(allow.map(item => fs.stat(path.join(state.directory, item)).pipe(Effect.catch(() => Effect.void)).pipe(Effect.map(stat => {
        if (!stat || stat.type !== "File") return;
        const size = typeof stat.size === "bigint" ? Number(stat.size) : stat.size;
        return size > limit ? item : undefined;
      }))), {
        concurrency: 8
      })).filter(item => Boolean(item)));
      const block = new Set(untracked.filter(item => large.has(item)));
      yield* sync(Array.from(block));
      // Stage only the allowed candidate paths so snapshot updates stay scoped.
      yield* stage(allow.filter(item => !block.has(item)));
    });
    /**
     * Garbage-collect the shadow repo (git gc with a prune window), under the
     * git-dir lock; no-op when snapshots are disabled or the repo is absent.
     * @returns {Effect} Effect that completes once gc has run (or been skipped).
     */
    const cleanup = Effect.fnUntraced(function* () {
      return yield* locked(Effect.gen(function* () {
        if (!(yield* enabled())) return;
        if (!(yield* exists(state.gitdir))) return;
        const result = yield* git(args(["gc", `--prune=${prune}`]), {
          cwd: state.directory
        });
        if (result.code !== 0) {
          log.warn("cleanup failed", {
            exitCode: result.code,
            stderr: result.stderr
          });
          return;
        }
        log.info("cleanup", {
          prune
        });
      }));
    });
    /**
     * Capture a snapshot of the current worktree: initialize the shadow repo
     * if needed, stage the worktree, and write a tree object.
     * @returns {Effect} Effect resolving to the written tree hash (or undefined when disabled).
     */
    const track = Effect.fnUntraced(function* () {
      return yield* locked(Effect.gen(function* () {
        if (!(yield* enabled())) return;
        const existed = yield* exists(state.gitdir);
        yield* fs.ensureDir(state.gitdir).pipe(Effect.orDie);
        if (!existed) {
          yield* git(["init"], {
            env: {
              GIT_DIR: state.gitdir,
              GIT_WORK_TREE: state.worktree
            }
          });
          yield* git(["--git-dir", state.gitdir, "config", "core.autocrlf", "false"]);
          yield* git(["--git-dir", state.gitdir, "config", "core.longpaths", "true"]);
          yield* git(["--git-dir", state.gitdir, "config", "core.symlinks", "true"]);
          yield* git(["--git-dir", state.gitdir, "config", "core.fsmonitor", "false"]);
          log.info("initialized");
        }
        yield* add();
        const result = yield* git(args(["write-tree"]), {
          cwd: state.directory
        });
        const hash = result.text.trim();
        log.info("tracking", {
          hash,
          cwd: state.directory,
          git: state.gitdir
        });
        return hash;
      }));
    });
    /**
     * Compute the list of files that changed between a snapshot tree and the
     * current worktree, returned as absolute worktree paths (ignored-file
     * removals are hidden).
     * @param {string} hash - The snapshot tree hash to diff against.
     * @returns {Effect} Effect resolving to {hash, files}.
     */
    const patch = Effect.fnUntraced(function* (hash) {
      return yield* locked(Effect.gen(function* () {
        yield* add();
        const result = yield* git([...quote, ...args(["diff", "--cached", "--no-ext-diff", "--name-only", hash, "--", "."])], {
          cwd: state.directory
        });
        if (result.code !== 0) {
          log.warn("failed to get diff", {
            hash,
            exitCode: result.code
          });
          return {
            hash,
            files: []
          };
        }
        const files = result.text.trim().split("\n").map(x => x.trim()).filter(Boolean);

        // Hide ignored-file removals from the user-facing patch output.
        const ignored = yield* ignore(files);
        return {
          hash,
          files: files.filter(item => !ignored.has(item)).map(x => path.join(state.worktree, x).replaceAll("\\", "/"))
        };
      }));
    });
    /**
     * Restore the entire worktree to a snapshot tree (read-tree +
     * checkout-index -a -f); logs errors but does not throw.
     * @param {string} snapshot - The snapshot tree/commit hash to restore.
     * @returns {Effect} Effect that completes once restore is attempted.
     */
    const restore = Effect.fnUntraced(function* (snapshot) {
      return yield* locked(Effect.gen(function* () {
        log.info("restore", {
          commit: snapshot
        });
        const result = yield* git([...core, ...args(["read-tree", snapshot])], {
          cwd: state.worktree
        });
        if (result.code === 0) {
          const checkout = yield* git([...core, ...args(["checkout-index", "-a", "-f"])], {
            cwd: state.worktree
          });
          if (checkout.code === 0) return;
          log.error("failed to restore snapshot", {
            snapshot,
            exitCode: checkout.code,
            stderr: checkout.stderr
          });
          return;
        }
        log.error("failed to restore snapshot", {
          snapshot,
          exitCode: result.code,
          stderr: result.stderr
        });
      }));
    });
    /**
     * Revert specific files to their state in the given snapshots: checks each
     * file out of its snapshot, deleting files that did not exist there.
     * Batches non-overlapping same-hash files for fewer git invocations,
     * falling back to per-file operations on failure.
     * @param {Array<Object>} patches - Patch entries, each {hash, files}.
     * @returns {Effect} Effect that completes once all files are reverted.
     */
    const revert = Effect.fnUntraced(function* (patches) {
      return yield* locked(Effect.gen(function* () {
        const ops = [];
        const seen = new Set();
        for (const item of patches) {
          for (const file of item.files) {
            if (seen.has(file)) continue;
            seen.add(file);
            ops.push({
              hash: item.hash,
              file,
              rel: path.relative(state.worktree, file).replaceAll("\\", "/")
            });
          }
        }
        /**
         * Revert a single file to its snapshot state: checkout from the
         * snapshot; if the file is absent from the snapshot, delete it.
         * @param {Object} op - Revert op {hash, file, rel}.
         * @returns {Effect} Effect that completes once the file is reverted.
         */
        const single = Effect.fnUntraced(function* (op) {
          log.info("reverting", {
            file: op.file,
            hash: op.hash
          });
          const result = yield* git([...core, ...args(["checkout", op.hash, "--", op.file])], {
            cwd: state.worktree
          });
          if (result.code === 0) return;
          const tree = yield* git([...core, ...args(["ls-tree", op.hash, "--", op.rel])], {
            cwd: state.worktree
          });
          if (tree.code === 0 && tree.text.trim()) {
            log.info("file existed in snapshot but checkout failed, keeping", {
              file: op.file,
              hash: op.hash
            });
            return;
          }
          log.info("file did not exist in snapshot, deleting", {
            file: op.file,
            hash: op.hash
          });
          yield* remove(op.file);
        });
        /**
         * Whether two relative paths could affect each other (equal or one is
         * a directory prefix of the other), used to keep batches independent.
         * @param {string} a - First relative path.
         * @param {string} b - Second relative path.
         * @returns {boolean} True if the paths overlap.
         */
        const clash = (a, b) => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
        for (let i = 0; i < ops.length;) {
          const first = ops[i];
          const run = [first];
          let j = i + 1;
          // Only batch adjacent files when their paths cannot affect each other.
          while (j < ops.length && run.length < 100) {
            const next = ops[j];
            if (next.hash !== first.hash) break;
            if (run.some(item => clash(item.rel, next.rel))) break;
            run.push(next);
            j += 1;
          }
          if (run.length === 1) {
            yield* single(first);
            i = j;
            continue;
          }
          const tree = yield* git([...core, ...args(["ls-tree", "--name-only", first.hash, "--", ...run.map(item => item.rel)])], {
            cwd: state.worktree
          });
          if (tree.code !== 0) {
            log.info("batched ls-tree failed, falling back to single-file revert", {
              hash: first.hash,
              files: run.length
            });
            for (const op of run) {
              yield* single(op);
            }
            i = j;
            continue;
          }
          const have = new Set(tree.text.trim().split("\n").map(item => item.trim()).filter(Boolean));
          const list = run.filter(item => have.has(item.rel));
          if (list.length) {
            log.info("reverting", {
              hash: first.hash,
              files: list.length
            });
            const result = yield* git([...core, ...args(["checkout", first.hash, "--", ...list.map(item => item.file)])], {
              cwd: state.worktree
            });
            if (result.code !== 0) {
              log.info("batched checkout failed, falling back to single-file revert", {
                hash: first.hash,
                files: list.length
              });
              for (const op of run) {
                yield* single(op);
              }
              i = j;
              continue;
            }
          }
          for (const op of run) {
            if (have.has(op.rel)) continue;
            log.info("file did not exist in snapshot, deleting", {
              file: op.file,
              hash: op.hash
            });
            yield* remove(op.file);
          }
          i = j;
        }
      }));
    });
    /**
     * Produce a unified diff (git diff text) between a snapshot tree and the
     * current worktree.
     * @param {string} hash - The snapshot tree hash to diff against.
     * @returns {Effect} Effect resolving to the diff text (or "" on failure).
     */
    const diff = Effect.fnUntraced(function* (hash) {
      return yield* locked(Effect.gen(function* () {
        yield* add();
        const result = yield* git([...quote, ...args(["diff", "--cached", "--no-ext-diff", hash, "--", "."])], {
          cwd: state.worktree
        });
        if (result.code !== 0) {
          log.warn("failed to get diff", {
            hash,
            exitCode: result.code,
            stderr: result.stderr
          });
          return "";
        }
        return result.text.trim();
      }));
    });
    /**
     * Compute per-file structured diffs between two snapshot trees, returning
     * full-context patches plus addition/deletion counts and status for each
     * changed file (ignored-file removals are hidden).
     * @param {string} from - The base snapshot tree hash.
     * @param {string} to - The target snapshot tree hash.
     * @returns {Effect} Effect resolving to an Array of {file, patch, additions, deletions, status}.
     */
    const diffFull = Effect.fnUntraced(function* (from, to) {
      return yield* locked(Effect.gen(function* () {
        /**
         * Load before/after contents for a single changed row via per-file
         * git show (the fallback path when cat-file batch is unavailable).
         * @param {Object} row - Changed-file row {file, status, binary}.
         * @returns {Effect} Effect resolving to a [before, after] tuple.
         */
        const show = Effect.fnUntraced(function* (row) {
          if (row.binary) return ["", ""];
          if (row.status === "added") {
            return ["", yield* git([...cfg, ...args(["show", `${to}:${row.file}`])]).pipe(Effect.map(item => item.text))];
          }
          if (row.status === "deleted") {
            return [yield* git([...cfg, ...args(["show", `${from}:${row.file}`])]).pipe(Effect.map(item => item.text)), ""];
          }
          return yield* Effect.all([git([...cfg, ...args(["show", `${from}:${row.file}`])]).pipe(Effect.map(item => item.text)), git([...cfg, ...args(["show", `${to}:${row.file}`])]).pipe(Effect.map(item => item.text))], {
            concurrency: 2
          });
        });
        /**
         * Bulk-load before/after blob contents for a batch of changed rows
         * using a single `git cat-file --batch` process; returns undefined to
         * signal the caller should fall back to per-file `git show`.
         * @param {Array<Object>} rows - Changed-file rows to load.
         * @returns {Effect} Effect resolving to a Map of file to {before, after}, or undefined.
         */
        const load = Effect.fnUntraced(function* (rows) {
          const refs = rows.flatMap(row => {
            if (row.binary) return [];
            if (row.status === "added") return [{
              file: row.file,
              side: "after",
              ref: `${to}:${row.file}`
            }];
            if (row.status === "deleted") {
              return [{
                file: row.file,
                side: "before",
                ref: `${from}:${row.file}`
              }];
            }
            return [{
              file: row.file,
              side: "before",
              ref: `${from}:${row.file}`
            }, {
              file: row.file,
              side: "after",
              ref: `${to}:${row.file}`
            }];
          });
          if (!refs.length) return new Map();
          const proc = ChildProcess.make("git", [...cfg, ...args(["cat-file", "--batch"])], {
            cwd: state.directory,
            extendEnv: true,
            stdin: Stream.make(new TextEncoder().encode(refs.map(item => item.ref).join("\n") + "\n"))
          });
          const handle = yield* spawner.spawn(proc);
          const [out, err] = yield* Effect.all([Stream.mkUint8Array(handle.stdout), Stream.mkString(Stream.decodeText(handle.stderr))], {
            concurrency: 2
          });
          const code = yield* handle.exitCode;
          if (code !== 0) {
            log.info("git cat-file --batch failed during snapshot diff, falling back to per-file git show", {
              stderr: err,
              refs: refs.length
            });
            return;
          }
          /**
           * Log a parse/consistency failure and signal the cat-file fast path
           * should be abandoned (returns undefined).
           * @param {string} msg - The log message describing the failure.
           * @param {Object} extra - Optional extra log fields.
           * @returns {undefined} Always undefined.
           */
          const fail = (msg, extra) => {
            log.info(msg, {
              ...extra,
              refs: refs.length
            });
            return undefined;
          };
          const map = new Map();
          const dec = new TextDecoder();
          let i = 0;
          for (const ref of refs) {
            let end = i;
            while (end < out.length && out[end] !== 10) end += 1;
            if (end >= out.length) {
              return fail("git cat-file --batch returned a truncated header during snapshot diff, falling back to per-file git show");
            }
            const head = dec.decode(out.slice(i, end));
            i = end + 1;
            const hit = map.get(ref.file) ?? {
              before: "",
              after: ""
            };
            if (head.endsWith(" missing")) {
              map.set(ref.file, hit);
              continue;
            }
            const match = head.match(/^[0-9a-f]+ blob (\d+)$/);
            if (!match) {
              return fail("git cat-file --batch returned an unexpected header during snapshot diff, falling back to per-file git show", {
                head
              });
            }
            const size = Number(match[1]);
            if (!Number.isInteger(size) || size < 0 || i + size >= out.length || out[i + size] !== 10) {
              return fail("git cat-file --batch returned truncated content during snapshot diff, falling back to per-file git show", {
                head
              });
            }
            const text = dec.decode(out.slice(i, i + size));
            if (ref.side === "before") hit.before = text;
            if (ref.side === "after") hit.after = text;
            map.set(ref.file, hit);
            i += size + 1;
          }
          if (i !== out.length) {
            return fail("git cat-file --batch returned trailing data during snapshot diff, falling back to per-file git show");
          }
          return map;
        }, Effect.scoped, Effect.catch(() => Effect.succeed(undefined)));
        const result = [];
        const status = new Map();
        const statuses = yield* git([...quote, ...args(["diff", "--no-ext-diff", "--name-status", "--no-renames", from, to, "--", "."])], {
          cwd: state.directory
        });
        for (const line of statuses.text.trim().split("\n")) {
          if (!line) continue;
          const [code, file] = line.split("\t");
          if (!code || !file) continue;
          status.set(file, code.startsWith("A") ? "added" : code.startsWith("D") ? "deleted" : "modified");
        }
        const numstat = yield* git([...quote, ...args(["diff", "--no-ext-diff", "--no-renames", "--numstat", from, to, "--", "."])], {
          cwd: state.directory
        });
        const rows = numstat.text.trim().split("\n").filter(Boolean).flatMap(line => {
          const [adds, dels, file] = line.split("\t");
          if (!file) return [];
          const binary = adds === "-" && dels === "-";
          const additions = binary ? 0 : parseInt(adds);
          const deletions = binary ? 0 : parseInt(dels);
          return [{
            file,
            status: status.get(file) ?? "modified",
            binary,
            additions: Number.isFinite(additions) ? additions : 0,
            deletions: Number.isFinite(deletions) ? deletions : 0
          }];
        });

        // Hide ignored-file removals from the user-facing diff output.
        const ignored = yield* ignore(rows.map(r => r.file));
        if (ignored.size > 0) {
          const filtered = rows.filter(r => !ignored.has(r.file));
          rows.length = 0;
          rows.push(...filtered);
        }
        const step = 100;
        /**
         * Build a full-context unified patch for a single file from its
         * before/after contents.
         * @param {string} file - The file path (used for both patch headers).
         * @param {string} before - The previous file contents.
         * @param {string} after - The new file contents.
         * @returns {string} The formatted unified patch text.
         */
        const patch = (file, before, after) => formatPatch(structuredPatch(file, file, before, after, "", "", {
          context: Number.MAX_SAFE_INTEGER
        }));
        for (let i = 0; i < rows.length; i += step) {
          const run = rows.slice(i, i + step);
          const text = yield* load(run);
          for (const row of run) {
            const hit = text?.get(row.file) ?? {
              before: "",
              after: ""
            };
            const [before, after] = row.binary ? ["", ""] : text ? [hit.before, hit.after] : yield* show(row);
            result.push({
              file: row.file,
              patch: row.binary ? "" : patch(row.file, before, after),
              additions: row.additions,
              deletions: row.deletions,
              status: row.status
            });
          }
        }
        return result;
      }));
    });
    yield* cleanup().pipe(Effect.catchCause(cause => {
      log.error("cleanup loop failed", {
        cause: Cause.pretty(cause)
      });
      return Effect.void;
    }), Effect.repeat(Schedule.spaced(Duration.hours(1))), Effect.delay(Duration.minutes(1)), Effect.forkScoped);
    return {
      cleanup,
      track,
      patch,
      restore,
      revert,
      diff,
      diffFull
    };
  }));
  return Service.of({
    /** Eagerly resolve the per-instance snapshot state. */
    init: Effect.fn("Snapshot.init")(function* () {
      yield* InstanceState.get(state);
    }),
    /** Garbage-collect the current instance's shadow repo. */
    cleanup: Effect.fn("Snapshot.cleanup")(function* () {
      return yield* InstanceState.useEffect(state, s => s.cleanup());
    }),
    /** Capture a snapshot of the worktree and return its tree hash. */
    track: Effect.fn("Snapshot.track")(function* () {
      return yield* InstanceState.useEffect(state, s => s.track());
    }),
    /**
     * List files changed between a snapshot and the worktree.
     * @param {string} hash - The snapshot tree hash.
     */
    patch: Effect.fn("Snapshot.patch")(function* (hash) {
      return yield* InstanceState.useEffect(state, s => s.patch(hash));
    }),
    /**
     * Restore the worktree to a snapshot.
     * @param {string} snapshot - The snapshot tree/commit hash.
     */
    restore: Effect.fn("Snapshot.restore")(function* (snapshot) {
      return yield* InstanceState.useEffect(state, s => s.restore(snapshot));
    }),
    /**
     * Revert specific files to their state in the given snapshots.
     * @param {Array<Object>} patches - Patch entries, each {hash, files}.
     */
    revert: Effect.fn("Snapshot.revert")(function* (patches) {
      return yield* InstanceState.useEffect(state, s => s.revert(patches));
    }),
    /**
     * Produce a unified diff between a snapshot and the worktree.
     * @param {string} hash - The snapshot tree hash.
     */
    diff: Effect.fn("Snapshot.diff")(function* (hash) {
      return yield* InstanceState.useEffect(state, s => s.diff(hash));
    }),
    /**
     * Produce per-file structured diffs between two snapshots.
     * @param {string} from - The base snapshot tree hash.
     * @param {string} to - The target snapshot tree hash.
     */
    diffFull: Effect.fn("Snapshot.diffFull")(function* (from, to) {
      return yield* InstanceState.useEffect(state, s => s.diffFull(from, to));
    })
  });
}));
/** Snapshot layer with its default dependencies (spawner, filesystem, config) provided. */
export const defaultLayer = layer.pipe(Layer.provide(CrossSpawnSpawner.defaultLayer), Layer.provide(AppFileSystem.defaultLayer), Layer.provide(Config.defaultLayer));
export * as Snapshot from "./index.js";