import * as Log from "core/util/log";
import path from "path";
import { Global } from "core/global";
import { NamedError } from "core/util/error";
import z from "zod";
import { AppFileSystem } from "core/filesystem";
import { Effect, Exit, Layer, Option, RcMap, Schema, Context, TxReentrantLock } from "effect";
import { NonNegativeInt } from "@/util/schema.js";
import { Git } from "@/git/index.js";
const log = Log.create({
  service: "storage"
});
export const NotFoundError = NamedError.create("NotFoundError", z.object({
  message: z.string()
}));
const RootFile = Schema.Struct({
  path: Schema.optional(Schema.Struct({
    root: Schema.optional(Schema.String)
  }))
});
const SessionFile = Schema.Struct({
  id: Schema.String
});
const MessageFile = Schema.Struct({
  id: Schema.String
});
const DiffFile = Schema.Struct({
  additions: NonNegativeInt,
  deletions: NonNegativeInt
});
const SummaryFile = Schema.Struct({
  id: Schema.String,
  projectID: Schema.String,
  summary: Schema.Struct({
    diffs: Schema.Array(DiffFile)
  })
});
const decodeRoot = Schema.decodeUnknownOption(RootFile);
const decodeSession = Schema.decodeUnknownOption(SessionFile);
const decodeMessage = Schema.decodeUnknownOption(MessageFile);
const decodeSummary = Schema.decodeUnknownOption(SummaryFile);
export class Service extends Context.Service()("@closedcode/Storage") {}
function file(dir, key) {
  return path.join(dir, ...key) + ".json";
}
function missing(err) {
  if (!err || typeof err !== "object") return false;
  if ("code" in err && err.code === "ENOENT") return true;
  if ("reason" in err && err.reason && typeof err.reason === "object" && "_tag" in err.reason) {
    return err.reason._tag === "NotFound";
  }
  return false;
}
function parseMigration(text) {
  const value = Number.parseInt(text, 10);
  return Number.isNaN(value) ? 0 : value;
}
const MIGRATIONS = [Effect.fn("Storage.migration.1")(function* (dir, fs, git) {
  const project = path.resolve(dir, "../project");
  if (!(yield* fs.isDir(project))) return;
  const projectDirs = yield* fs.glob("*", {
    cwd: project,
    include: "all"
  });
  for (const projectDir of projectDirs) {
    const full = path.join(project, projectDir);
    if (!(yield* fs.isDir(full))) continue;
    log.info(`migrating project ${projectDir}`);
    let projectID = projectDir;
    let worktree = "/";
    if (projectID !== "global") {
      for (const msgFile of yield* fs.glob("storage/session/message/*/*.json", {
        cwd: full,
        absolute: true
      })) {
        const json = decodeRoot(yield* fs.readJson(msgFile), {
          onExcessProperty: "preserve"
        });
        const root = Option.isSome(json) ? json.value.path?.root : undefined;
        if (!root) continue;
        worktree = root;
        break;
      }
      if (!worktree) continue;
      if (!(yield* fs.isDir(worktree))) continue;
      const result = yield* git.run(["rev-list", "--max-parents=0", "--all"], {
        cwd: worktree
      });
      const [id] = result.text().split("\n").filter(Boolean).map(x => x.trim()).toSorted();
      if (!id) continue;
      projectID = id;
      yield* fs.writeWithDirs(path.join(dir, "project", projectID + ".json"), JSON.stringify({
        id,
        vcs: "git",
        worktree,
        time: {
          created: Date.now(),
          initialized: Date.now()
        }
      }, null, 2));
      log.info(`migrating sessions for project ${projectID}`);
      for (const sessionFile of yield* fs.glob("storage/session/info/*.json", {
        cwd: full,
        absolute: true
      })) {
        const dest = path.join(dir, "session", projectID, path.basename(sessionFile));
        log.info("copying", {
          sessionFile,
          dest
        });
        const session = yield* fs.readJson(sessionFile);
        const info = decodeSession(session, {
          onExcessProperty: "preserve"
        });
        yield* fs.writeWithDirs(dest, JSON.stringify(session, null, 2));
        if (Option.isNone(info)) continue;
        log.info(`migrating messages for session ${info.value.id}`);
        for (const msgFile of yield* fs.glob(`storage/session/message/${info.value.id}/*.json`, {
          cwd: full,
          absolute: true
        })) {
          const next = path.join(dir, "message", info.value.id, path.basename(msgFile));
          log.info("copying", {
            msgFile,
            dest: next
          });
          const message = yield* fs.readJson(msgFile);
          const item = decodeMessage(message, {
            onExcessProperty: "preserve"
          });
          yield* fs.writeWithDirs(next, JSON.stringify(message, null, 2));
          if (Option.isNone(item)) continue;
          log.info(`migrating parts for message ${item.value.id}`);
          for (const partFile of yield* fs.glob(`storage/session/part/${info.value.id}/${item.value.id}/*.json`, {
            cwd: full,
            absolute: true
          })) {
            const out = path.join(dir, "part", item.value.id, path.basename(partFile));
            const part = yield* fs.readJson(partFile);
            log.info("copying", {
              partFile,
              dest: out
            });
            yield* fs.writeWithDirs(out, JSON.stringify(part, null, 2));
          }
        }
      }
    }
  }
}), Effect.fn("Storage.migration.2")(function* (dir, fs) {
  for (const item of yield* fs.glob("session/*/*.json", {
    cwd: dir,
    absolute: true
  })) {
    const raw = yield* fs.readJson(item);
    const session = decodeSummary(raw, {
      onExcessProperty: "preserve"
    });
    if (Option.isNone(session)) continue;
    const diffs = session.value.summary.diffs;
    yield* fs.writeWithDirs(path.join(dir, "session_diff", session.value.id + ".json"), JSON.stringify(diffs, null, 2));
    yield* fs.writeWithDirs(path.join(dir, "session", session.value.projectID, session.value.id + ".json"), JSON.stringify({
      ...raw,
      summary: {
        additions: diffs.reduce((sum, x) => sum + x.additions, 0),
        deletions: diffs.reduce((sum, x) => sum + x.deletions, 0)
      }
    }, null, 2));
  }
})];
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const fs = yield* AppFileSystem.Service;
  const git = yield* Git.Service;
  const locks = yield* RcMap.make({
    lookup: () => TxReentrantLock.make(),
    idleTimeToLive: 0
  });
  const state = yield* Effect.cached(Effect.gen(function* () {
    const dir = path.join(Global.Path.data, "storage");
    const marker = path.join(dir, "migration");
    const migration = yield* fs.readFileString(marker).pipe(Effect.map(parseMigration), Effect.catchIf(missing, () => Effect.succeed(0)), Effect.orElseSucceed(() => 0));
    for (let i = migration; i < MIGRATIONS.length; i++) {
      log.info("running migration", {
        index: i
      });
      const step = MIGRATIONS[i];
      const exit = yield* Effect.exit(step(dir, fs, git));
      if (Exit.isFailure(exit)) {
        log.error("failed to run migration", {
          index: i,
          cause: exit.cause
        });
        break;
      }
      yield* fs.writeWithDirs(marker, String(i + 1));
    }
    return {
      dir
    };
  }));
  const fail = target => Effect.fail(new NotFoundError({
    message: `Resource not found: ${target}`
  }));
  const wrap = (target, body) => body.pipe(Effect.catchIf(missing, () => fail(target)));
  const writeJson = Effect.fnUntraced(function* (target, content) {
    yield* fs.writeWithDirs(target, JSON.stringify(content, null, 2));
  });
  const withResolved = (key, fn) => Effect.scoped(Effect.gen(function* () {
    const target = file((yield* state).dir, key);
    return yield* fn(target, yield* RcMap.get(locks, target));
  }));
  const remove = Effect.fn("Storage.remove")(function* (key) {
    yield* withResolved(key, (target, rw) => TxReentrantLock.withWriteLock(rw, fs.remove(target).pipe(Effect.catchIf(missing, () => Effect.void))));
  });
  const read = key => Effect.gen(function* () {
    const value = yield* withResolved(key, (target, rw) => TxReentrantLock.withReadLock(rw, wrap(target, fs.readJson(target))));
    return value;
  });
  const update = (key, fn) => Effect.gen(function* () {
    const value = yield* withResolved(key, (target, rw) => TxReentrantLock.withWriteLock(rw, Effect.gen(function* () {
      const content = yield* wrap(target, fs.readJson(target));
      fn(content);
      yield* writeJson(target, content);
      return content;
    })));
    return value;
  });
  const write = (key, content) => Effect.gen(function* () {
    yield* withResolved(key, (target, rw) => TxReentrantLock.withWriteLock(rw, writeJson(target, content)));
  });
  const list = Effect.fn("Storage.list")(function* (prefix) {
    const dir = (yield* state).dir;
    const cwd = path.join(dir, ...prefix);
    const result = yield* fs.glob("**/*", {
      cwd,
      include: "file"
    }).pipe(Effect.catch(() => Effect.succeed([])));
    return result.map(x => [...prefix, ...x.slice(0, -5).split(path.sep)]).toSorted((a, b) => a.join("/").localeCompare(b.join("/")));
  });
  return Service.of({
    remove,
    read,
    update,
    write,
    list
  });
}));
export const defaultLayer = layer.pipe(Layer.provide(AppFileSystem.defaultLayer), Layer.provide(Git.defaultLayer));
export * as Storage from "./storage.js";