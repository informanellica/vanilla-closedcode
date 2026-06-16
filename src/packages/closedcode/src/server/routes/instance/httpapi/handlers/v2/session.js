/** @file HTTP API handlers for the "v2.session" group: paginated session listing (with filter-preserving cursors) plus prompt, compact, wait, and context endpoints. */
import { WorkspaceID } from "#control-plane/schema.js";
import { SessionV2 } from "#v2/session.js";
import { Effect, Schema } from "effect";
import { HttpApiBuilder, HttpApiError, HttpApiSchema } from "effect/unstable/httpapi";
import { InstanceHttpApi } from "../../api.js";
/**
 * Default number of sessions returned per page when no limit is supplied.
 * @type {number}
 */
const DefaultSessionsLimit = 50;
/**
 * Schema describing the decoded session pagination cursor, including the active list filters so paging keeps them stable.
 * @type {Object}
 */
const SessionCursor = Schema.Struct({
  id: SessionV2.Info.fields.id,
  time: Schema.Finite,
  order: Schema.Union([Schema.Literal("asc"), Schema.Literal("desc")]),
  direction: Schema.Union([Schema.Literal("previous"), Schema.Literal("next")]),
  directory: Schema.String.pipe(Schema.optional),
  path: Schema.String.pipe(Schema.optional),
  workspaceID: WorkspaceID.pipe(Schema.optional),
  roots: Schema.Boolean.pipe(Schema.optional),
  start: Schema.Finite.pipe(Schema.optional),
  search: Schema.String.pipe(Schema.optional)
});
const decodeCursor = Schema.decodeUnknownSync(SessionCursor);
/**
 * Codec for the session pagination cursor: a base64url-encoded JSON blob carrying a session id, its creation
 * time, the sort order, the paging direction, and the active list filters (so subsequent pages keep them).
 * @type {Object}
 */
const sessionCursor = {
  /**
   * Encodes a session, paging metadata, and the active filters into an opaque base64url cursor string.
   * @param {Object} session - The session to anchor the cursor on (uses id and time.created).
   * @param {string} order - The sort order ("asc" or "desc").
   * @param {string} direction - The paging direction ("previous" or "next").
   * @param {Object} filters - The active list filters to persist across pages (directory, path, workspaceID, etc.).
   * @returns {string} The base64url-encoded cursor.
   */
  encode(session, order, direction, filters) {
    return Buffer.from(JSON.stringify({
      id: session.id,
      time: session.time.created,
      order,
      direction,
      ...filters
    })).toString("base64url");
  },
  /**
   * Decodes a base64url cursor string back into its validated cursor object.
   * @param {string} input - The base64url cursor string to decode.
   * @returns {Object} The decoded cursor including paging metadata and filters.
   */
  decode(input) {
    return decodeCursor(JSON.parse(Buffer.from(input, "base64url").toString("utf8")));
  }
};
/**
 * Builds the "v2.session" HTTP API handler group: sessions (paginated list), prompt, compact, wait, and context endpoints.
 * @type {Object}
 */
export const sessionHandlers = HttpApiBuilder.group(InstanceHttpApi, "v2.session", handlers => Effect.gen(function* () {
  const session = yield* SessionV2.Service;
  // Handler for "sessions": decodes the optional cursor (BadRequest on failure), takes filters from the cursor
  // when present (else from the query), fetches a page, and returns items with previous/next cursors that carry
  // the same filters forward.
  return handlers.handle("sessions", Effect.fn(function* (ctx) {
    const decoded = yield* Effect.try({
      try: () => ctx.query.cursor ? sessionCursor.decode(ctx.query.cursor) : undefined,
      catch: () => new HttpApiError.BadRequest({})
    });
    const order = decoded?.order ?? ctx.query.order ?? "desc";
    const filters = decoded ?? {
      directory: ctx.query.directory,
      path: ctx.query.path,
      workspaceID: ctx.query.workspace ? WorkspaceID.make(ctx.query.workspace) : undefined,
      roots: ctx.query.roots,
      start: ctx.query.start,
      search: ctx.query.search
    };
    const sessions = yield* session.list({
      limit: ctx.query.limit ?? DefaultSessionsLimit,
      order,
      directory: filters.directory,
      path: filters.path,
      workspaceID: filters.workspaceID,
      roots: filters.roots,
      start: filters.start,
      search: filters.search,
      cursor: decoded ? {
        id: decoded.id,
        time: decoded.time,
        direction: decoded.direction
      } : undefined
    });
    const first = sessions[0];
    const last = sessions.at(-1);
    return {
      items: sessions,
      cursor: {
        previous: first ? sessionCursor.encode(first, order, "previous", filters) : undefined,
        next: last ? sessionCursor.encode(last, order, "next", filters) : undefined
      }
    };
  // Handler for "prompt": sends a prompt to the session, defaulting delivery to SessionV2.DefaultDelivery.
  })).handle("prompt", Effect.fn(function* (ctx) {
    return yield* session.prompt({
      sessionID: ctx.params.sessionID,
      prompt: ctx.payload.prompt,
      delivery: ctx.payload.delivery ?? SessionV2.DefaultDelivery
    });
  // Handler for "compact": compacts the session and responds with No Content.
  })).handle("compact", Effect.fn(function* (ctx) {
    yield* session.compact(ctx.params.sessionID);
    return HttpApiSchema.NoContent.make();
  // Handler for "wait": blocks until the session is idle, then responds with No Content.
  })).handle("wait", Effect.fn(function* (ctx) {
    yield* session.wait(ctx.params.sessionID);
    return HttpApiSchema.NoContent.make();
  // Handler for "context": returns the session's current context.
  })).handle("context", Effect.fn(function* (ctx) {
    return yield* session.context(ctx.params.sessionID);
  }));
}));