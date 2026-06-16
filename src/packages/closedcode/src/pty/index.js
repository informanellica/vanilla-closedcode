/**
 * @file PTY service: spawns and manages pseudo-terminal sessions, streams their
 * output to WebSocket subscribers with a replay buffer, and publishes
 * created/updated/exited/deleted events on the bus.
 */
import { BusEvent } from "#bus/bus-event.js";
import { Bus } from "#bus/index.js";
import { Config } from "#config/config.js";
import { InstanceState } from "#effect/instance-state.js";
import { EffectBridge } from "#effect/bridge.js";
import { lazy } from "core/util/lazy";
import { Plugin } from "#plugin/index.js";
import { Shell } from "#shell/shell.js";
import * as Log from "core/util/log";
import { PtyID } from "./schema.js";
import { Effect, Layer, Context, Schema } from "effect";
import { zod } from "#util/effect-zod.js";
import { NonNegativeInt, PositiveInt, withStatics } from "#util/schema.js";
const log = Log.create({
  service: "pty"
});
/** Maximum bytes retained in a session's replay buffer (2 MiB). */
const BUFFER_LIMIT = 1024 * 1024 * 2;
/** Chunk size used when replaying buffered output to a newly-connected client (64 KiB). */
const BUFFER_CHUNK = 64 * 1024;
const encoder = new TextEncoder();
/**
 * Resolve the stable subscriber key for a WebSocket, preferring its `.data`
 * object (used to dedupe/track subscribers) and falling back to the socket itself.
 * @param {Object} ws - The WebSocket-like object.
 * @returns {Object} The subscriber key.
 */
const sock = ws => ws.data && typeof ws.data === "object" ? ws.data : ws;
/**
 * Build a WebSocket control frame carrying the current output cursor.
 * The frame is a 0x00 prefix byte followed by UTF-8 JSON `{cursor}`.
 * @param {number} cursor - The current absolute output byte cursor.
 * @returns {Uint8Array} The encoded control frame.
 */
// WebSocket control frame: 0x00 + UTF-8 JSON.
const meta = cursor => {
  const json = JSON.stringify({
    cursor
  });
  const bytes = encoder.encode(json);
  const out = new Uint8Array(bytes.length + 1);
  out[0] = 0;
  out.set(bytes, 1);
  return out;
};
/** Lazily-imported, platform-specific PTY backend (provides `spawn`). */
const pty = lazy(() => import("#pty"));
/**
 * Schema describing a PTY session's public info (id, title, command, args,
 * cwd, status, pid). Carries a `zod` static for validation.
 * @type {Object}
 */
