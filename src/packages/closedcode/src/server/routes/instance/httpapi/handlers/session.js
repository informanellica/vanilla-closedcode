/** @file HTTP API handlers for the "session" group: session CRUD, message/part listing and editing, prompting (streamed and async), commands, sharing, revert, compaction/summarize, and permission responses. */
import * as InstanceState from "#effect/instance-state.js";
import { InstanceRef, WorkspaceRef } from "#effect/instance-ref.js";
import { Agent } from "#agent/agent.js";
import { Bus } from "#bus/index.js";
import { Command } from "#command/index.js";
import { Permission } from "#permission/index.js";
import { SessionShare } from "#share/session.js";
import { Session } from "#session/session.js";
import { SessionCompaction } from "#session/compaction.js";
import { MessageV2 } from "#session/message-v2.js";
import { SessionPrompt } from "#session/prompt.js";
import { SessionRevert } from "#session/revert.js";
import { SessionRunState } from "#session/run-state.js";
import { SessionStatus } from "#session/status.js";
import { SessionSummary } from "#session/summary.js";
import { Todo } from "#session/todo.js";
import { NotFoundError } from "#storage/storage.js";
import { NamedError } from "core/util/error";
import { Cause, Effect, Option, Schema, Scope } from "effect";
import * as Stream from "effect/Stream";
import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http";
import { HttpApiBuilder, HttpApiError, HttpApiSchema } from "effect/unstable/httpapi";
import { InstanceHttpApi } from "../api.js";
/**
 * Converts a storage NotFoundError (raised as either a typed failure or a defect) into an HttpApiError.NotFound,
 * re-dying on any other defect.
 * @param {Effect} self - The Effect whose NotFoundError should be translated.
 * @returns {Effect} The Effect with NotFound errors/defects mapped to HttpApiError.NotFound.
 */
const mapNotFound = self => self.pipe(Effect.catchIf(NotFoundError.isInstance, () => Effect.fail(new HttpApiError.NotFound({}))), Effect.catchDefect(error => NotFoundError.isInstance(error) ? Effect.fail(new HttpApiError.NotFound({})) : Effect.die(error)));
/**
 * Builds the "session" HTTP API handler group: the full set of session lifecycle, message, prompt, share,
 * revert, permission, and part endpoints backed by the session-related services.
 * @type {Object}
 */
