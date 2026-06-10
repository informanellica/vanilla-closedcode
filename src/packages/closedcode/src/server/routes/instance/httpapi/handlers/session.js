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
const mapNotFound = self => self.pipe(Effect.catchIf(NotFoundError.isInstance, () => Effect.fail(new HttpApiError.NotFound({}))), Effect.catchDefect(error => NotFoundError.isInstance(error) ? Effect.fail(new HttpApiError.NotFound({})) : Effect.die(error)));
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
  const status = Effect.fn("SessionHttpApi.status")(function* () {
    return Object.fromEntries(yield* statusSvc.list());
  });
  const get = Effect.fn("SessionHttpApi.get")(function* (ctx) {
    return yield* mapNotFound(session.get(ctx.params.sessionID));
  });
  const children = Effect.fn("SessionHttpApi.children")(function* (ctx) {
    return yield* session.children(ctx.params.sessionID);
  });
  const todo = Effect.fn("SessionHttpApi.todo")(function* (ctx) {
    return yield* todoSvc.get(ctx.params.sessionID);
  });
  const diff = Effect.fn("SessionHttpApi.diff")(function* (ctx) {
    return yield* summary.diff({
      sessionID: ctx.params.sessionID,
      messageID: ctx.query.messageID
    });
  });
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
      const page = MessageV2.page({
        sessionID: ctx.params.sessionID,
        limit: ctx.query.limit,
        before: ctx.query.before
      });
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
  const message = Effect.fn("SessionHttpApi.message")(function* (ctx) {
    return yield* mapNotFound(Effect.sync(() => MessageV2.get({
      sessionID: ctx.params.sessionID,
      messageID: ctx.params.messageID
    })));
  });
  const create = Effect.fn("SessionHttpApi.create")(function* (ctx) {
    return yield* shareSvc.create(ctx.payload);
  });
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
  const remove = Effect.fn("SessionHttpApi.remove")(function* (ctx) {
    yield* session.remove(ctx.params.sessionID);
    return true;
  });
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
  const fork = Effect.fn("SessionHttpApi.fork")(function* (ctx) {
    return yield* session.fork({
      sessionID: ctx.params.sessionID,
      messageID: ctx.payload.messageID
    });
  });
  const abort = Effect.fn("SessionHttpApi.abort")(function* (ctx) {
    yield* promptSvc.cancel(ctx.params.sessionID);
    return true;
  });
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
  const share = Effect.fn("SessionHttpApi.share")(function* (ctx) {
    yield* shareSvc.share(ctx.params.sessionID).pipe(Effect.mapError(() => new HttpApiError.BadRequest({})));
    return yield* session.get(ctx.params.sessionID);
  });
  const unshare = Effect.fn("SessionHttpApi.unshare")(function* (ctx) {
    yield* shareSvc.unshare(ctx.params.sessionID).pipe(Effect.mapError(() => new HttpApiError.BadRequest({})));
    return yield* session.get(ctx.params.sessionID);
  });
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
  const command = Effect.fn("SessionHttpApi.command")(function* (ctx) {
    return yield* promptSvc.command({
      ...ctx.payload,
      sessionID: ctx.params.sessionID
    });
  });
  const shell = Effect.fn("SessionHttpApi.shell")(function* (ctx) {
    return yield* promptSvc.shell({
      ...ctx.payload,
      sessionID: ctx.params.sessionID
    });
  });
  const revert = Effect.fn("SessionHttpApi.revert")(function* (ctx) {
    return yield* revertSvc.revert({
      sessionID: ctx.params.sessionID,
      ...ctx.payload
    });
  });
  const unrevert = Effect.fn("SessionHttpApi.unrevert")(function* (ctx) {
    return yield* revertSvc.unrevert({
      sessionID: ctx.params.sessionID
    });
  });
  const permissionRespond = Effect.fn("SessionHttpApi.permissionRespond")(function* (ctx) {
    yield* permissionSvc.reply({
      requestID: ctx.params.permissionID,
      reply: ctx.payload.response
    });
    return true;
  });
  const deleteMessage = Effect.fn("SessionHttpApi.deleteMessage")(function* (ctx) {
    yield* runState.assertNotBusy(ctx.params.sessionID);
    yield* session.removeMessage(ctx.params);
    return true;
  });
  const deletePart = Effect.fn("SessionHttpApi.deletePart")(function* (ctx) {
    yield* session.removePart(ctx.params);
    return true;
  });
  const updatePart = Effect.fn("SessionHttpApi.updatePart")(function* (ctx) {
    const payload = ctx.payload;
    if (payload.id !== ctx.params.partID || payload.messageID !== ctx.params.messageID || payload.sessionID !== ctx.params.sessionID) {
      throw new Error(`Part mismatch: body.id='${payload.id}' vs partID='${ctx.params.partID}', body.messageID='${payload.messageID}' vs messageID='${ctx.params.messageID}', body.sessionID='${payload.sessionID}' vs sessionID='${ctx.params.sessionID}'`);
    }
    return yield* session.updatePart(payload);
  });
  return handlers.handle("list", list).handle("status", status).handle("get", get).handle("children", children).handle("todo", todo).handle("diff", diff).handle("messages", messages).handle("message", message).handleRaw("create", createRaw).handle("remove", remove).handle("update", update).handle("fork", fork).handle("abort", abort).handle("init", init).handle("share", share).handle("unshare", unshare).handle("summarize", summarize).handle("prompt", prompt).handle("promptAsync", promptAsync).handle("command", command).handle("shell", shell).handle("revert", revert).handle("unrevert", unrevert).handle("permissionRespond", permissionRespond).handle("deleteMessage", deleteMessage).handle("deletePart", deletePart).handle("updatePart", updatePart);
}));