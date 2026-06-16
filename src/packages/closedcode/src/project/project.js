/** @file Project domain: schemas, persistence, and the Project Effect service that discovers a project from a directory (git aware), stores it, and manages icons/sandboxes. */
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
/**
 * Convert a Sequelize model row into a plain object, or undefined when null.
 *
 * @param {*} row - A Sequelize model instance or nullish value.
 * @returns {Object|undefined} The plain row object, or undefined.
 */
const plain = row => (row == null ? undefined : row.get({ plain: true }));
// The migration journal declares JSON columns as TEXT, so the sqlite dialect
// returns them unparsed strings on reads (PRAGMA table_info drives parsing);
// normalize to drizzle's mode:"json" behavior. Parsed values pass through.
/**
 * Normalize a JSON column value: parse strings, pass already-parsed values through.
 *
 * @param {*} value - The raw column value (string or already-parsed).
 * @returns {*} The parsed value.
 */
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
/** Schema describing a project's persisted info (id, worktree, vcs, name, icon, commands, timestamps, sandboxes). */
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
/** Bus event definitions emitted by the project service. */
export const Event = {
  Updated: BusEvent.define("project.updated", Info)
};

/**
 * Map a plain database row into a Project Info object, assembling the icon
 * sub-object and parsing JSON columns.
 *
 * @param {Object} row - The plain database row for a project.
 * @returns {Object} The Project Info object.
 */
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
/** Zod schema for project update input (project id plus optional name/icon/commands). */
export const UpdateInput = z.object({
  projectID: ProjectID.zod,
  name: z.string().optional(),
  icon: zod(ProjectIcon).optional(),
  commands: zod(ProjectCommands).optional()
});
/** Effect Schema for the project update payload (optional name/icon/commands). */
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

/** Effect Context tag identifying the Project service. */
export class Service extends Context.Service()("@closedcode/Project") {}