export const Info = Schema.Struct({
  id: PtyID,
  title: Schema.String,
  command: Schema.String,
  args: Schema.Array(Schema.String),
  cwd: Schema.String,
  status: Schema.Literals(["running", "exited"]),
  pid: PositiveInt
}).annotate({
  identifier: "Pty"
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
/**
 * Schema for the input accepted by `create`: optional command, args, cwd,
 * title, and environment overrides. Carries a `zod` static.
 * @type {Object}
 */
export const CreateInput = Schema.Struct({
  command: Schema.optional(Schema.String),
  args: Schema.optional(Schema.Array(Schema.String)),
  cwd: Schema.optional(Schema.String),
  title: Schema.optional(Schema.String),
  env: Schema.optional(Schema.Record(Schema.String, Schema.String))
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
/**
 * Schema for the input accepted by `update`: optional new title and/or terminal
 * size (rows/cols). Carries a `zod` static.
 * @type {Object}
 */
export const UpdateInput = Schema.Struct({
  title: Schema.optional(Schema.String),
  size: Schema.optional(Schema.Struct({
    rows: PositiveInt,
    cols: PositiveInt
  }))
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
/**
 * Bus event definitions for the PTY session lifecycle: Created, Updated,
 * Exited, Deleted.
 * @type {Object}
 */
export const Event = {
  Created: BusEvent.define("pty.created", Schema.Struct({
    info: Info
  })),
  Updated: BusEvent.define("pty.updated", Schema.Struct({
    info: Info
  })),
  Exited: BusEvent.define("pty.exited", Schema.Struct({
    id: PtyID,
    exitCode: NonNegativeInt
  })),
  Deleted: BusEvent.define("pty.deleted", Schema.Struct({
    id: PtyID
  }))
};
/**
 * Effect Context tag for the PTY service.
 */
export class Service extends Context.Service()("@closedcode/Pty") {}
/**
 * Layer that builds the PTY service: keeps per-instance sessions, exposes
 * list/get/create/update/remove/resize/write/connect, and tears down all
 * sessions on finalization.
 * @type {Object}
 */
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const config = yield* Config.Service;
  const bus = yield* Bus.Service;
  const plugin = yield* Plugin.Service;
  /**
   * Kill a session's process and close/clear all of its WebSocket subscribers.
   * @param {Object} session - The session record to tear down.
   * @returns {void}
   */
  function teardown(session) {
    try {
      session.process.kill();
    } catch {}
    for (const [sub, ws] of session.subscribers.entries()) {
      try {
        if (sock(ws) === sub) ws.close();
      } catch {}
    }
    session.subscribers.clear();
  }
  /**
   * Per-instance PTY state: the working directory and the map of active
   * sessions. Registers a finalizer that tears down every session on shutdown.
   */
  const state = yield* InstanceState.make(Effect.fn("Pty.state")(function* (ctx) {
    const state = {
      dir: ctx.directory,
      sessions: new Map()
    };
    yield* Effect.addFinalizer(() => Effect.sync(() => {
      for (const session of state.sessions.values()) {
        teardown(session);
      }
      state.sessions.clear();
    }));
    return state;
  }));
  /**
   * Remove a session: delete it from state, tear it down, and publish Deleted.
   * No-ops if the session does not exist.
   * @param {PtyID} id - The session id to remove.
   * @returns {Effect} An Effect that completes the removal.
   */
  const remove = Effect.fn("Pty.remove")(function* (id) {
    const s = yield* InstanceState.get(state);
    const session = s.sessions.get(id);
    if (!session) return;
    s.sessions.delete(id);
    log.info("removing session", {
      id
    });
    teardown(session);
    yield* bus.publish(Event.Deleted, {
      id: session.info.id
    });
  });
  /**
   * List the info objects of all active sessions.
   * @returns {Effect} An Effect resolving to an array of session info objects.
   */
  const list = Effect.fn("Pty.list")(function* () {
    const s = yield* InstanceState.get(state);
    return Array.from(s.sessions.values()).map(session => session.info);
  });
  /**
   * Get a single session's info by id.
   * @param {PtyID} id - The session id.
   * @returns {Effect} An Effect resolving to the info object, or undefined if not found.
   */
  const get = Effect.fn("Pty.get")(function* (id) {
    const s = yield* InstanceState.get(state);
    return s.sessions.get(id)?.info;
  });
  /**
   * Create and spawn a new PTY session.
   * Resolves the command/args/cwd/env (applying shell preferences, the
   * `shell.env` plugin hook, and platform UTF-8 locale on win32), spawns the
   * process, wires up output buffering + subscriber fan-out and exit handling,
   * and publishes the Created event.
   * @param {Object} input - The CreateInput (optional command, args, cwd, title, env).
   * @returns {Effect} An Effect resolving to the new session's info object.
   */
  const create = Effect.fn("Pty.create")(function* (input) {
    const s = yield* InstanceState.get(state);
    const bridge = yield* EffectBridge.make();
    const cfg = yield* config.get();
    const id = PtyID.ascending();
    const command = input.command || Shell.preferred(cfg.shell);
    const args = input.args || [];
    if (Shell.login(command)) {
      args.push("-l");
    }
    const cwd = input.cwd || s.dir;
    const shell = yield* plugin.trigger("shell.env", {
      cwd
    }, {
      env: {}
    });
    const env = {
      ...process.env,
      ...input.env,
      ...shell.env,
      TERM: "xterm-256color",
      CLOSEDCODE_TERMINAL: "1"
    };
    if (process.platform === "win32") {
      env.LC_ALL = "C.UTF-8";
      env.LC_CTYPE = "C.UTF-8";
      env.LANG = "C.UTF-8";
    }
    log.info("creating session", {
      id,
      cmd: command,
      args,
      cwd
    });
    const {
      spawn
    } = yield* Effect.promise(() => pty());
    const proc = yield* Effect.sync(() => spawn(command, args, {
      name: "xterm-256color",
      cwd,
      env
    }));
    const info = {
      id,
      title: input.title || `Terminal ${id.slice(-4)}`,
      command,
      args,
      cwd,
      status: "running",
      pid: proc.pid
    };
    const session = {
      info,
      process: proc,
      buffer: "",
      bufferCursor: 0,
      cursor: 0,
      subscribers: new Map()
    };
    s.sessions.set(id, session);
    // Output handler: advance the cursor, fan the chunk out to live subscribers
    // (pruning dead/mismatched sockets), and append to the replay buffer while
    // trimming it from the front once it exceeds BUFFER_LIMIT.
    proc.onData(chunk => {
      session.cursor += chunk.length;
      for (const [key, ws] of session.subscribers.entries()) {
        if (ws.readyState !== 1) {
          session.subscribers.delete(key);
          continue;
        }
        if (sock(ws) !== key) {
          session.subscribers.delete(key);
          continue;
        }
        try {
          ws.send(chunk);
        } catch {
          session.subscribers.delete(key);
        }
      }
      session.buffer += chunk;
      if (session.buffer.length <= BUFFER_LIMIT) return;
      const excess = session.buffer.length - BUFFER_LIMIT;
      session.buffer = session.buffer.slice(excess);
      session.bufferCursor += excess;
    });
    // Exit handler: mark the session exited once, publish Exited, and schedule
    // its removal.
    proc.onExit(({
      exitCode
    }) => {
      if (session.info.status === "exited") return;
      log.info("session exited", {
        id,
        exitCode
      });
      session.info.status = "exited";
      bridge.fork(bus.publish(Event.Exited, {
        id,
        exitCode
      }));
      bridge.fork(remove(id));
    });
    yield* bus.publish(Event.Created, {
      info
    });
    return info;
  });
  /**
   * Update a session's title and/or terminal size, then publish Updated.
   * No-ops if the session does not exist.
   * @param {PtyID} id - The session id.
   * @param {Object} input - The UpdateInput (optional title and/or size {rows, cols}).
   * @returns {Effect} An Effect resolving to the updated session info, or undefined.
   */
  const update = Effect.fn("Pty.update")(function* (id, input) {
    const s = yield* InstanceState.get(state);
    const session = s.sessions.get(id);
    if (!session) return;
    if (input.title) {
      session.info.title = input.title;
    }
    if (input.size) {
      session.process.resize(input.size.cols, input.size.rows);
    }
    yield* bus.publish(Event.Updated, {
      info: session.info
    });
    return session.info;
  });
  /**
   * Resize a running session's terminal. No-ops if missing or already exited.
   * @param {PtyID} id - The session id.
   * @param {number} cols - New column count.
   * @param {number} rows - New row count.
   * @returns {Effect} An Effect that performs the resize.
   */
  const resize = Effect.fn("Pty.resize")(function* (id, cols, rows) {
    const s = yield* InstanceState.get(state);
    const session = s.sessions.get(id);
    if (session && session.info.status === "running") {
      session.process.resize(cols, rows);
    }
  });
  /**
   * Write input data to a running session's stdin. No-ops if missing or exited.
   * @param {PtyID} id - The session id.
   * @param {string} data - The data to write.
   * @returns {Effect} An Effect that performs the write.
   */
  const write = Effect.fn("Pty.write")(function* (id, data) {
    const s = yield* InstanceState.get(state);
    const session = s.sessions.get(id);
    if (session && session.info.status === "running") {
      session.process.write(data);
    }
  });
  /**
   * Attach a WebSocket client to a session: register it as a subscriber, replay
   * buffered output from the requested cursor (or just live output / from the
   * tail), send a cursor control frame, and return live message/close handlers.
   * Closes the socket if the session does not exist or a send fails.
   * @param {PtyID} id - The session id to connect to.
   * @param {Object} ws - The WebSocket-like connection.
   * @param {number} cursor - Desired starting output cursor: -1 = live only (from tail), a safe integer = replay from that absolute offset, otherwise from the beginning of the buffer.
   * @returns {Effect} An Effect resolving to a handler object with `onMessage` and `onClose`, or undefined if the session was missing.
   */
  const connect = Effect.fn("Pty.connect")(function* (id, ws, cursor) {
    const s = yield* InstanceState.get(state);
    const session = s.sessions.get(id);
    if (!session) {
      ws.close();
      return;
    }
    log.info("client connected to session", {
      id
    });
    const sub = sock(ws);
    session.subscribers.delete(sub);
    session.subscribers.set(sub, ws);
    const cleanup = () => {
      session.subscribers.delete(sub);
    };
    const start = session.bufferCursor;
    const end = session.cursor;
    const from = cursor === -1 ? end : typeof cursor === "number" && Number.isSafeInteger(cursor) ? Math.max(0, cursor) : 0;
    const data = (() => {
      if (!session.buffer) return "";
      if (from >= end) return "";
      const offset = Math.max(0, from - start);
      if (offset >= session.buffer.length) return "";
      return session.buffer.slice(offset);
    })();
    if (data) {
      try {
        for (let i = 0; i < data.length; i += BUFFER_CHUNK) {
          ws.send(data.slice(i, i + BUFFER_CHUNK));
        }
      } catch {
        cleanup();
        ws.close();
        return;
      }
    }
    try {
      ws.send(meta(end));
    } catch {
      cleanup();
      ws.close();
      return;
    }
    return {
      onMessage: message => {
        session.process.write(typeof message === "string" ? message : new TextDecoder().decode(message));
      },
      onClose: () => {
        log.info("client disconnected from session", {
          id
        });
        cleanup();
      }
    };
  });
  return Service.of({
    list,
    get,
    create,
    update,
    remove,
    resize,
    write,
    connect
  });
}));
/**
 * The PTY service layer with its Bus, Plugin, and Config dependencies provided.
 * @type {Object}
 */
export const defaultLayer = layer.pipe(Layer.provide(Bus.layer), Layer.provide(Plugin.defaultLayer), Layer.provide(Config.defaultLayer));
export * as Pty from "./index.js";