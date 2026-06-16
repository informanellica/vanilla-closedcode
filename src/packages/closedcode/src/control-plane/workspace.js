/** @file Workspace control-plane service: creates workspaces, syncs their event history over SSE/HTTP to remote targets, restores sessions, and tracks connection status. */
import { Context, Effect, FiberMap, Layer, Schema, Stream } from "effect";
import { FetchHttpClient, HttpBody, HttpClient, HttpClientRequest } from "effect/unstable/http";
import { Database } from "#storage/db.js";
import { Op } from "#storage/sequelize.js";
import { BusEvent } from "#bus/bus-event.js";
import { GlobalBus } from "#bus/global.js";
import { Auth } from "#auth/index.js";
import { SyncEvent } from "#sync/index.js";
import { Flag } from "core/flag/flag";
import * as Log from "core/util/log";
import { Filesystem } from "#util/filesystem.js";
import { ProjectID } from "#project/schema.js";
import { Slug } from "core/util/slug";
import { getAdapter } from "./adapters/index.js";
import { WorkspaceInfo as WorkspaceInfoSchema } from "./types.js";
import { WorkspaceID } from "./schema.js";
import { Session } from "#session/session.js";
import { SessionID } from "#session/schema.js";
import { errorData } from "#util/error.js";
import { waitEvent } from "./util.js";
import { WorkspaceContext } from "./workspace-context.js";
import { EffectBridge } from "#effect/bridge.js";
import { NonNegativeInt, withStatics } from "#util/schema.js";
import { zod as effectZod, zodObject } from "#util/effect-zod.js";
/** Schema describing a workspace's persisted info. */
export const Info = WorkspaceInfoSchema;
/** Schema for a workspace connection status update ({ workspaceID, status }). */
export const ConnectionStatus = Schema.Struct({
  workspaceID: WorkspaceID,
  status: Schema.Literals(["connected", "connecting", "disconnected", "error"])
});
const Restore = Schema.Struct({
  workspaceID: WorkspaceID,
  sessionID: SessionID,
  total: NonNegativeInt,
  step: NonNegativeInt
});
/** Bus event definitions emitted by the workspace service (ready, failed, restore progress, status). */
export const Event = {
  Ready: BusEvent.define("workspace.ready", Schema.Struct({
    name: Schema.String
  })),
  Failed: BusEvent.define("workspace.failed", Schema.Struct({
    message: Schema.String
  })),
  Restore: BusEvent.define("workspace.restore", Restore),
  Status: BusEvent.define("workspace.status", ConnectionStatus)
};
// sequelize v6's sqlite dialect stores DataTypes.JSON as TEXT but hands the
// raw string back on reads; decode like drizzle's { mode: "json" } did. The
// typeof guard keeps this a no-op if the layer ever starts parsing itself.
/**
 * Decode a column that sequelize's sqlite dialect stores as TEXT but returns raw.
 * @param {*} value - Either a JSON string (decoded) or an already-parsed value (passed through).
 * @returns {*} The parsed value, or the input unchanged when not a string.
 */
const json = value => (typeof value === "string" ? JSON.parse(value) : value);
/**
 * Map a plain Workspace database row into a WorkspaceInfo object.
 * @param {Object} row - Plain workspace row from sequelize.
 * @returns {Object} Workspace info with id, type, branch, name, directory, decoded extra, and projectID.
 */
function fromRow(row) {
  return {
    id: row.id,
    type: row.type,
    branch: row.branch,
    name: row.name,
    directory: row.directory,
    extra: json(row.extra),
    projectID: row.project_id
  };
}
// Sequelize call-site conventions (ORM migration S3): Database.useAsync hands
// a handle { models, sequelize, tx }; every model call passes
// { transaction: h.tx } (undefined outside a tx). Reads return plain rows.
/**
 * Convert a sequelize model instance into a plain object, tolerating null.
 * @param {*} row - A sequelize model instance, or null/undefined.
 * @returns {Object} The plain row object, or undefined when the input is null.
 */