/**
 * Effect layer providing the Project Service: discovery from a directory,
 * persistence (list/get/update), git init, icon discovery, and sandbox
 * management.
 */
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const fs = yield* AppFileSystem.Service;
  const pathSvc = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const bus = yield* Bus.Service;
  /**
   * Run a git subcommand and capture its result. Never rejects: on spawn
   * failure it resolves to a non-zero code with empty output.
   *
   * @param {Array} args - Arguments passed to the git binary.
   * @param {Object} opts - Spawn options; `cwd` sets the working directory.
   * @returns {Effect} Effect yielding {code, text, stderr}.
   */
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
  /**
   * Run a database callback inside a transaction-aware handle, wrapped as an Effect.
   *
   * @param {Function} fn - Callback receiving the Database handle ({models, sequelize, tx}).
   * @returns {Effect} Effect yielding the callback's resolved value.
   */
  const db = fn => Effect.promise(() => Database.useAsync(fn));

  /**
   * Emit a `project.updated` event on the global bus for the given project data.
   *
   * @param {Object} data - The updated Project Info.
   * @returns {Effect} Effect that emits the event.
   */
  const emitUpdated = data => Effect.sync(() => GlobalBus.emit("event", {
    directory: "global",
    project: data.id,
    payload: {
      type: Event.Updated.type,
      properties: data
    }
  }));
  const fakeVcs = Schema.decodeUnknownSync(Schema.optional(ProjectVcs))(Flag.CLOSEDCODE_FAKE_VCS);
  /**
   * Resolve a path reported by git (which may be relative, absolute, or empty)
   * against a base directory, normalizing Windows paths and trailing newlines.
   *
   * @param {string} cwd - Base directory to resolve relative paths against.
   * @param {string} name - The git-reported path (possibly empty or newline-terminated).
   * @returns {string} The resolved absolute path, or cwd when name is empty.
   */
  const resolveGitPath = (cwd, name) => {
    if (!name) return cwd;
    name = name.replace(/[\r\n]+$/, "");
    if (!name) return cwd;
    name = AppFileSystem.windowsPath(name);
    if (pathSvc.isAbsolute(name)) return pathSvc.normalize(name);
    return pathSvc.resolve(cwd, name);
  };
  const scope = yield* Scope.Scope;
  /**
   * Read a cached project id from the `closedcode` marker file in a directory,
   * falling back to the legacy `opencode` file, or undefined if neither exists.
   *
   * @param {string} dir - The directory (typically the git dir) to read from.
   * @returns {Effect} Effect yielding the ProjectID or undefined.
   */
  const readCachedProjectId = Effect.fnUntraced(function* (dir) {
    return yield* fs.readFileString(pathSvc.join(dir, "closedcode")).pipe(Effect.map(x => x.trim()), Effect.map(x => ProjectID.make(x)), Effect.catch(() => fs.readFileString(pathSvc.join(dir, "opencode")).pipe(Effect.map(x => x.trim()), Effect.map(x => ProjectID.make(x)), Effect.catch(() => Effect.void))));
  });
  /**
   * Resolve and persist the project for a directory. Phase 1 discovers git info
   * (worktree, sandbox/top-level, common dir, bare repo, root-commit-derived id),
   * Phase 2 upserts the project row, reconciles sandboxes, optionally kicks off
   * icon discovery, reassigns global-scoped sessions, and emits an update event.
   *
   * @param {string} directory - The directory to resolve a project from.
   * @returns {Effect} Effect yielding {project, sandbox}.
   */
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
  /**
   * Best-effort icon discovery: for git projects without an existing icon, find
   * the shortest-pathed favicon under the worktree, encode it as a data URL, and
   * store it as the project icon.
   *
   * @param {Object} input - Project Info to discover an icon for.
   * @returns {Effect} Effect that updates the icon when one is found.
   */
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
  /**
   * List all persisted projects.
   *
   * @returns {Effect} Effect yielding an array of Project Info objects.
   */
  const list = Effect.fn("Project.list")(function* () {
    return yield* db(async h => (await h.models.Project.findAll({ transaction: h.tx })).map(row => fromRow(row.get({ plain: true }))));
  });

  /**
   * Get a single project by id.
   *
   * @param {string} id - The project id.
   * @returns {Effect} Effect yielding the Project Info or undefined when not found.
   */
  const get = Effect.fn("Project.get")(function* (id) {
    const row = yield* db(async h => plain(await h.models.Project.findOne({ where: { id }, transaction: h.tx })));
    return row ? fromRow(row) : undefined;
  });

  /**
   * Update a project's name/icon/commands and emit an update event.
   *
   * @param {Object} input - Update input ({projectID, name, icon, commands}).
   * @returns {Effect} Effect yielding the updated Project Info.
   */
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
  /**
   * Initialize a git repository for a non-git project, then re-resolve and
   * return the updated project.
   *
   * @param {Object} input - Input with `project` and `directory`.
   * @returns {Effect} Effect yielding the (possibly newly git-backed) project.
   */
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
  /**
   * Mark a project as initialized by stamping its `time_initialized` column.
   *
   * @param {string} id - The project id.
   * @returns {Effect} Effect that performs the update.
   */
  const setInitialized = Effect.fn("Project.setInitialized")(function* (id) {
    yield* db(h => h.models.Project.update({
      time_initialized: Date.now()
    }, { where: { id }, transaction: h.tx }));
  });
  // Per-instance state: subscribe to command-executed events and stamp the
  // project initialized when the INIT command runs.
  const initState = yield* InstanceState.make(Effect.fn("Project.initState")(function* (ctx) {
    yield* bus.subscribe(Command.Event.Executed).pipe(Stream.runForEach(payload => payload.properties.name === Command.Default.INIT ? setInitialized(ctx.project.id) : Effect.void), Effect.forkScoped);
  }));

  /**
   * Materialize the per-instance init state (sets up the INIT command subscription).
   *
   * @returns {Effect} Effect that initializes the project's per-instance state.
   */
  const init = Effect.fn("Project.init")(function* () {
    yield* InstanceState.get(initState);
  });

  /**
   * Return the project's sandbox directories that still exist on disk.
   *
   * @param {string} id - The project id.
   * @returns {Effect} Effect yielding an array of existing sandbox directory paths.
   */
  const sandboxes = Effect.fn("Project.sandboxes")(function* (id) {
    const row = yield* db(async h => plain(await h.models.Project.findOne({ where: { id }, transaction: h.tx })));
    if (!row) return [];
    const data = fromRow(row);
    return yield* Effect.forEach(data.sandboxes, dir => fs.isDir(dir).pipe(Effect.orDie, Effect.map(ok => ok ? dir : undefined)), {
      concurrency: "unbounded"
    }).pipe(Effect.map(arr => arr.filter(x => x !== undefined)));
  });
  /**
   * Add a sandbox directory to a project (no-op if already present) and emit an
   * update event.
   *
   * @param {string} id - The project id.
   * @param {string} directory - The sandbox directory to add.
   * @returns {Effect} Effect that performs the update.
   */
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
  /**
   * Remove a sandbox directory from a project and emit an update event.
   *
   * @param {string} id - The project id.
   * @param {string} directory - The sandbox directory to remove.
   * @returns {Effect} Effect that performs the update.
   */
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
/** Project layer with its Bus, child-process spawner, filesystem, and path dependencies provided. */
export const defaultLayer = layer.pipe(Layer.provide(Bus.defaultLayer), Layer.provide(CrossSpawnSpawner.defaultLayer), Layer.provide(AppFileSystem.defaultLayer), Layer.provide(NodePath.layer));

/** Helper that yields the Project Service and invokes a callback with it. */
export const use = serviceUse(Service);

/**
 * Promise-based list of all persisted projects (for non-Effect callers).
 *
 * @returns {Promise<Array>} Resolves to an array of Project Info objects.
 */
export async function list() {
  return Database.useAsync(async h => (await h.models.Project.findAll({ transaction: h.tx })).map(row => fromRow(row.get({ plain: true }))));
}

/**
 * Promise-based lookup of a single project by id (for non-Effect callers).
 *
 * @param {string} id - The project id.
 * @returns {Promise<Object|undefined>} Resolves to the Project Info, or undefined when not found.
 */
export async function get(id) {
  const row = await Database.useAsync(async h => plain(await h.models.Project.findOne({ where: { id }, transaction: h.tx })));
  if (!row) return undefined;
  return fromRow(row);
}

/**
 * Promise-based marking of a project as initialized (for non-Effect callers).
 *
 * @param {string} id - The project id.
 * @returns {Promise<void>} Resolves once the update completes.
 */
export async function setInitialized(id) {
  await Database.useAsync(h => h.models.Project.update({
    time_initialized: Date.now()
  }, { where: { id }, transaction: h.tx }));
}
export * as Project from "./project.js";