export const sessionHandlers = HttpApiBuilder.group(InstanceHttpApi, "session", handlers => Effect.gen(function* () {
  const session = yield* Session.Service;
  const shareSvc = yield* SessionShare.Service;
  const promptSvc = yield* SessionPrompt.Service;
  const revertSvc = yield* SessionRevert.Service;
  const compactSvc = yield* SessionCompaction.Service;
  const runState = yield* SessionRunState.Service;
  const agentSvc = yield* Agent.Service;
  const permissionSvc = yield* Permission.Service;
  const statusSvc = yield* SessionStatus.Service;
  const todoSvc = yield* Todo.Service;
  const summary = yield* SessionSummary.Service;
  const bus = yield* Bus.Service;
  const scope = yield* Scope.Scope;
  /**
   * Lists sessions matching the query filters; when scope is "project" the directory filter is dropped.
   * @param {Object} ctx - Request context whose query holds scope/directory/path/roots/start/search/limit.
   * @returns {Effect} Effect resolving to the matching sessions.
   */
  const list = Effect.fn("SessionHttpApi.list")(function* (ctx) {
    return yield* session.list({
      directory: ctx.query.scope === "project" ? undefined : ctx.query.directory,
      scope: ctx.query.scope,
      path: ctx.query.path,
      roots: ctx.query.roots,
      start: ctx.query.start,
      search: ctx.query.search,
      limit: ctx.query.limit
    });
  });
  /**
   * Returns the current run status of all sessions as a sessionID-keyed object.
   * @returns {Effect} Effect resolving to an object mapping sessionID to its status.
   */
  const status = Effect.fn("SessionHttpApi.status")(function* () {
    return Object.fromEntries(yield* statusSvc.list());
  });
  /**
   * Fetches a single session by id, mapping missing sessions to NotFound.
   * @param {Object} ctx - Request context with params.sessionID.
   * @returns {Effect} Effect resolving to the session, or failing with HttpApiError.NotFound.
   */
  const get = Effect.fn("SessionHttpApi.get")(function* (ctx) {
    return yield* mapNotFound(session.get(ctx.params.sessionID));
  });
  /**
   * Lists the child sessions of the given session.
   * @param {Object} ctx - Request context with params.sessionID.
   * @returns {Effect} Effect resolving to the array of child sessions.
   */
  const children = Effect.fn("SessionHttpApi.children")(function* (ctx) {
    return yield* session.children(ctx.params.sessionID);
  });
  /**
   * Returns the todo list associated with the given session.
   * @param {Object} ctx - Request context with params.sessionID.
   * @returns {Effect} Effect resolving to the session's todos.
   */
  const todo = Effect.fn("SessionHttpApi.todo")(function* (ctx) {
    return yield* todoSvc.get(ctx.params.sessionID);
  });
  /**
   * Returns the aggregated diff/summary for a session, optionally scoped to a specific message.
   * @param {Object} ctx - Request context with params.sessionID and optional query.messageID.
   * @returns {Effect} Effect resolving to the diff summary.
   */
  const diff = Effect.fn("SessionHttpApi.diff")(function* (ctx) {
    return yield* summary.diff({
      sessionID: ctx.params.sessionID,
      messageID: ctx.query.messageID
    });
  });
  /**
   * Returns messages for a session. With no/zero limit it returns all messages; with a limit it returns a page
   * and, when more remain, attaches Link and X-Next-Cursor headers built from the real request origin. A "before"
   * cursor requires a limit and must decode, otherwise BadRequest. Missing sessions map to NotFound.
   * @param {Object} ctx - Request context with params.sessionID and query (limit, before).
   * @returns {Effect} Effect resolving to the messages array or a JSON response with pagination headers.
   */
  const messages = Effect.fn("SessionHttpApi.messages")(function* (ctx) {
    return yield* mapNotFound(Effect.gen(function* () {
      if (ctx.query.before && ctx.query.limit === undefined) return yield* new HttpApiError.BadRequest({});
      if (ctx.query.before) {
        const before = ctx.query.before;
        yield* Effect.try({
          try: () => MessageV2.cursor.decode(before),
          catch: () => new HttpApiError.BadRequest({})
        });
      }
      if (ctx.query.limit === undefined || ctx.query.limit === 0) {
        yield* session.get(ctx.params.sessionID);
        return yield* session.messages({
          sessionID: ctx.params.sessionID
        });
      }
      yield* session.get(ctx.params.sessionID);
      const page = yield* Effect.promise(() => MessageV2.page({
        sessionID: ctx.params.sessionID,
        limit: ctx.query.limit,
        before: ctx.query.before
      }));
      if (!page.cursor) return page.items;
      const request = yield* HttpServerRequest.HttpServerRequest;
      // toURL() honors the Host + x-forwarded-proto headers, so the Link
      // header echoes the real origin instead of a hard-coded localhost.
      const url = Option.getOrElse(HttpServerRequest.toURL(request), () => new URL(request.url, "http://localhost"));
      url.searchParams.set("limit", ctx.query.limit.toString());
      url.searchParams.set("before", page.cursor);
      return HttpServerResponse.jsonUnsafe(page.items, {
        headers: {
          "Access-Control-Expose-Headers": "Link, X-Next-Cursor",
          Link: `<${url.toString()}>; rel="next"`,
          "X-Next-Cursor": page.cursor
        }
      });
    }));
  });
  /**
   * Fetches a single message within a session, mapping missing messages to NotFound.
   * @param {Object} ctx - Request context with params.sessionID and params.messageID.
   * @returns {Effect} Effect resolving to the message, or failing with HttpApiError.NotFound.
   */
  const message = Effect.fn("SessionHttpApi.message")(function* (ctx) {
    return yield* mapNotFound(Effect.promise(() => MessageV2.get({
      sessionID: ctx.params.sessionID,
      messageID: ctx.params.messageID
    })));
  });
  /**
   * Creates a new session from the decoded payload.
   * @param {Object} ctx - Request context whose payload is the session create input.
   * @returns {Effect} Effect resolving to the created session.
   */
  const create = Effect.fn("SessionHttpApi.create")(function* (ctx) {
    return yield* shareSvc.create(ctx.payload);
  });
  /**
   * Raw-body create handler: treats an empty body as no payload, otherwise parses JSON and validates it against
   * Session.CreateInput (BadRequest on malformed JSON or schema mismatch) before delegating to create.
   * @param {Object} ctx - Request context exposing request.text for the raw body.
   * @returns {Effect} Effect resolving to the created session, or failing with HttpApiError.BadRequest.
   */
  const createRaw = Effect.fn("SessionHttpApi.createRaw")(function* (ctx) {
    const body = yield* Effect.orDie(ctx.request.text);
    if (body.trim().length === 0) return yield* create({});
    const json = yield* Effect.try({
      try: () => JSON.parse(body),
      catch: () => new HttpApiError.BadRequest({})
    });
    const payload = yield* Schema.decodeUnknownEffect(Session.CreateInput)(json).pipe(Effect.mapError(() => new HttpApiError.BadRequest({})));
    return yield* create({
      payload
    });
  });
  /**
   * Deletes a session by id.
   * @param {Object} ctx - Request context with params.sessionID.
   * @returns {Effect} Effect resolving to true once removed.
   */
  const remove = Effect.fn("SessionHttpApi.remove")(function* (ctx) {
    yield* session.remove(ctx.params.sessionID);
    return true;
  });
  /**
   * Updates a session's title, permissions (merged with existing), and/or archived time as present in the payload,
   * then returns the refreshed session.
   * @param {Object} ctx - Request context with params.sessionID and payload (title, permission, time.archived).
   * @returns {Effect} Effect resolving to the updated session.
   */
  const update = Effect.fn("SessionHttpApi.update")(function* (ctx) {
    const current = yield* session.get(ctx.params.sessionID);
    if (ctx.payload.title !== undefined) {
      yield* session.setTitle({
        sessionID: ctx.params.sessionID,
        title: ctx.payload.title
      });
    }
    if (ctx.payload.permission !== undefined) {
      yield* session.setPermission({
        sessionID: ctx.params.sessionID,
        permission: Permission.merge(current.permission ?? [], ctx.payload.permission)
      });
    }
    if (ctx.payload.time?.archived !== undefined) {
      yield* session.setArchived({
        sessionID: ctx.params.sessionID,
        time: ctx.payload.time.archived
      });
    }
    return yield* session.get(ctx.params.sessionID);
  });
  /**
   * Forks a session at the given message, creating a new session that branches from that point.
   * @param {Object} ctx - Request context with params.sessionID and payload.messageID.
   * @returns {Effect} Effect resolving to the forked session.
   */
  const fork = Effect.fn("SessionHttpApi.fork")(function* (ctx) {
    return yield* session.fork({
      sessionID: ctx.params.sessionID,
      messageID: ctx.payload.messageID
    });
  });
  /**
   * Aborts (cancels) the in-flight prompt for a session.
   * @param {Object} ctx - Request context with params.sessionID.
   * @returns {Effect} Effect resolving to true.
   */
  const abort = Effect.fn("SessionHttpApi.abort")(function* (ctx) {
    yield* promptSvc.cancel(ctx.params.sessionID);
    return true;
  });
  /**
   * Runs the built-in INIT command on a session using the supplied provider/model to bootstrap project context.
   * @param {Object} ctx - Request context with params.sessionID and payload (messageID, providerID, modelID).
   * @returns {Effect} Effect resolving to true.
   */
  const init = Effect.fn("SessionHttpApi.init")(function* (ctx) {
    yield* promptSvc.command({
      sessionID: ctx.params.sessionID,
      messageID: ctx.payload.messageID,
      model: `${ctx.payload.providerID}/${ctx.payload.modelID}`,
      command: Command.Default.INIT,
      arguments: ""
    });
    return true;
  });
  /**
   * Enables sharing for a session (failures map to BadRequest) and returns the refreshed session.
   * @param {Object} ctx - Request context with params.sessionID.
   * @returns {Effect} Effect resolving to the updated session, or failing with HttpApiError.BadRequest.
   */
  const share = Effect.fn("SessionHttpApi.share")(function* (ctx) {
    yield* shareSvc.share(ctx.params.sessionID).pipe(Effect.mapError(() => new HttpApiError.BadRequest({})));
    return yield* session.get(ctx.params.sessionID);
  });
  /**
   * Disables sharing for a session (failures map to BadRequest) and returns the refreshed session.
   * @param {Object} ctx - Request context with params.sessionID.
   * @returns {Effect} Effect resolving to the updated session, or failing with HttpApiError.BadRequest.
   */
  const unshare = Effect.fn("SessionHttpApi.unshare")(function* (ctx) {
    yield* shareSvc.unshare(ctx.params.sessionID).pipe(Effect.mapError(() => new HttpApiError.BadRequest({})));
    return yield* session.get(ctx.params.sessionID);
  });
  /**
   * Compacts/summarizes a session: cleans up pending reverts, picks the agent from the last user message (or the
   * default agent), creates a compaction with the requested model, then runs the prompt loop to produce the summary.
   * @param {Object} ctx - Request context with params.sessionID and payload (providerID, modelID, auto).
   * @returns {Effect} Effect resolving to true.
   */
  const summarize = Effect.fn("SessionHttpApi.summarize")(function* (ctx) {
    yield* revertSvc.cleanup(yield* session.get(ctx.params.sessionID));
    const messages = yield* session.messages({
      sessionID: ctx.params.sessionID
    });
    const defaultAgent = yield* agentSvc.defaultAgent();
    const currentAgent = messages.findLast(message => message.info.role === "user")?.info.agent ?? defaultAgent;
    yield* compactSvc.create({
      sessionID: ctx.params.sessionID,
      agent: currentAgent,
      model: {
        providerID: ctx.payload.providerID,
        modelID: ctx.payload.modelID
      },
      auto: ctx.payload.auto ?? false
    });
    yield* promptSvc.loop({
      sessionID: ctx.params.sessionID
    });
    return true;
  });
  /**
   * Streams a prompt response: runs the prompt with the current instance/workspace context provided and returns
   * an HTTP streaming response whose body is newline-free JSON-encoded messages.
   * @param {Object} ctx - Request context with params.sessionID and the prompt payload.
   * @returns {Effect} Effect resolving to a streaming HttpServerResponse of JSON messages.
   */
  const prompt = Effect.fn("SessionHttpApi.prompt")(function* (ctx) {
    const instance = yield* InstanceState.context;
    const workspace = yield* InstanceState.workspaceID;
    return HttpServerResponse.stream(Stream.fromEffect(promptSvc.prompt({
      ...ctx.payload,
      sessionID: ctx.params.sessionID
    }).pipe(Effect.provideService(InstanceRef, instance), Effect.provideService(WorkspaceRef, workspace))).pipe(Stream.map(message => JSON.stringify(message)), Stream.encodeText), {
      contentType: "application/json"
    });
  });
  /**
   * Fires a prompt asynchronously: forks the prompt into the request scope (starting immediately) and, on failure,
   * logs the error and publishes a Session.Event.Error; responds No Content without waiting for completion.
   * @param {Object} ctx - Request context with params.sessionID and the prompt payload.
   * @returns {Effect} Effect resolving to a No Content response.
   */
  const promptAsync = Effect.fn("SessionHttpApi.promptAsync")(function* (ctx) {
    yield* promptSvc.prompt({
      ...ctx.payload,
      sessionID: ctx.params.sessionID
    }).pipe(Effect.catchCause(cause => Effect.gen(function* () {
      yield* Effect.logError("prompt_async failed", {
        sessionID: ctx.params.sessionID,
        cause
      });
      yield* bus.publish(Session.Event.Error, {
        sessionID: ctx.params.sessionID,
        error: new NamedError.Unknown({
          message: Cause.pretty(cause)
        }).toObject()
      });
    })), Effect.forkIn(scope, {
      startImmediately: true
    }));
    return HttpApiSchema.NoContent.make();
  });
  /**
   * Runs a slash/built-in command against a session.
   * @param {Object} ctx - Request context with params.sessionID and the command payload.
   * @returns {Effect} Effect resolving to the command result.
   */
  const command = Effect.fn("SessionHttpApi.command")(function* (ctx) {
    return yield* promptSvc.command({
      ...ctx.payload,
      sessionID: ctx.params.sessionID
    });
  });
  /**
   * Runs a shell command within a session.
   * @param {Object} ctx - Request context with params.sessionID and the shell payload.
   * @returns {Effect} Effect resolving to the shell result.
   */
  const shell = Effect.fn("SessionHttpApi.shell")(function* (ctx) {
    return yield* promptSvc.shell({
      ...ctx.payload,
      sessionID: ctx.params.sessionID
    });
  });
  /**
   * Reverts a session to an earlier point as described by the payload.
   * @param {Object} ctx - Request context with params.sessionID and the revert payload.
   * @returns {Effect} Effect resolving to the revert result.
   */
  const revert = Effect.fn("SessionHttpApi.revert")(function* (ctx) {
    return yield* revertSvc.revert({
      sessionID: ctx.params.sessionID,
      ...ctx.payload
    });
  });
  /**
   * Undoes a previous revert on a session.
   * @param {Object} ctx - Request context with params.sessionID.
   * @returns {Effect} Effect resolving to the unrevert result.
   */
  const unrevert = Effect.fn("SessionHttpApi.unrevert")(function* (ctx) {
    return yield* revertSvc.unrevert({
      sessionID: ctx.params.sessionID
    });
  });
  /**
   * Responds to a pending permission request with the supplied reply.
   * @param {Object} ctx - Request context with params.permissionID and payload.response.
   * @returns {Effect} Effect resolving to true.
   */
  const permissionRespond = Effect.fn("SessionHttpApi.permissionRespond")(function* (ctx) {
    yield* permissionSvc.reply({
      requestID: ctx.params.permissionID,
      reply: ctx.payload.response
    });
    return true;
  });
  /**
   * Deletes a message from a session, refusing while the session is busy.
   * @param {Object} ctx - Request context with params identifying the session and message.
   * @returns {Effect} Effect resolving to true once removed.
   */
  const deleteMessage = Effect.fn("SessionHttpApi.deleteMessage")(function* (ctx) {
    yield* runState.assertNotBusy(ctx.params.sessionID);
    yield* session.removeMessage(ctx.params);
    return true;
  });
  /**
   * Deletes a single part from a message.
   * @param {Object} ctx - Request context with params identifying the session, message, and part.
   * @returns {Effect} Effect resolving to true once removed.
   */
  const deletePart = Effect.fn("SessionHttpApi.deletePart")(function* (ctx) {
    yield* session.removePart(ctx.params);
    return true;
  });
  /**
   * Updates a message part, asserting that the payload's id/messageID/sessionID match the path params before writing.
   * @param {Object} ctx - Request context with params (partID, messageID, sessionID) and the part payload.
   * @returns {Effect} Effect resolving to the updated part; throws if the payload ids do not match the path.
   */
  const updatePart = Effect.fn("SessionHttpApi.updatePart")(function* (ctx) {
    const payload = ctx.payload;
    if (payload.id !== ctx.params.partID || payload.messageID !== ctx.params.messageID || payload.sessionID !== ctx.params.sessionID) {
      throw new Error(`Part mismatch: body.id='${payload.id}' vs partID='${ctx.params.partID}', body.messageID='${payload.messageID}' vs messageID='${ctx.params.messageID}', body.sessionID='${payload.sessionID}' vs sessionID='${ctx.params.sessionID}'`);
    }
    return yield* session.updatePart(payload);
  });
  return handlers.handle("list", list).handle("status", status).handle("get", get).handle("children", children).handle("todo", todo).handle("diff", diff).handle("messages", messages).handle("message", message).handleRaw("create", createRaw).handle("remove", remove).handle("update", update).handle("fork", fork).handle("abort", abort).handle("init", init).handle("share", share).handle("unshare", unshare).handle("summarize", summarize).handle("prompt", prompt).handle("promptAsync", promptAsync).handle("command", command).handle("shell", shell).handle("revert", revert).handle("unrevert", unrevert).handle("permissionRespond", permissionRespond).handle("deleteMessage", deleteMessage).handle("deletePart", deletePart).handle("updatePart", updatePart);
}));