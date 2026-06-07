import z from "zod";
import { NamedError } from "core/util/error";
import { Global } from "core/global";
import { InstanceLayer } from "@/project/instance-layer.js";
import { InstanceStore } from "@/project/instance-store.js";
import { Project } from "@/project/project.js";
import { Database } from "@/storage/db.js";
import { eq } from "drizzle-orm";
import { ProjectTable } from "../project/project.sql.js";
import * as Log from "core/util/log";
import { Slug } from "core/util/slug";
import { errorMessage } from "../util/error.js";
import { BusEvent } from "@/bus/bus-event.js";
import { GlobalBus } from "@/bus/global.js";
import { Git } from "@/git/index.js";
import { Effect, Layer, Path, Schema, Scope, Context, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { NodePath } from "@effect/platform-node";
import { AppFileSystem } from "core/filesystem";
import { CrossSpawnSpawner } from "core/cross-spawn-spawner";
import { InstanceState } from "@/effect/instance-state.js";
import { zod as effectZod } from "@/util/effect-zod.js";
import { withStatics } from "@/util/schema.js";
const log = Log.create({
  service: "worktree"
});
export const Event = {
  Ready: BusEvent.define("worktree.ready", Schema.Struct({
    name: Schema.String,
    branch: Schema.String
  })),
  Failed: BusEvent.define("worktree.failed", Schema.Struct({
    message: Schema.String
  }))
};
export const Info = Schema.Struct({
  name: Schema.String,
  branch: Schema.String,
  directory: Schema.String
}).annotate({
  identifier: "Worktree"
}).pipe(withStatics(s => ({
  zod: effectZod(s)
})));
export const CreateInput = Schema.Struct({
  name: Schema.optional(Schema.String),
  startCommand: Schema.optional(Schema.String.annotate({
    description: "Additional startup script to run after the project's start command"
  }))
}).annotate({
  identifier: "WorktreeCreateInput"
}).pipe(withStatics(s => ({
  zod: effectZod(s)
})));
export const RemoveInput = Schema.Struct({
  directory: Schema.String
}).annotate({
  identifier: "WorktreeRemoveInput"
}).pipe(withStatics(s => ({
  zod: effectZod(s)
})));
export const ResetInput = Schema.Struct({
  directory: Schema.String
}).annotate({
  identifier: "WorktreeResetInput"
}).pipe(withStatics(s => ({
  zod: effectZod(s)
})));
export const NotGitError = NamedError.create("WorktreeNotGitError", z.object({
  message: z.string()
}));
export const NameGenerationFailedError = NamedError.create("WorktreeNameGenerationFailedError", z.object({
  message: z.string()
}));
export const CreateFailedError = NamedError.create("WorktreeCreateFailedError", z.object({
  message: z.string()
}));
export const StartCommandFailedError = NamedError.create("WorktreeStartCommandFailedError", z.object({
  message: z.string()
}));
export const RemoveFailedError = NamedError.create("WorktreeRemoveFailedError", z.object({
  message: z.string()
}));
export const ResetFailedError = NamedError.create("WorktreeResetFailedError", z.object({
  message: z.string()
}));
function slugify(input) {
  return input.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+/, "").replace(/-+$/, "");
}
function failedRemoves(...chunks) {
  return chunks.filter(Boolean).flatMap(chunk => chunk.split("\n").map(line => line.trim()).flatMap(line => {
    const match = line.match(/^warning:\s+failed to remove\s+(.+):\s+/i);
    if (!match) return [];
    const value = match[1]?.trim().replace(/^['"]|['"]$/g, "");
    if (!value) return [];
    return [value];
  }));
}

// ---------------------------------------------------------------------------
// Effect service
// ---------------------------------------------------------------------------

export class Service extends Context.Service()("@closedcode/Worktree") {}
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const scope = yield* Scope.Scope;
  const fs = yield* AppFileSystem.Service;
  const pathSvc = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const gitSvc = yield* Git.Service;
  const project = yield* Project.Service;
  const store = yield* InstanceStore.Service;
  const git = Effect.fnUntraced(function* (args, opts) {
    const handle = yield* spawner.spawn(ChildProcess.make("git", args, {
      cwd: opts?.cwd,
      extendEnv: true,
      stdin: "ignore"
    }));
    const [text, stderr] = yield* Effect.all([Stream.mkString(Stream.decodeText(handle.stdout)), Stream.mkString(Stream.decodeText(handle.stderr))], {
      concurrency: 2
    });
    const code = yield* handle.exitCode;
    return {
      code,
      text,
      stderr
    };
  }, Effect.scoped, Effect.catch(e => Effect.succeed({
    code: 1,
    text: "",
    stderr: e instanceof Error ? e.message : String(e)
  })));
  const MAX_NAME_ATTEMPTS = 26;
  const candidate = Effect.fn("Worktree.candidate")(function* (root, base) {
    const ctx = yield* InstanceState.context;
    for (const attempt of Array.from({
      length: MAX_NAME_ATTEMPTS
    }, (_, i) => i)) {
      const name = base ? attempt === 0 ? base : `${base}-${Slug.create()}` : Slug.create();
      const branch = `closedcode/${name}`;
      const directory = pathSvc.join(root, name);
      if (yield* fs.exists(directory).pipe(Effect.orDie)) continue;
      const ref = `refs/heads/${branch}`;
      const branchCheck = yield* git(["show-ref", "--verify", "--quiet", ref], {
        cwd: ctx.worktree
      });
      if (branchCheck.code === 0) continue;
      return {
        name,
        branch,
        directory
      };
    }
    throw new NameGenerationFailedError({
      message: "Failed to generate a unique worktree name"
    });
  });
  const makeWorktreeInfo = Effect.fn("Worktree.makeWorktreeInfo")(function* (name) {
    const ctx = yield* InstanceState.context;
    if (ctx.project.vcs !== "git") {
      throw new NotGitError({
        message: "Worktrees are only supported for git projects"
      });
    }
    const root = pathSvc.join(Global.Path.data, "worktree", ctx.project.id);
    yield* fs.makeDirectory(root, {
      recursive: true
    }).pipe(Effect.orDie);
    const base = name ? slugify(name) : "";
    return yield* candidate(root, base || undefined);
  });
  const setup = Effect.fnUntraced(function* (info) {
    const ctx = yield* InstanceState.context;
    const created = yield* git(["worktree", "add", "--no-checkout", "-b", info.branch, info.directory], {
      cwd: ctx.worktree
    });
    if (created.code !== 0) {
      throw new CreateFailedError({
        message: created.stderr || created.text || "Failed to create git worktree"
      });
    }
    yield* project.addSandbox(ctx.project.id, info.directory).pipe(Effect.catch(() => Effect.void));
  });
  const boot = Effect.fnUntraced(function* (info, startCommand) {
    const ctx = yield* InstanceState.context;
    const workspaceID = yield* InstanceState.workspaceID;
    const projectID = ctx.project.id;
    const extra = startCommand?.trim();
    const populated = yield* git(["reset", "--hard"], {
      cwd: info.directory
    });
    if (populated.code !== 0) {
      const message = populated.stderr || populated.text || "Failed to populate worktree";
      log.error("worktree checkout failed", {
        directory: info.directory,
        message
      });
      GlobalBus.emit("event", {
        directory: info.directory,
        project: ctx.project.id,
        workspace: workspaceID,
        payload: {
          type: Event.Failed.type,
          properties: {
            message
          }
        }
      });
      return;
    }
    const booted = yield* store.load({
      directory: info.directory
    }).pipe(Effect.as(true), Effect.catch(error => Effect.sync(() => {
      const message = errorMessage(error);
      log.error("worktree bootstrap failed", {
        directory: info.directory,
        message
      });
      GlobalBus.emit("event", {
        directory: info.directory,
        project: ctx.project.id,
        workspace: workspaceID,
        payload: {
          type: Event.Failed.type,
          properties: {
            message
          }
        }
      });
      return false;
    })));
    if (!booted) return;
    GlobalBus.emit("event", {
      directory: info.directory,
      project: ctx.project.id,
      workspace: workspaceID,
      payload: {
        type: Event.Ready.type,
        properties: {
          name: info.name,
          branch: info.branch
        }
      }
    });
    yield* runStartScripts(info.directory, {
      projectID,
      extra
    });
  });
  const createFromInfo = Effect.fn("Worktree.createFromInfo")(function* (info, startCommand) {
    yield* setup(info);
    yield* boot(info, startCommand);
  });
  const create = Effect.fn("Worktree.create")(function* (input) {
    const info = yield* makeWorktreeInfo(input?.name);
    yield* setup(info);
    yield* boot(info, input?.startCommand).pipe(Effect.catchCause(cause => Effect.sync(() => log.error("worktree bootstrap failed", {
      cause
    }))), Effect.forkIn(scope));
    return info;
  });
  const canonical = Effect.fnUntraced(function* (input) {
    const abs = pathSvc.resolve(input);
    const real = yield* fs.realPath(abs).pipe(Effect.catch(() => Effect.succeed(abs)));
    const normalized = pathSvc.normalize(real);
    return process.platform === "win32" ? normalized.toLowerCase() : normalized;
  });
  function parseWorktreeList(text) {
    return text.split("\n").map(line => line.trim()).reduce((acc, line) => {
      if (!line) return acc;
      if (line.startsWith("worktree ")) {
        acc.push({
          path: line.slice("worktree ".length).trim()
        });
        return acc;
      }
      const current = acc[acc.length - 1];
      if (!current) return acc;
      if (line.startsWith("branch ")) {
        current.branch = line.slice("branch ".length).trim();
      }
      return acc;
    }, []);
  }
  const locateWorktree = Effect.fnUntraced(function* (entries, directory) {
    for (const item of entries) {
      if (!item.path) continue;
      const key = yield* canonical(item.path);
      if (key === directory) return item;
    }
    return undefined;
  });
  function stopFsmonitor(target) {
    return fs.exists(target).pipe(Effect.orDie, Effect.flatMap(exists => exists ? git(["fsmonitor--daemon", "stop"], {
      cwd: target
    }) : Effect.void));
  }
  function cleanDirectory(target) {
    return Effect.promise(() => import("fs/promises").then(fsp => fsp.rm(target, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100
    })).catch(error => {
      const message = errorMessage(error);
      throw new RemoveFailedError({
        message: message || "Failed to remove git worktree directory"
      });
    }));
  }
  const remove = Effect.fn("Worktree.remove")(function* (input) {
    const ctx = yield* InstanceState.context;
    if (ctx.project.vcs !== "git") {
      throw new NotGitError({
        message: "Worktrees are only supported for git projects"
      });
    }
    const directory = yield* canonical(input.directory);
    const list = yield* git(["worktree", "list", "--porcelain"], {
      cwd: ctx.worktree
    });
    if (list.code !== 0) {
      throw new RemoveFailedError({
        message: list.stderr || list.text || "Failed to read git worktrees"
      });
    }
    const entries = parseWorktreeList(list.text);
    const entry = yield* locateWorktree(entries, directory);
    if (!entry?.path) {
      const directoryExists = yield* fs.exists(directory).pipe(Effect.orDie);
      if (directoryExists) {
        yield* stopFsmonitor(directory);
        yield* cleanDirectory(directory);
      }
      return true;
    }
    yield* stopFsmonitor(entry.path);
    const removed = yield* git(["worktree", "remove", "--force", entry.path], {
      cwd: ctx.worktree
    });
    if (removed.code !== 0) {
      const next = yield* git(["worktree", "list", "--porcelain"], {
        cwd: ctx.worktree
      });
      if (next.code !== 0) {
        throw new RemoveFailedError({
          message: removed.stderr || removed.text || next.stderr || next.text || "Failed to remove git worktree"
        });
      }
      const stale = yield* locateWorktree(parseWorktreeList(next.text), directory);
      if (stale?.path) {
        throw new RemoveFailedError({
          message: removed.stderr || removed.text || "Failed to remove git worktree"
        });
      }
    }
    yield* cleanDirectory(entry.path);
    const branch = entry.branch?.replace(/^refs\/heads\//, "");
    if (branch) {
      const deleted = yield* git(["branch", "-D", branch], {
        cwd: ctx.worktree
      });
      if (deleted.code !== 0) {
        throw new RemoveFailedError({
          message: deleted.stderr || deleted.text || "Failed to delete worktree branch"
        });
      }
    }
    return true;
  });
  const gitExpect = Effect.fnUntraced(function* (args, opts, error) {
    const result = yield* git(args, opts);
    if (result.code !== 0) throw error(result);
    return result;
  });
  const runStartCommand = Effect.fnUntraced(function* (directory, cmd) {
    const [shell, args] = process.platform === "win32" ? ["cmd", ["/c", cmd]] : ["bash", ["-lc", cmd]];
    const handle = yield* spawner.spawn(ChildProcess.make(shell, args, {
      cwd: directory,
      extendEnv: true,
      stdin: "ignore"
    }));
    // Drain stdout, capture stderr for error reporting
    const [, stderr] = yield* Effect.all([Stream.runDrain(handle.stdout), Stream.mkString(Stream.decodeText(handle.stderr))], {
      concurrency: 2
    }).pipe(Effect.orDie);
    const code = yield* handle.exitCode;
    return {
      code,
      stderr
    };
  }, Effect.scoped, Effect.catch(() => Effect.succeed({
    code: 1,
    stderr: ""
  })));
  const runStartScript = Effect.fnUntraced(function* (directory, cmd, kind) {
    const text = cmd.trim();
    if (!text) return true;
    const result = yield* runStartCommand(directory, text);
    if (result.code === 0) return true;
    log.error("worktree start command failed", {
      kind,
      directory,
      message: result.stderr
    });
    return false;
  });
  const runStartScripts = Effect.fnUntraced(function* (directory, input) {
    const row = yield* Effect.sync(() => Database.use(db => db.select().from(ProjectTable).where(eq(ProjectTable.id, input.projectID)).get()));
    const project = row ? Project.fromRow(row) : undefined;
    const startup = project?.commands?.start?.trim() ?? "";
    const ok = yield* runStartScript(directory, startup, "project");
    if (!ok) return false;
    yield* runStartScript(directory, input.extra ?? "", "worktree");
    return true;
  });
  const prune = Effect.fnUntraced(function* (root, entries) {
    const base = yield* canonical(root);
    yield* Effect.forEach(entries, entry => Effect.gen(function* () {
      const target = yield* canonical(pathSvc.resolve(root, entry));
      if (target === base) return;
      if (!target.startsWith(`${base}${pathSvc.sep}`)) return;
      yield* fs.remove(target, {
        recursive: true
      }).pipe(Effect.ignore);
    }), {
      concurrency: "unbounded"
    });
  });
  const sweep = Effect.fnUntraced(function* (root) {
    const first = yield* git(["clean", "-ffdx"], {
      cwd: root
    });
    if (first.code === 0) return first;
    const entries = failedRemoves(first.stderr, first.text);
    if (!entries.length) return first;
    yield* prune(root, entries);
    return yield* git(["clean", "-ffdx"], {
      cwd: root
    });
  });
  const reset = Effect.fn("Worktree.reset")(function* (input) {
    const ctx = yield* InstanceState.context;
    if (ctx.project.vcs !== "git") {
      throw new NotGitError({
        message: "Worktrees are only supported for git projects"
      });
    }
    const directory = yield* canonical(input.directory);
    const primary = yield* canonical(ctx.worktree);
    if (directory === primary) {
      throw new ResetFailedError({
        message: "Cannot reset the primary workspace"
      });
    }
    const list = yield* git(["worktree", "list", "--porcelain"], {
      cwd: ctx.worktree
    });
    if (list.code !== 0) {
      throw new ResetFailedError({
        message: list.stderr || list.text || "Failed to read git worktrees"
      });
    }
    const entry = yield* locateWorktree(parseWorktreeList(list.text), directory);
    if (!entry?.path) {
      throw new ResetFailedError({
        message: "Worktree not found"
      });
    }
    const worktreePath = entry.path;
    const base = yield* gitSvc.defaultBranch(ctx.worktree);
    if (!base) {
      throw new ResetFailedError({
        message: "Default branch not found"
      });
    }
    const sep = base.ref.indexOf("/");
    if (base.ref !== base.name && sep > 0) {
      const remote = base.ref.slice(0, sep);
      const branch = base.ref.slice(sep + 1);
      yield* gitExpect(["fetch", remote, branch], {
        cwd: ctx.worktree
      }, r => new ResetFailedError({
        message: r.stderr || r.text || `Failed to fetch ${base.ref}`
      }));
    }
    yield* gitExpect(["reset", "--hard", base.ref], {
      cwd: worktreePath
    }, r => new ResetFailedError({
      message: r.stderr || r.text || "Failed to reset worktree to target"
    }));
    const cleanResult = yield* sweep(worktreePath);
    if (cleanResult.code !== 0) {
      throw new ResetFailedError({
        message: cleanResult.stderr || cleanResult.text || "Failed to clean worktree"
      });
    }
    yield* gitExpect(["submodule", "update", "--init", "--recursive", "--force"], {
      cwd: worktreePath
    }, r => new ResetFailedError({
      message: r.stderr || r.text || "Failed to update submodules"
    }));
    yield* gitExpect(["submodule", "foreach", "--recursive", "git", "reset", "--hard"], {
      cwd: worktreePath
    }, r => new ResetFailedError({
      message: r.stderr || r.text || "Failed to reset submodules"
    }));
    yield* gitExpect(["submodule", "foreach", "--recursive", "git", "clean", "-fdx"], {
      cwd: worktreePath
    }, r => new ResetFailedError({
      message: r.stderr || r.text || "Failed to clean submodules"
    }));
    const status = yield* git(["-c", "core.fsmonitor=false", "status", "--porcelain=v1"], {
      cwd: worktreePath
    });
    if (status.code !== 0) {
      throw new ResetFailedError({
        message: status.stderr || status.text || "Failed to read git status"
      });
    }
    if (status.text.trim()) {
      throw new ResetFailedError({
        message: `Worktree reset left local changes:\n${status.text.trim()}`
      });
    }
    yield* runStartScripts(worktreePath, {
      projectID: ctx.project.id
    }).pipe(Effect.catchCause(cause => Effect.sync(() => log.error("worktree start task failed", {
      cause
    }))), Effect.forkIn(scope));
    return true;
  });
  return Service.of({
    makeWorktreeInfo,
    createFromInfo,
    create,
    remove,
    reset
  });
}));
export const appLayer = layer.pipe(Layer.provide(Git.defaultLayer), Layer.provide(CrossSpawnSpawner.defaultLayer), Layer.provide(Project.defaultLayer), Layer.provide(AppFileSystem.defaultLayer), Layer.provide(NodePath.layer));
export const defaultLayer = appLayer.pipe(Layer.provide(InstanceLayer.layer));
export * as Worktree from "./index.js";