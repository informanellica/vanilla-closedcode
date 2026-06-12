import z from "zod";
import { Database } from "#storage/db.js";
import * as Log from "core/util/log";
import { Flag } from "core/flag/flag";
import { BusEvent } from "#bus/bus-event.js";
import { GlobalBus } from "#bus/global.js";
import { which } from "../util/which.js";
import { ProjectID } from "./schema.js";
import { Bus } from "#bus/index.js";
import { Command } from "#command/index.js";
import { InstanceState } from "#effect/instance-state.js";
import { Effect, Layer, Path, Scope, Context, Stream, Schema } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { NodePath } from "@effect/platform-node";
import { AppFileSystem } from "core/filesystem";
import { CrossSpawnSpawner } from "core/cross-spawn-spawner";
import { zod } from "#util/effect-zod.js";
import { NonNegativeInt, optionalOmitUndefined, withStatics } from "#util/schema.js";
import { serviceUse } from "#effect/service-use.js";
const log = Log.create({
  service: "project"
});
// Sequelize call-site conventions (ORM migration S3): callbacks receive a
// handle { models, sequelize, tx } from Database.useAsync; reads return plain
// rows so fromRow keeps receiving plain objects with JSON columns parsed.
const plain = row => (row == null ? undefined : row.get({ plain: true }));
// The migration journal declares JSON columns as TEXT, so the sqlite dialect
// returns them unparsed strings on reads (PRAGMA table_info drives parsing);
// normalize to drizzle's mode:"json" behavior. Parsed values pass through.
const jsonValue = value => (typeof value === "string" ? JSON.parse(value) : value);
const ProjectVcs = Schema.Literal("git");
const ProjectIcon = Schema.Struct({
  url: optionalOmitUndefined(Schema.String),
  override: optionalOmitUndefined(Schema.String),
  color: optionalOmitUndefined(Schema.String)
});
const ProjectCommands = Schema.Struct({
  start: optionalOmitUndefined(Schema.String.annotate({
    description: "Startup script to run when creating a new workspace (worktree)"
  }))
});
const ProjectTime = Schema.Struct({
  created: NonNegativeInt,
  updated: NonNegativeInt,
  initialized: optionalOmitUndefined(NonNegativeInt)
});
export const Info = Schema.Struct({
  id: ProjectID,
  worktree: Schema.String,
  vcs: optionalOmitUndefined(ProjectVcs),
  name: optionalOmitUndefined(Schema.String),
  icon: optionalOmitUndefined(ProjectIcon),
  commands: optionalOmitUndefined(ProjectCommands),
  time: ProjectTime,
  sandboxes: Schema.Array(Schema.String)
}).annotate({
  identifier: "Project"
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
export const Event = {
  Updated: BusEvent.define("project.updated", Info)
};
export function fromRow(row) {
  const icon = row.icon_url || row.icon_url_override || row.icon_color ? {
    url: row.icon_url ?? undefined,
    override: row.icon_url_override ?? undefined,
    color: row.icon_color ?? undefined
  } : undefined;
  return {
    id: row.id,
    worktree: row.worktree,
    vcs: row.vcs ? Schema.decodeUnknownSync(ProjectVcs)(row.vcs) : undefined,
    name: row.name ?? undefined,
    icon,
    time: {
      created: row.time_created,
      updated: row.time_updated,
      initialized: row.time_initialized ?? undefined
    },
    sandboxes: jsonValue(row.sandboxes),
    commands: jsonValue(row.commands) ?? undefined
  };
}
export const UpdateInput = z.object({
  projectID: ProjectID.zod,
  name: z.string().optional(),
  icon: zod(ProjectIcon).optional(),
  commands: zod(ProjectCommands).optional()
});
export const UpdatePayload = Schema.Struct({
  name: Schema.optional(Schema.String),
  icon: Schema.optional(ProjectIcon),
  commands: Schema.optional(ProjectCommands)
}).annotate({
  identifier: "ProjectUpdateInput"
}).pipe(withStatics(s => ({
  zod: zod(s)
})));

// ---------------------------------------------------------------------------
// Effect service
// ---------------------------------------------------------------------------

export class Service extends Context.Service()("@closedcode/Project") {}
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const fs = yield* AppFileSystem.Service;
  const pathSvc = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const bus = yield* Bus.Service;
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
  }, Effect.scoped, Effect.catch(() => Effect.succeed({
    code: 1,
    text: "",
    stderr: ""
  })));
  const db = fn => Effect.promise(() => Database.useAsync(fn));
  const emitUpdated = data => Effect.sync(() => GlobalBus.emit("event", {
    directory: "global",
    project: data.id,
    payload: {
      type: Event.Updated.type,
      properties: data
    }
  }));
  const fakeVcs = Schema.decodeUnknownSync(Schema.optional(ProjectVcs))(Flag.CLOSEDCODE_FAKE_VCS);
  const resolveGitPath = (cwd, name) => {
    if (!name) return cwd;
    name = name.replace(/[\r\n]+$/, "");
    if (!name) return cwd;
    name = AppFileSystem.windowsPath(name);
    if (pathSvc.isAbsolute(name)) return pathSvc.normalize(name);
    return pathSvc.resolve(cwd, name);
  };
  const scope = yield* Scope.Scope;
  const readCachedProjectId = Effect.fnUntraced(function* (dir) {
    return yield* fs.readFileString(pathSvc.join(dir, "closedcode")).pipe(Effect.map(x => x.trim()), Effect.map(x => ProjectID.make(x)), Effect.catch(() => fs.readFileString(pathSvc.join(dir, "opencode")).pipe(Effect.map(x => x.trim()), Effect.map(x => ProjectID.make(x)), Effect.catch(() => Effect.void))));
  });
  const fromDirectory = Effect.fn("Project.fromDirectory")(function* (directory) {
    log.info("fromDirectory", {
      directory
    });

    // Phase 1: discover git info

    const data = yield* Effect.gen(function* () {
      const dotgitMatches = yield* fs.up({
        targets: [".git"],
        start: directory
      }).pipe(Effect.orDie);
      const dotgit = dotgitMatches[0];
      if (!dotgit) {
        return {
          id: ProjectID.global,
          worktree: "/",
          sandbox: "/",
          vcs: fakeVcs
        };
      }
      let sandbox = pathSvc.dirname(dotgit);
      const gitBinary = yield* Effect.sync(() => which("git"));
      let id = yield* readCachedProjectId(dotgit);
      if (!gitBinary) {
        return {
          id: id ?? ProjectID.global,
          worktree: sandbox,
          sandbox,
          vcs: fakeVcs
        };
      }
      const commonDir = yield* git(["rev-parse", "--git-common-dir"], {
        cwd: sandbox
      });
      if (commonDir.code !== 0) {
        return {
          id: id ?? ProjectID.global,
          worktree: sandbox,
          sandbox,
          vcs: fakeVcs
        };
      }
      const common = resolveGitPath(sandbox, commonDir.text.trim());
      const bareCheck = yield* git(["config", "--bool", "core.bare"], {
        cwd: sandbox
      });
      const isBareRepo = bareCheck.code === 0 && bareCheck.text.trim() === "true";
      const worktree = common === sandbox ? sandbox : isBareRepo ? common : pathSvc.dirname(common);
      if (id == null) {
        id = yield* readCachedProjectId(common);
      }
      if (!id) {
        const revList = yield* git(["rev-list", "--max-parents=0", "HEAD"], {
          cwd: sandbox
        });
        const roots = revList.text.split("\n").filter(Boolean).map(x => x.trim()).toSorted();
        id = roots[0] ? ProjectID.make(roots[0]) : undefined;
        if (id) {
          yield* fs.writeFileString(pathSvc.join(common, "closedcode"), id).pipe(Effect.ignore);
        }
      }
      if (!id) {
        return {
          id: ProjectID.global,
          worktree: sandbox,
          sandbox,
          vcs: "git"
        };
      }
      const topLevel = yield* git(["rev-parse", "--show-toplevel"], {
        cwd: sandbox
      });
      if (topLevel.code !== 0) {
        return {
          id,
          worktree: sandbox,
          sandbox,
          vcs: fakeVcs
        };
      }
      sandbox = resolveGitPath(sandbox, topLevel.text.trim());
      return {
        id,
        sandbox,
        worktree,
        vcs: "git"
      };
    });

    // Phase 2: upsert
    const row = yield* db(async h => plain(await h.models.Project.findOne({ where: { id: data.id }, transaction: h.tx })));
    const existing = row ? fromRow(row) : {
      id: data.id,
      worktree: data.worktree,
      vcs: data.vcs,
      sandboxes: [],
      time: {
        created: Date.now(),
        updated: Date.now()
      }
    };
    if (Flag.CLOSEDCODE_EXPERIMENTAL_ICON_DISCOVERY) yield* discover(existing).pipe(Effect.ignore, Effect.forkIn(scope));
    const result = {
      ...existing,
      worktree: data.worktree,
      vcs: data.vcs,
      time: {
        ...existing.time,
        updated: Date.now()
      }
    };
    if (data.sandbox !== result.worktree && !result.sandboxes.includes(data.sandbox)) result.sandboxes.push(data.sandbox);
    result.sandboxes = yield* Effect.forEach(result.sandboxes, s => fs.exists(s).pipe(Effect.orDie, Effect.map(exists => exists ? s : undefined)), {
      concurrency: "unbounded"
    }).pipe(Effect.map(arr => arr.filter(x => x !== undefined)));
    yield* db(h => h.models.Project.upsert({
      id: result.id,
      worktree: result.worktree,
      vcs: result.vcs ?? null,
      name: result.name,
      icon_url: result.icon?.url,
      icon_url_override: result.icon?.override,
      icon_color: result.icon?.color,
      time_created: result.time.created,
      time_updated: result.time.updated,
      time_initialized: result.time.initialized,
      sandboxes: result.sandboxes,
      commands: result.commands
    }, { transaction: h.tx }));
    if (data.id !== ProjectID.global) {
      yield* db(h => h.models.Session.update({
        project_id: data.id
      }, { where: { project_id: ProjectID.global, directory: data.worktree }, transaction: h.tx }));
    }
    yield* emitUpdated(result);
    return {
      project: result,
      sandbox: data.sandbox
    };
  });
  const discover = Effect.fn("Project.discover")(function* (input) {
    if (input.vcs !== "git") return;
    if (input.icon?.override) return;
    if (input.icon?.url) return;
    const matches = yield* fs.glob("**/favicon.{ico,png,svg,jpg,jpeg,webp}", {
      cwd: input.worktree,
      absolute: true,
      include: "file"
    }).pipe(Effect.orDie);
    const shortest = matches.sort((a, b) => a.length - b.length)[0];
    if (!shortest) return;
    const buffer = yield* fs.readFile(shortest).pipe(Effect.orDie);
    const base64 = Buffer.from(buffer).toString("base64");
    const mime = AppFileSystem.mimeType(shortest);
    const url = `data:${mime};base64,${base64}`;
    yield* update({
      projectID: input.id,
      icon: {
        url
      }
    });
  });
  const list = Effect.fn("Project.list")(function* () {
    return yield* db(async h => (await h.models.Project.findAll({ transaction: h.tx })).map(row => fromRow(row.get({ plain: true }))));
  });
  const get = Effect.fn("Project.get")(function* (id) {
    const row = yield* db(async h => plain(await h.models.Project.findOne({ where: { id }, transaction: h.tx })));
    return row ? fromRow(row) : undefined;
  });
  const update = Effect.fn("Project.update")(function* (input) {
    const result = yield* db(async h => {
      await h.models.Project.update({
        name: input.name,
        icon_url: input.icon?.url,
        icon_url_override: input.icon?.override,
        icon_color: input.icon?.color,
        commands: input.commands,
        time_updated: Date.now()
      }, { where: { id: input.projectID }, transaction: h.tx });
      return plain(await h.models.Project.findByPk(input.projectID, { transaction: h.tx }));
    });
    if (!result) throw new Error(`Project not found: ${input.projectID}`);
    const data = fromRow(result);
    yield* emitUpdated(data);
    return data;
  });
  const initGit = Effect.fn("Project.initGit")(function* (input) {
    if (input.project.vcs === "git") return input.project;
    if (!(yield* Effect.sync(() => which("git")))) throw new Error("Git is not installed");
    const result = yield* git(["init", "--quiet"], {
      cwd: input.directory
    });
    if (result.code !== 0) {
      throw new Error(result.stderr.trim() || result.text.trim() || "Failed to initialize git repository");
    }
    const {
      project
    } = yield* fromDirectory(input.directory);
    return project;
  });
  const setInitialized = Effect.fn("Project.setInitialized")(function* (id) {
    yield* db(h => h.models.Project.update({
      time_initialized: Date.now()
    }, { where: { id }, transaction: h.tx }));
  });
  const initState = yield* InstanceState.make(Effect.fn("Project.initState")(function* (ctx) {
    yield* bus.subscribe(Command.Event.Executed).pipe(Stream.runForEach(payload => payload.properties.name === Command.Default.INIT ? setInitialized(ctx.project.id) : Effect.void), Effect.forkScoped);
  }));
  const init = Effect.fn("Project.init")(function* () {
    yield* InstanceState.get(initState);
  });
  const sandboxes = Effect.fn("Project.sandboxes")(function* (id) {
    const row = yield* db(async h => plain(await h.models.Project.findOne({ where: { id }, transaction: h.tx })));
    if (!row) return [];
    const data = fromRow(row);
    return yield* Effect.forEach(data.sandboxes, dir => fs.isDir(dir).pipe(Effect.orDie, Effect.map(ok => ok ? dir : undefined)), {
      concurrency: "unbounded"
    }).pipe(Effect.map(arr => arr.filter(x => x !== undefined)));
  });
  const addSandbox = Effect.fn("Project.addSandbox")(function* (id, directory) {
    const row = yield* db(async h => plain(await h.models.Project.findOne({ where: { id }, transaction: h.tx })));
    if (!row) throw new Error(`Project not found: ${id}`);
    const sboxes = [...jsonValue(row.sandboxes)];
    if (!sboxes.includes(directory)) sboxes.push(directory);
    const result = yield* db(async h => {
      await h.models.Project.update({
        sandboxes: sboxes,
        time_updated: Date.now()
      }, { where: { id }, transaction: h.tx });
      return plain(await h.models.Project.findByPk(id, { transaction: h.tx }));
    });
    if (!result) throw new Error(`Project not found: ${id}`);
    yield* emitUpdated(fromRow(result));
  });
  const removeSandbox = Effect.fn("Project.removeSandbox")(function* (id, directory) {
    const row = yield* db(async h => plain(await h.models.Project.findOne({ where: { id }, transaction: h.tx })));
    if (!row) throw new Error(`Project not found: ${id}`);
    const sboxes = jsonValue(row.sandboxes).filter(s => s !== directory);
    const result = yield* db(async h => {
      await h.models.Project.update({
        sandboxes: sboxes,
        time_updated: Date.now()
      }, { where: { id }, transaction: h.tx });
      return plain(await h.models.Project.findByPk(id, { transaction: h.tx }));
    });
    if (!result) throw new Error(`Project not found: ${id}`);
    yield* emitUpdated(fromRow(result));
  });
  return Service.of({
    init,
    fromDirectory,
    discover,
    list,
    get,
    update,
    initGit,
    setInitialized,
    sandboxes,
    addSandbox,
    removeSandbox
  });
}));
export const defaultLayer = layer.pipe(Layer.provide(Bus.defaultLayer), Layer.provide(CrossSpawnSpawner.defaultLayer), Layer.provide(AppFileSystem.defaultLayer), Layer.provide(NodePath.layer));
export const use = serviceUse(Service);
export async function list() {
  return Database.useAsync(async h => (await h.models.Project.findAll({ transaction: h.tx })).map(row => fromRow(row.get({ plain: true }))));
}
export async function get(id) {
  const row = await Database.useAsync(async h => plain(await h.models.Project.findOne({ where: { id }, transaction: h.tx })));
  if (!row) return undefined;
  return fromRow(row);
}
export async function setInitialized(id) {
  await Database.useAsync(h => h.models.Project.update({
    time_initialized: Date.now()
  }, { where: { id }, transaction: h.tx }));
}
export * as Project from "./project.js";