const plain = row => (row == null ? undefined : row.get({ plain: true }));
/**
 * Wrap an async database callback as an Effect using the shared Database handle.
 * @param {Function} fn - Async callback receiving the Database handle { models, sequelize, tx }.
 * @returns {Effect} Effect that resolves to the callback's result.
 */
const db = fn => Effect.promise(() => Database.useAsync(fn));
const log = Log.create({
  service: "workspace-sync"
});
/** Input schema for creating a workspace (id optional; type, branch, projectID, extra). */
export const CreateInput = Schema.Struct({
  id: Schema.optional(WorkspaceID),
  type: Info.fields.type,
  branch: Info.fields.branch,
  projectID: ProjectID,
  extra: Info.fields.extra
}).pipe(withStatics(s => ({
  zod: effectZod(s),
  zodObject: zodObject(s)
})));
/** Input schema for restoring a session into a workspace ({ workspaceID, sessionID }). */
export const SessionRestoreInput = Schema.Struct({
  workspaceID: WorkspaceID,
  sessionID: SessionID
}).pipe(withStatics(s => ({
  zod: effectZod(s),
  zodObject: zodObject(s)
})));
/** Tagged error for a non-2xx HTTP response during workspace sync. */
export class SyncHttpError extends Schema.TaggedErrorClass()("WorkspaceSyncHttpError", {
  message: Schema.String,
  status: Schema.Number,
  body: Schema.optional(Schema.String)
}) {}
/** Tagged error raised when a referenced workspace does not exist. */
export class WorkspaceNotFoundError extends Schema.TaggedErrorClass()("WorkspaceNotFoundError", {
  message: Schema.String,
  workspaceID: WorkspaceID
}) {}
/** Tagged error raised when a session has no events to restore. */
export class SessionEventsNotFoundError extends Schema.TaggedErrorClass()("WorkspaceSessionEventsNotFoundError", {
  message: Schema.String,
  sessionID: SessionID
}) {}
/** Tagged error for a non-2xx HTTP response while replaying a session restore batch to a remote target. */
export class SessionRestoreHttpError extends Schema.TaggedErrorClass()("WorkspaceSessionRestoreHttpError", {
  message: Schema.String,
  workspaceID: WorkspaceID,
  sessionID: SessionID,
  status: Schema.Number,
  body: Schema.String
}) {}
/** Tagged error raised when waitForSync exceeds its timeout budget before reaching the fence. */
export class SyncTimeoutError extends Schema.TaggedErrorClass()("WorkspaceSyncTimeoutError", {
  message: Schema.String,
  state: Schema.Record(Schema.String, Schema.Number)
}) {}
/** Tagged error raised when a sync wait is cancelled via its abort signal. */
export class SyncAbortedError extends Schema.TaggedErrorClass()("WorkspaceSyncAbortedError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect)
}) {}
/** Context tag for the Workspace control-plane service. */
export class Service extends Context.Service()("@closedcode/Workspace") {}
/** Layer providing the Workspace service: wires auth, session, HTTP, and sync event dependencies. */
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const auth = yield* Auth.Service;
  const session = yield* Session.Service;
  const http = yield* HttpClient.HttpClient;
  const sync = yield* SyncEvent.Service;
  const connections = new Map();
  const syncFibers = yield* FiberMap.make();
  /**
   * Update a workspace's tracked connection status and broadcast a status event.
   * No-op when the status is unchanged.
   * @param {string} id - Workspace ID.
   * @param {string} status - One of "connected", "connecting", "disconnected", or "error".
   * @returns {void}
   */
  const setStatus = (id, status) => {
    const prev = connections.get(id);
    if (prev?.status === status) return;
    const next = {
      workspaceID: id,
      status
    };
    connections.set(id, next);
    GlobalBus.emit("event", {
      directory: "global",
      workspace: id,
      payload: {
        type: Event.Status.type,
        properties: next
      }
    });
  };
  /**
   * Open the remote `/global/event` SSE endpoint and return its byte stream.
   * @param {string} url - Base remote target URL.
   * @param {Object} headers - Request headers (e.g. auth) for the connection.
   * @returns {Effect} Effect resolving to the response byte stream, or failing with SyncHttpError on a non-2xx status.
   */
  const connectSSE = Effect.fn("Workspace.connectSSE")(function* (url, headers) {
    const response = yield* http.execute(HttpClientRequest.get(route(url, "/global/event"), {
      headers: new Headers(headers),
      accept: "text/event-stream"
    }));
    if (response.status < 200 || response.status >= 300) {
      return yield* new SyncHttpError({
        message: `Workspace sync HTTP failure: ${response.status}`,
        status: response.status
      });
    }
    return response.stream;
  });
  /**
   * Parse an SSE byte stream into events (accumulating data/id/retry fields per
   * blank-line-delimited record) and invoke a handler for each decoded event.
   * Each event's `data` is JSON-parsed; on parse failure it is wrapped as an
   * "sse.message" event.
   * @param {*} stream - SSE response byte stream from connectSSE.
   * @param {Function} onEvent - Effect-returning handler invoked per decoded event.
   * @returns {Effect} Effect that runs to completion when the stream ends.
   */
  const parseSSE = Effect.fn("Workspace.parseSSE")(function* (stream, onEvent) {
    yield* stream.pipe(Stream.decodeText(), Stream.splitLines, Stream.mapAccum(() => ({
      data: [],
      id: undefined,
      retry: 1000
    }), (state, line) => {
      if (line === "") {
        if (!state.data.length) return [state, []];
        return [{
          ...state,
          data: []
        }, [{
          data: state.data.join("\n"),
          id: state.id,
          retry: state.retry
        }]];
      }
      const index = line.indexOf(":");
      const field = index === -1 ? line : line.slice(0, index);
      const value = index === -1 ? "" : line.slice(index + (line[index + 1] === " " ? 2 : 1));
      if (field === "data") return [{
        ...state,
        data: [...state.data, value]
      }, []];
      if (field === "id") return [{
        ...state,
        id: value
      }, []];
      if (field === "retry") {
        const retry = Number.parseInt(value, 10);
        return [Number.isNaN(retry) ? state : {
          ...state,
          retry
        }, []];
      }
      return [state, []];
    }, {
      onHalt: state => state.data.length ? [{
        data: state.data.join("\n"),
        id: state.id,
        retry: state.retry
      }] : []
    }), Stream.map(event => {
      try {
        return JSON.parse(event.data);
      } catch {
        return {
          type: "sse.message",
          properties: {
            data: event.data,
            id: event.id || undefined,
            retry: event.retry
          }
        };
      }
    }), Stream.runForEach(onEvent));
  });
  /**
   * Sync historical events from a remote target into the local store: posts the
   * locally-known per-session sequence numbers, then replays the events the
   * remote returns within the workspace context.
   * @param {Object} space - Workspace info (id, projectID, type, etc.).
   * @param {string} url - Base remote target URL.
   * @param {Object} headers - Request headers for the sync request.
   * @returns {Effect} Effect that completes when history is replayed, or fails with SyncHttpError on a non-2xx status.
   */
  const syncHistory = Effect.fn("Workspace.syncHistory")(function* (space, url, headers) {
    const sessionIDs = yield* db(async h => (await h.models.Session.findAll({
      attributes: ["id"],
      where: { workspace_id: space.id },
      transaction: h.tx
    })).map(row => row.get("id")));
    const state = sessionIDs.length ? Object.fromEntries((yield* db(async h => (await h.models.EventSequence.findAll({
      where: { aggregate_id: { [Op.in]: sessionIDs } },
      transaction: h.tx
    })).map(row => row.get({ plain: true })))).map(row => [row.aggregate_id, row.seq])) : {};
    log.info("syncing workspace history", {
      workspaceID: space.id,
      sessions: sessionIDs.length,
      known: Object.keys(state).length
    });
    const response = yield* http.execute(HttpClientRequest.post(route(url, "/sync/history"), {
      headers: new Headers(headers),
      body: HttpBody.jsonUnsafe(state)
    }));
    if (response.status < 200 || response.status >= 300) {
      const body = yield* response.text;
      return yield* new SyncHttpError({
        message: `Workspace history HTTP failure: ${response.status} ${body}`,
        status: response.status,
        body
      });
    }
    const events = yield* response.json;
    log.info("workspace history synced", {
      workspaceID: space.id,
      events: events.length
    });
    yield* Effect.promise(async () => {
      await WorkspaceContext.provide({
        workspaceID: space.id,
        async fn() {
          await Effect.runPromise(Effect.forEach(events, event => sync.replay({
            id: event.id,
            aggregateID: event.aggregate_id,
            seq: event.seq,
            type: event.type,
            data: event.data
          }, {
            publish: true
          }), {
            discard: true
          }));
        }
      });
    });
  });
  /**
   * Long-running reconnect loop for a remote workspace: connects the SSE stream,
   * syncs history, replays incoming sync events, re-broadcasts other events on
   * the global bus, and reconnects with exponential backoff (capped at 2 minutes)
   * on disconnect. Returns immediately for local targets.
   * @param {Object} space - Workspace info to keep in sync.
   * @returns {Effect} Effect that runs the loop indefinitely (never resolves for remote targets).
   */
  const syncWorkspaceLoop = Effect.fn("Workspace.syncWorkspaceLoop")(function* (space) {
    const adapter = getAdapter(space.projectID, space.type);
    const target = yield* EffectBridge.fromPromise(() => adapter.target(space));
    if (target.type === "local") return;
    let attempt = 0;
    while (true) {
      log.info("connecting to global sync", {
        workspace: space.name
      });
      setStatus(space.id, "connecting");
      const stream = yield* connectSSE(target.url, target.headers).pipe(Effect.tap(() => syncHistory(space, target.url, target.headers)), Effect.catch(err => Effect.sync(() => {
        setStatus(space.id, "error");
        log.info("failed to connect to global sync", {
          workspace: space.name,
          err
        });
        return null;
      })));
      if (stream) {
        attempt = 0;
        log.info("global sync connected", {
          workspace: space.name
        });
        setStatus(space.id, "connected");
        yield* parseSSE(stream, evt => Effect.gen(function* () {
          if (!evt || typeof evt !== "object" || !("payload" in evt)) return;
          const payload = evt.payload;
          if (payload.type === "server.heartbeat") return;
          if (payload.type === "sync" && payload.syncEvent) {
            const failed = yield* sync.replay(payload.syncEvent).pipe(Effect.as(false), Effect.catchCause(error => Effect.sync(() => {
              log.info("failed to replay global event", {
                workspaceID: space.id,
                error
              });
              return true;
            })));
            if (failed) return;
          }
          try {
            const event = evt;
            GlobalBus.emit("event", {
              directory: event.directory,
              project: event.project,
              workspace: space.id,
              payload: event.payload
            });
          } catch (error) {
            log.info("failed to replay global event", {
              workspaceID: space.id,
              error
            });
          }
        }));
        log.info("disconnected from global sync: " + space.id);
        setStatus(space.id, "disconnected");
      }

      // Back off reconnect attempts up to 2 minutes while the workspace
      // stays unavailable.
      yield* Effect.sleep(`${Math.min(120_000, 1_000 * 2 ** attempt)} millis`);
      attempt += 1;
    }
  });
  /**
   * Begin syncing a workspace. For local targets just sets connected/error based
   * on directory existence; for remote targets forks syncWorkspaceLoop into the
   * fiber map (unless already running and healthy). No-op unless the experimental
   * workspaces flag is enabled.
   * @param {Object} space - Workspace info to start syncing.
   * @returns {Effect} Effect that completes once the sync fiber has been registered.
   */
  const startSync = Effect.fn("Workspace.startSync")(function* (space) {
    if (!Flag.CLOSEDCODE_EXPERIMENTAL_WORKSPACES) return;
    const adapter = getAdapter(space.projectID, space.type);
    const target = yield* EffectBridge.fromPromise(() => adapter.target(space));
    if (target.type === "local") {
      setStatus(space.id, (yield* Effect.promise(() => Filesystem.exists(target.directory))) ? "connected" : "error");
      return;
    }
    const exists = yield* FiberMap.has(syncFibers, space.id);
    if (exists && connections.get(space.id)?.status !== "error") return;
    setStatus(space.id, "disconnected");
    yield* FiberMap.run(syncFibers, space.id,
    // TODO: look into `tapError` to set the status but still
    // allow the fiber to fail and automatically get removed
    syncWorkspaceLoop(space).pipe(Effect.catch(error => Effect.sync(() => {
      setStatus(space.id, "error");
      log.warn("workspace listener failed", {
        workspaceID: space.id,
        error
      });
    }))));
  });
  /**
   * Stop syncing a workspace: interrupt its sync fiber and drop its connection state.
   * @param {string} id - Workspace ID.
   * @returns {Effect} Effect that completes once the fiber is removed.
   */
  const stopSync = Effect.fn("Workspace.stopSync")(function* (id) {
    yield* FiberMap.remove(syncFibers, id);
    connections.delete(id);
  });
  /**
   * Create a new workspace: configure it via its adapter, persist the row, spawn
   * the adapter process with auth/OTEL env, then wait for it to report
   * connected/error while starting sync.
   * @param {Object} input - Create input (projectID, type, branch, extra, optional id).
   * @returns {Effect} Effect resolving to the created workspace info.
   */
  const create = Effect.fn("Workspace.create")(function* (input) {
    const id = WorkspaceID.ascending(input.id);
    const adapter = getAdapter(input.projectID, input.type);
    const config = yield* EffectBridge.fromPromise(() => adapter.configure({
      ...input,
      id,
      name: Slug.create(),
      directory: null
    }));
    const info = {
      id,
      type: config.type,
      branch: config.branch ?? null,
      name: config.name ?? null,
      directory: config.directory ?? null,
      extra: config.extra ?? null,
      projectID: input.projectID
    };
    yield* db(async h => {
      await h.models.Workspace.create({
        id: info.id,
        type: info.type,
        branch: info.branch,
        name: info.name,
        directory: info.directory,
        extra: info.extra,
        project_id: info.projectID
      }, { transaction: h.tx });
    });
    const env = {
      CLOSEDCODE_AUTH_CONTENT: JSON.stringify(yield* auth.all()),
      CLOSEDCODE_WORKSPACE_ID: config.id,
      CLOSEDCODE_EXPERIMENTAL_WORKSPACES: "true",
      OTEL_EXPORTER_OTLP_HEADERS: process.env.OTEL_EXPORTER_OTLP_HEADERS,
      OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
      OTEL_RESOURCE_ATTRIBUTES: process.env.OTEL_RESOURCE_ATTRIBUTES
    };
    yield* EffectBridge.fromPromise(() => adapter.create(config, env));
    yield* Effect.all([waitEvent({
      timeout: TIMEOUT,
      fn(event) {
        if (event.workspace === info.id && event.payload.type === Event.Status.type) {
          const {
            status
          } = event.payload.properties;
          return status === "error" || status === "connected";
        }
        return false;
      }
    }), startSync(info)], {
      concurrency: 2,
      discard: true
    });
    return info;
  });
  /**
   * Replay a session's full event history into a workspace in batches of 10,
   * emitting progress (Restore) events. Local targets replay directly; remote
   * targets POST each batch to `/sync/replay`.
   * @param {Object} input - { workspaceID, sessionID } identifying the restore.
   * @returns {Effect} Effect resolving to { total } batch count, or failing with WorkspaceNotFoundError / SessionEventsNotFoundError / SessionRestoreHttpError.
   */
  const sessionRestore = Effect.fn("Workspace.sessionRestore")(function* (input) {
    return yield* Effect.gen(function* () {
      log.info("session restore requested", {
        workspaceID: input.workspaceID,
        sessionID: input.sessionID
      });
      const space = yield* get(input.workspaceID);
      if (!space) return yield* new WorkspaceNotFoundError({
        message: `Workspace not found: ${input.workspaceID}`,
        workspaceID: input.workspaceID
      });
      const adapter = getAdapter(space.projectID, space.type);
      const target = yield* EffectBridge.fromPromise(() => adapter.target(space));
      yield* sync.run(Session.Event.Updated, {
        sessionID: input.sessionID,
        info: {
          workspaceID: input.workspaceID
        }
      });
      const rows = yield* db(async h => (await h.models.Event.findAll({
        where: { aggregate_id: input.sessionID },
        order: [["seq", "ASC"]],
        transaction: h.tx
      })).map(instance => {
        const row = instance.get({ plain: true });
        return {
          id: row.id,
          aggregateID: row.aggregate_id,
          seq: row.seq,
          type: row.type,
          data: json(row.data)
        };
      }));
      if (rows.length === 0) return yield* new SessionEventsNotFoundError({
        message: `No events found for session: ${input.sessionID}`,
        sessionID: input.sessionID
      });
      const size = 10;
      // TODO: look into using effect APIs to process this in chunks
      const sets = Array.from({
        length: Math.ceil(rows.length / size)
      }, (_, i) => rows.slice(i * size, (i + 1) * size));
      const total = sets.length;
      log.info("session restore prepared", {
        workspaceID: input.workspaceID,
        sessionID: input.sessionID,
        workspaceType: space.type,
        directory: space.directory,
        target: target.type === "remote" ? String(route(target.url, "/sync/replay")) : target.directory,
        events: rows.length,
        batches: total,
        first: rows[0]?.seq,
        last: rows.at(-1)?.seq
      });
      yield* Effect.sync(() => GlobalBus.emit("event", {
        directory: "global",
        workspace: input.workspaceID,
        payload: {
          type: Event.Restore.type,
          properties: {
            workspaceID: input.workspaceID,
            sessionID: input.sessionID,
            total,
            step: 0
          }
        }
      }));
      for (const [i, events] of sets.entries()) {
        log.info("session restore batch starting", {
          workspaceID: input.workspaceID,
          sessionID: input.sessionID,
          step: i + 1,
          total,
          events: events.length,
          first: events[0]?.seq,
          last: events.at(-1)?.seq,
          target: target.type === "remote" ? String(route(target.url, "/sync/replay")) : target.directory
        });
        if (target.type === "local") {
          yield* sync.replayAll(events);
          log.info("session restore batch replayed locally", {
            workspaceID: input.workspaceID,
            sessionID: input.sessionID,
            step: i + 1,
            total,
            events: events.length
          });
        } else {
          const url = route(target.url, "/sync/replay");
          const res = yield* http.execute(HttpClientRequest.post(url, {
            headers: new Headers(target.headers),
            body: HttpBody.jsonUnsafe({
              directory: space.directory ?? "",
              events
            })
          }));
          if (res.status < 200 || res.status >= 300) {
            const body = yield* res.text;
            log.error("session restore batch failed", {
              workspaceID: input.workspaceID,
              sessionID: input.sessionID,
              step: i + 1,
              total,
              status: res.status,
              body
            });
            return yield* new SessionRestoreHttpError({
              message: `Failed to replay session ${input.sessionID} into workspace ${input.workspaceID}: HTTP ${res.status} ${body}`,
              workspaceID: input.workspaceID,
              sessionID: input.sessionID,
              status: res.status,
              body
            });
          }
          log.info("session restore batch posted", {
            workspaceID: input.workspaceID,
            sessionID: input.sessionID,
            step: i + 1,
            total,
            status: res.status
          });
        }
        yield* Effect.sync(() => GlobalBus.emit("event", {
          directory: "global",
          workspace: input.workspaceID,
          payload: {
            type: Event.Restore.type,
            properties: {
              workspaceID: input.workspaceID,
              sessionID: input.sessionID,
              total,
              step: i + 1
            }
          }
        }));
      }
      log.info("session restore complete", {
        workspaceID: input.workspaceID,
        sessionID: input.sessionID,
        batches: total
      });
      return {
        total
      };
    }).pipe(Effect.tapError(err => Effect.sync(() => log.error("session restore failed", {
      workspaceID: input.workspaceID,
      sessionID: input.sessionID,
      error: errorData(err)
    }))));
  });
  /**
   * List all workspaces belonging to a project, sorted by id.
   * @param {Object} project - Project with an `id` field.
   * @returns {Effect} Effect resolving to an array of workspace info objects.
   */
  const list = Effect.fn("Workspace.list")(function* (project) {
    return yield* db(async h => (await h.models.Workspace.findAll({
      where: { project_id: project.id },
      transaction: h.tx
    })).map(row => fromRow(row.get({ plain: true }))).sort((a, b) => a.id.localeCompare(b.id)));
  });
  /**
   * Fetch a single workspace by id.
   * @param {string} id - Workspace ID.
   * @returns {Effect} Effect resolving to the workspace info, or undefined if not found.
   */
  const get = Effect.fn("Workspace.get")(function* (id) {
    const row = yield* db(async h => plain(await h.models.Workspace.findOne({ where: { id }, transaction: h.tx })));
    if (!row) return;
    return fromRow(row);
  });
  /**
   * Delete a workspace: removes its sessions, stops sync, tears down adapter
   * resources, and deletes the row.
   * @param {string} id - Workspace ID.
   * @returns {Effect} Effect resolving to the removed workspace info, or undefined if not found.
   */
  const remove = Effect.fn("Workspace.remove")(function* (id) {
    const sessions = yield* db(async h => (await h.models.Session.findAll({
      attributes: ["id"],
      where: { workspace_id: id },
      transaction: h.tx
    })).map(row => row.get({ plain: true })));
    yield* Effect.forEach(sessions, sessionInfo => session.remove(sessionInfo.id), {
      discard: true
    });
    const row = yield* db(async h => plain(await h.models.Workspace.findOne({ where: { id }, transaction: h.tx })));
    if (!row) return;
    yield* stopSync(id);
    const info = fromRow(row);
    yield* Effect.catchCause(Effect.gen(function* () {
      const adapter = getAdapter(info.projectID, row.type);
      yield* EffectBridge.fromPromise(() => adapter.remove(info));
    }), () => Effect.sync(() => {
      log.error("adapter not available when removing workspace", {
        type: row.type
      });
    }));
    yield* db(h => h.models.Workspace.destroy({ where: { id }, transaction: h.tx }));
    return info;
  });
  /**
   * Snapshot the current connection status of every tracked workspace.
   * @returns {Effect} Effect resolving to an array of { workspaceID, status } records.
   */
  const status = Effect.fn("Workspace.status")(function* () {
    return [...connections.values()];
  });
  /**
   * Report whether a workspace currently has a live (non-errored) sync fiber.
   * @param {string} workspaceID - Workspace ID.
   * @returns {Effect} Effect resolving to true when a healthy sync fiber exists.
   */
  const isSyncing = Effect.fn("Workspace.isSyncing")(function* (workspaceID) {
    const exists = yield* FiberMap.has(syncFibers, workspaceID);
    return exists && connections.get(workspaceID)?.status !== "error";
  });
  /**
   * Wait until the local store has caught up to a per-aggregate sequence fence,
   * re-checking after each relevant sync event within the TIMEOUT budget.
   * @param {string} workspaceID - Workspace ID being watched.
   * @param {Object} state - Map of aggregate ID to required sequence number.
   * @param {AbortSignal} signal - Optional abort signal to cancel waiting.
   * @returns {Effect} Effect that resolves once the fence is met, or fails with SyncTimeoutError / SyncAbortedError.
   */
  const waitForSync = Effect.fn("Workspace.waitForSync")(function* (workspaceID, state, signal) {
    if (yield* Effect.promise(() => synced(state))) return;
    // synced() is async now, so it cannot run inside waitEvent's synchronous
    // event callback. Wait for a relevant event, then re-check the fence;
    // repeat within the original TIMEOUT budget.
    const deadline = Date.now() + TIMEOUT;
    const wait = Effect.gen(function* () {
      while (true) {
        yield* waitEvent({
          timeout: Math.max(0, deadline - Date.now()),
          signal,
          fn(event) {
            return !(event.workspace !== workspaceID && event.payload.type !== "sync");
          }
        });
        const done = yield* Effect.tryPromise({
          try: () => synced(state),
          catch: error => error
        });
        if (done) return;
      }
    });
    yield* Effect.catch(wait, () => signal?.aborted ? Effect.fail(new SyncAbortedError({
      message: signal.reason instanceof Error ? signal.reason.message : "Request aborted",
      cause: signal.reason
    })) : Effect.fail(new SyncTimeoutError({
      message: `Timed out waiting for sync fence: ${JSON.stringify(state)}`,
      state
    })));
  });
  /**
   * Start syncing every workspace under a project that has at least one session,
   * forking each sync detached and marking failures as errored.
   * @param {string} projectID - Project ID whose workspaces to start.
   * @returns {Effect} Effect that completes once all syncs have been forked.
   */
  const startWorkspaceSyncing = Effect.fn("Workspace.startWorkspaceSyncing")(function* (projectID) {
    // This session table join makes this query only return
    // workspaces that have sessions. Models define no associations, so the
    // JOIN runs as raw SQL; fromRow decodes the JSON `extra` column.
    const rows = yield* db(async h => {
      const [found] = await h.sequelize.query("SELECT DISTINCT w.* FROM workspace w INNER JOIN session s ON s.workspace_id = w.id WHERE w.project_id = ?", {
        replacements: [projectID],
        transaction: h.tx
      });
      return found.map(workspace => ({
        workspace
      }));
    });
    for (const {
      workspace
    } of rows) {
      yield* startSync(fromRow(workspace)).pipe(Effect.catch(error => Effect.sync(() => {
        setStatus(workspace.id, "error");
        log.warn("workspace sync failed to start", {
          workspaceID: workspace.id,
          error
        });
      })), Effect.forkDetach);
    }
  });
  return Service.of({
    create,
    sessionRestore,
    list,
    get,
    remove,
    status,
    isSyncing,
    waitForSync,
    startWorkspaceSyncing
  });
}));
/** Workspace service layer with its default dependency layers (auth, session, sync, HTTP) provided. */
export const defaultLayer = layer.pipe(Layer.provide(Auth.defaultLayer), Layer.provide(Session.defaultLayer), Layer.provide(SyncEvent.defaultLayer), Layer.provide(FetchHttpClient.layer));
/** Default timeout in milliseconds for workspace create and sync-fence waits. */
const TIMEOUT = 5000;
/**
 * Check whether the local event store has reached a required sequence fence.
 * @param {Object} state - Map of aggregate ID to required sequence number.
 * @returns {Promise<boolean>} True when every aggregate's stored seq meets or exceeds the fence (or the fence is empty).
 */
async function synced(state) {
  const ids = Object.keys(state);
  if (ids.length === 0) return true;
  const rows = await Database.useAsync(async h => (await h.models.EventSequence.findAll({
    where: { aggregate_id: { [Op.in]: ids } },
    transaction: h.tx
  })).map(row => row.get({ plain: true })));
  const done = Object.fromEntries(rows.map(row => [row.aggregate_id, row.seq]));
  return ids.every(id => {
    return (done[id] ?? -1) >= state[id];
  });
}
/**
 * Build a target URL by appending a path to a base URL, stripping any trailing
 * slash and clearing query/hash.
 * @param {string} url - Base URL.
 * @param {string} path - Path to append (e.g. "/sync/history").
 * @returns {URL} The combined URL.
 */
function route(url, path) {
  const next = new URL(url);
  next.pathname = `${next.pathname.replace(/\/$/, "")}${path}`;
  next.search = "";
  next.hash = "";
  return next;
}
export * as Workspace from "./workspace.js";