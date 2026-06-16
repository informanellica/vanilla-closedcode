/** @file HTTP API handlers for the "v2.message" group: paginated message listing with base64url cursor encode/decode. */
import { SessionMessage } from "#v2/session-message.js";
import { SessionV2 } from "#v2/session.js";
import { Effect, Schema } from "effect";
import * as DateTime from "effect/DateTime";
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi";
import { InstanceHttpApi } from "../../api.js";
/**
 * Default number of messages returned per page when no limit is supplied.
 * @type {number}
 */
const DefaultMessagesLimit = 50;
/**
 * Schema describing the decoded pagination cursor payload (message id, time, order, and direction).
 * @type {Object}
 */
const Cursor = Schema.Struct({
  id: SessionMessage.ID,
  time: Schema.Finite,
  order: Schema.Union([Schema.Literal("asc"), Schema.Literal("desc")]),
  direction: Schema.Union([Schema.Literal("previous"), Schema.Literal("next")])
});
const decodeCursor = Schema.decodeUnknownSync(Cursor);
/**
 * Codec for the message pagination cursor: a base64url-encoded JSON blob carrying a message id, its creation
 * time (epoch millis), the sort order, and the paging direction.
 * @type {Object}
 */
const cursor = {
  /**
   * Encodes a message and paging metadata into an opaque base64url cursor string.
   * @param {Object} message - The message to anchor the cursor on (uses id and time.created).
   * @param {string} order - The sort order ("asc" or "desc").
   * @param {string} direction - The paging direction ("previous" or "next").
   * @returns {string} The base64url-encoded cursor.
   */
  encode(message, order, direction) {
    return Buffer.from(JSON.stringify({
      id: message.id,
      time: DateTime.toEpochMillis(message.time.created),
      order,
      direction
    })).toString("base64url");
  },
  /**
   * Decodes a base64url cursor string back into its validated cursor object.
   * @param {string} input - The base64url cursor string to decode.
   * @returns {Object} The decoded cursor {id, time, order, direction}.
   */
  decode(input) {
    return decodeCursor(JSON.parse(Buffer.from(input, "base64url").toString("utf8")));
  }
};
/**
 * Builds the "v2.message" HTTP API handler group: a single "messages" endpoint that returns a page of messages
 * plus previous/next cursors derived from the first/last items.
 * @type {Object}
 */
export const messageHandlers = HttpApiBuilder.group(InstanceHttpApi, "v2.message", handlers => Effect.gen(function* () {
  const session = yield* SessionV2.Service;
  // Handler for "messages": decodes the optional cursor (BadRequest on failure), resolves sort order from the
  // cursor or query, fetches a page from the session service, and returns items with previous/next cursors.
  return handlers.handle("messages", Effect.fn(function* (ctx) {
    const decoded = yield* Effect.try({
      try: () => ctx.query.cursor ? cursor.decode(ctx.query.cursor) : undefined,
      catch: () => new HttpApiError.BadRequest({})
    });
    const order = decoded?.order ?? ctx.query.order ?? "desc";
    const messages = yield* session.messages({
      sessionID: ctx.params.sessionID,
      limit: ctx.query.limit ?? DefaultMessagesLimit,
      order,
      cursor: decoded ? {
        id: decoded.id,
        time: decoded.time,
        direction: decoded.direction
      } : undefined
    });
    const first = messages[0];
    const last = messages.at(-1);
    return {
      items: messages,
      cursor: {
        previous: first ? cursor.encode(first, order, "previous") : undefined,
        next: last ? cursor.encode(last, order, "next") : undefined
      }
    };
  }));
}));