/** @file HTTP API handlers for the "pty" group: list shells, CRUD pseudo-terminals, and a WebSocket route that streams PTY output and forwards input. */
import { Pty } from "#pty/index.js";
import { handlePtyInput } from "#pty/input.js";
import { Shell } from "#shell/shell.js";
import { Effect } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi";
import * as Socket from "effect/unstable/socket/Socket";
import { InstanceHttpApi } from "../api.js";
import { CursorQuery, Params, PtyPaths } from "../groups/pty.js";
/**
 * Builds the "pty" HTTP API handler group: shells/list/create/get/update/remove endpoints backed by the Pty service.
 * @type {Object}
 */
export const ptyHandlers = HttpApiBuilder.group(InstanceHttpApi, "pty", handlers => Effect.gen(function* () {
  const pty = yield* Pty.Service;
  /**
   * Lists the shells available on the host machine.
   * @returns {Effect} Effect resolving to the array of discovered shells.
   */
  const shells = Effect.fn("PtyHttpApi.shells")(function* () {
    return yield* Effect.promise(() => Shell.list());
  });
  /**
   * Lists all active pseudo-terminals.
   * @returns {Effect} Effect resolving to the list of PTY info records.
   */
  const list = Effect.fn("PtyHttpApi.list")(function* () {
    return yield* pty.list();
  });
  /**
   * Creates a new pseudo-terminal, copying the optional args/env from the payload into mutable structures.
   * @param {Object} ctx - Request context whose payload describes the PTY (command, args, env, etc.).
   * @returns {Effect} Effect resolving to the created PTY info record.
   */
  const create = Effect.fn("PtyHttpApi.create")(function* (ctx) {
    return yield* pty.create({
      ...ctx.payload,
      args: ctx.payload.args ? [...ctx.payload.args] : undefined,
      env: ctx.payload.env ? {
        ...ctx.payload.env
      } : undefined
    });
  });
  /**
   * Fetches a single pseudo-terminal by id, failing with NotFound when it does not exist.
   * @param {Object} ctx - Request context with params.ptyID.
   * @returns {Effect} Effect resolving to the PTY info record, or failing with HttpApiError.NotFound.
   */
  const get = Effect.fn("PtyHttpApi.get")(function* (ctx) {
    const info = yield* pty.get(ctx.params.ptyID);
    if (!info) return yield* new HttpApiError.NotFound({});
    return info;
  });
  /**
   * Updates a pseudo-terminal (e.g. resize), copying the optional size from the payload, failing with NotFound when absent.
   * @param {Object} ctx - Request context with params.ptyID and payload (optionally size).
   * @returns {Effect} Effect resolving to the updated PTY info record, or failing with HttpApiError.NotFound.
   */
  const update = Effect.fn("PtyHttpApi.update")(function* (ctx) {
    const info = yield* pty.update(ctx.params.ptyID, {
      ...ctx.payload,
      size: ctx.payload.size ? {
        ...ctx.payload.size
      } : undefined
    });
    if (!info) return yield* new HttpApiError.NotFound({});
    return info;
  });
  /**
   * Removes (terminates) a pseudo-terminal by id.
   * @param {Object} ctx - Request context with params.ptyID.
   * @returns {Effect} Effect resolving to true once removed.
   */
  const remove = Effect.fn("PtyHttpApi.remove")(function* (ctx) {
    yield* pty.remove(ctx.params.ptyID);
    return true;
  });
  return handlers.handle("shells", shells).handle("list", list).handle("create", create).handle("get", get).handle("update", update).handle("remove", remove);
}));
/**
 * Registers the GET WebSocket route that connects a client to a PTY: it upgrades the request to a socket,
 * adapts the socket into a minimal WebSocket-like object so the Pty service can stream output, replays from
 * an optional cursor, and forwards incoming socket messages as PTY input until the socket closes.
 * @type {Object}
 */
export const ptyConnectRoute = HttpRouter.use(router => Effect.gen(function* () {
  const pty = yield* Pty.Service;
  yield* router.add("GET", PtyPaths.connect, Effect.gen(function* () {
    const params = yield* HttpRouter.schemaPathParams(Params);
    if (!(yield* pty.get(params.ptyID))) return HttpServerResponse.empty({
      status: 404
    });
    const query = yield* HttpServerRequest.schemaSearchParams(CursorQuery);
    const parsedCursor = query.cursor === undefined ? undefined : Number(query.cursor);
    const cursor = parsedCursor !== undefined && Number.isSafeInteger(parsedCursor) && parsedCursor >= -1 ? parsedCursor : undefined;
    const socket = yield* Effect.orDie((yield* HttpServerRequest.HttpServerRequest).upgrade);
    const write = yield* socket.writer;
    const services = yield* Effect.context();
    /**
     * Runs a write Effect in the captured service context, swallowing any failure (fire-and-forget).
     * @param {Effect} effect - The socket write Effect to run.
     * @returns {void}
     */
    const writeScoped = effect => {
      Effect.runForkWith(services)(effect.pipe(Effect.catch(() => Effect.void)));
    };
    let closed = false;
    /**
     * Minimal WebSocket-like adapter over the upgraded server socket so the Pty service can push output.
     * readyState reports 1 (OPEN) until closed, then 3 (CLOSED); send forwards data (coercing ArrayBuffer
     * to Uint8Array) and close emits a Socket.CloseEvent. Both no-op once closed.
     * @type {Object}
     */
    const adapter = {
      get readyState() {
        return closed ? 3 : 1;
      },
      send: data => {
        if (closed) return;
        writeScoped(write(data instanceof ArrayBuffer ? new Uint8Array(data) : data));
      },
      close: (code, reason) => {
        if (closed) return;
        closed = true;
        writeScoped(write(new Socket.CloseEvent(code, reason)));
      }
    };
    const handler = yield* pty.connect(params.ptyID, adapter, cursor);
    if (!handler) return HttpServerResponse.empty();
    yield* socket.runRaw(message => handlePtyInput(handler, message)).pipe(Effect.catchReason("SocketError", "SocketCloseError", () => Effect.void), Effect.ensuring(Effect.sync(() => {
      closed = true;
      handler.onClose();
    })), Effect.orDie);
    return HttpServerResponse.empty();
  }));
}));