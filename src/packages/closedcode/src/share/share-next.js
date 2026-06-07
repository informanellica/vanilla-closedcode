import { Effect, Exit, Layer, Option, Schema, Scope, Context, Stream } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http";
import { Account } from "@/account/account.js";
import { Bus } from "@/bus/index.js";
import { InstanceState } from "@/effect/instance-state.js";
import { Provider } from "@/provider/provider.js";
import { ModelID, ProviderID } from "@/provider/schema.js";
import { Session } from "@/session/session.js";
import { MessageV2 } from "@/session/message-v2.js";
import { Database } from "@/storage/db.js";
import { eq } from "drizzle-orm";
import { Config } from "@/config/config.js";
import * as Log from "core/util/log";
import { SessionShareTable } from "./share.sql.js";
const log = Log.create({
  service: "share-next"
});
const disabled = process.env["CLOSEDCODE_DISABLE_SHARE"] === "true" || process.env["CLOSEDCODE_DISABLE_SHARE"] === "1";
const ShareSchema = Schema.Struct({
  id: Schema.String,
  url: Schema.String,
  secret: Schema.String
});
export class Service extends Context.Service()("@closedcode/ShareNext") {}
const db = fn => Effect.sync(() => Database.use(fn));
function api(resource) {
  return {
    create: `/api/${resource}`,
    sync: shareID => `/api/${resource}/${shareID}/sync`,
    remove: shareID => `/api/${resource}/${shareID}`,
    data: shareID => `/api/${resource}/${shareID}/data`
  };
}
const legacyApi = api("share");
const consoleApi = api("shares");
function key(item) {
  switch (item.type) {
    case "session":
      return "session";
    case "message":
      return `message/${item.data.id}`;
    case "part":
      return `part/${item.data.messageID}/${item.data.id}`;
    case "session_diff":
      return "session_diff";
    case "model":
      return "model";
  }
}
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const account = yield* Account.Service;
  const bus = yield* Bus.Service;
  const cfg = yield* Config.Service;
  const http = yield* HttpClient.HttpClient;
  const httpOk = HttpClient.filterStatusOk(http);
  const provider = yield* Provider.Service;
  const session = yield* Session.Service;
  function sync(sessionID, data) {
    return Effect.gen(function* () {
      if (disabled) return;
      const share = yield* getCached(sessionID);
      if (!share) return;
      const s = yield* InstanceState.get(state);
      const existing = s.queue.get(sessionID);
      if (existing) {
        for (const item of data) {
          existing.set(key(item), item);
        }
        return;
      }
      const next = new Map(data.map(item => [key(item), item]));
      s.queue.set(sessionID, next);
      yield* flush(sessionID).pipe(Effect.delay(1000), Effect.catchCause(cause => Effect.sync(() => {
        log.error("share flush failed", {
          sessionID,
          cause
        });
      })), Effect.forkIn(s.scope));
    });
  }
  const state = yield* InstanceState.make(Effect.fn("ShareNext.state")(function* (_ctx) {
    const cache = {
      queue: new Map(),
      scope: yield* Scope.make(),
      shared: new Map()
    };
    yield* Effect.addFinalizer(() => Scope.close(cache.scope, Exit.void).pipe(Effect.andThen(Effect.sync(() => {
      cache.queue.clear();
      cache.shared.clear();
    }))));
    if (disabled) return cache;
    const watch = (def, fn) => bus.subscribe(def).pipe(Stream.runForEach(evt => fn(evt).pipe(Effect.catchCause(cause => Effect.sync(() => {
      log.error("share subscriber failed", {
        type: def.type,
        cause
      });
    })))), Effect.forkScoped);
    yield* watch(Session.Event.Updated, evt => Effect.gen(function* () {
      const info = evt.properties.info;
      yield* sync(info.id, [{
        type: "session",
        data: info
      }]);
    }));
    yield* watch(MessageV2.Event.Updated, evt => Effect.gen(function* () {
      const info = evt.properties.info;
      yield* sync(info.sessionID, [{
        type: "message",
        data: info
      }]);
      if (info.role !== "user") return;
      const model = yield* provider.getModel(info.model.providerID, info.model.modelID);
      yield* sync(info.sessionID, [{
        type: "model",
        data: [model]
      }]);
    }));
    yield* watch(MessageV2.Event.PartUpdated, evt => sync(evt.properties.part.sessionID, [{
      type: "part",
      data: evt.properties.part
    }]));
    yield* watch(Session.Event.Diff, evt => sync(evt.properties.sessionID, [{
      type: "session_diff",
      data: evt.properties.diff
    }]));
    yield* watch(Session.Event.Deleted, evt => remove(evt.properties.sessionID));
    return cache;
  }));
  const request = Effect.fn("ShareNext.request")(function* () {
    const headers = {};
    const active = yield* account.active();
    if (Option.isNone(active) || !active.value.active_org_id) {
      // No hosted default: closedcode does not ship a public share service.
      // Sharing requires an explicitly configured endpoint (self-hosted / org).
      const baseUrl = (yield* cfg.get()).enterprise?.url;
      if (!baseUrl) {
        throw new Error("Sharing is disabled. Set `enterprise.url` in your config to enable session sharing.");
      }
      return {
        headers,
        api: legacyApi,
        baseUrl
      };
    }
    const token = yield* account.token(active.value.id);
    if (Option.isNone(token)) {
      throw new Error("No active account token available for sharing");
    }
    headers.authorization = `Bearer ${token.value}`;
    headers["x-org-id"] = active.value.active_org_id;
    return {
      headers,
      api: consoleApi,
      baseUrl: active.value.url
    };
  });
  const get = Effect.fnUntraced(function* (sessionID) {
    const row = yield* db(db => db.select().from(SessionShareTable).where(eq(SessionShareTable.session_id, sessionID)).get());
    if (!row) return;
    return {
      id: row.id,
      secret: row.secret,
      url: row.url
    };
  });
  const getCached = Effect.fnUntraced(function* (sessionID) {
    const s = yield* InstanceState.get(state);
    if (s.shared.has(sessionID)) {
      const cached = s.shared.get(sessionID);
      return cached === null ? undefined : cached;
    }
    const share = yield* get(sessionID);
    s.shared.set(sessionID, share ?? null);
    return share;
  });
  const flush = Effect.fn("ShareNext.flush")(function* (sessionID) {
    if (disabled) return;
    const s = yield* InstanceState.get(state);
    const queued = s.queue.get(sessionID);
    if (!queued) return;
    s.queue.delete(sessionID);
    const share = yield* getCached(sessionID);
    if (!share) return;
    const req = yield* request();
    const res = yield* HttpClientRequest.post(`${req.baseUrl}${req.api.sync(share.id)}`).pipe(HttpClientRequest.setHeaders(req.headers), HttpClientRequest.bodyJson({
      secret: share.secret,
      data: Array.from(queued.values())
    }), Effect.flatMap(r => http.execute(r)));
    if (res.status >= 400) {
      log.warn("failed to sync share", {
        sessionID,
        shareID: share.id,
        status: res.status
      });
    }
  });
  const full = Effect.fn("ShareNext.full")(function* (sessionID) {
    log.info("full sync", {
      sessionID
    });
    const info = yield* session.get(sessionID);
    const diffs = yield* session.diff(sessionID);
    const messages = yield* Effect.sync(() => Array.from(MessageV2.stream(sessionID)));
    const models = yield* Effect.forEach(Array.from(new Map(messages.filter(msg => msg.info.role === "user").map(msg => msg.info.model).map(item => [`${item.providerID}/${item.modelID}`, item])).values()), item => provider.getModel(ProviderID.make(item.providerID), ModelID.make(item.modelID)), {
      concurrency: 8
    });
    yield* sync(sessionID, [{
      type: "session",
      data: info
    }, ...messages.map(item => ({
      type: "message",
      data: item.info
    })), ...messages.flatMap(item => item.parts.map(part => ({
      type: "part",
      data: part
    }))), {
      type: "session_diff",
      data: diffs
    }, {
      type: "model",
      data: models
    }]);
  });
  const init = Effect.fn("ShareNext.init")(function* () {
    if (disabled) return;
    yield* InstanceState.get(state);
  });
  const url = Effect.fn("ShareNext.url")(function* () {
    return (yield* request()).baseUrl;
  });
  const create = Effect.fn("ShareNext.create")(function* (sessionID) {
    if (disabled) return {
      id: "",
      url: "",
      secret: ""
    };
    log.info("creating share", {
      sessionID
    });
    const req = yield* request();
    const result = yield* HttpClientRequest.post(`${req.baseUrl}${req.api.create}`).pipe(HttpClientRequest.setHeaders(req.headers), HttpClientRequest.bodyJson({
      sessionID
    }), Effect.flatMap(r => httpOk.execute(r)), Effect.flatMap(HttpClientResponse.schemaBodyJson(ShareSchema)));
    yield* db(db => db.insert(SessionShareTable).values({
      session_id: sessionID,
      id: result.id,
      secret: result.secret,
      url: result.url
    }).onConflictDoUpdate({
      target: SessionShareTable.session_id,
      set: {
        id: result.id,
        secret: result.secret,
        url: result.url
      }
    }).run());
    const s = yield* InstanceState.get(state);
    s.shared.set(sessionID, result);
    yield* full(sessionID).pipe(Effect.catchCause(cause => Effect.sync(() => {
      log.error("share full sync failed", {
        sessionID,
        cause
      });
    })), Effect.forkIn(s.scope));
    return result;
  });
  const remove = Effect.fn("ShareNext.remove")(function* (sessionID) {
    if (disabled) return;
    log.info("removing share", {
      sessionID
    });
    const s = yield* InstanceState.get(state);
    const share = yield* getCached(sessionID);
    if (!share) {
      s.shared.delete(sessionID);
      s.queue.delete(sessionID);
      return;
    }
    const req = yield* request();
    yield* HttpClientRequest.delete(`${req.baseUrl}${req.api.remove(share.id)}`).pipe(HttpClientRequest.setHeaders(req.headers), HttpClientRequest.bodyJson({
      secret: share.secret
    }), Effect.flatMap(r => httpOk.execute(r)));
    yield* db(db => db.delete(SessionShareTable).where(eq(SessionShareTable.session_id, sessionID)).run());
    s.shared.delete(sessionID);
    s.queue.delete(sessionID);
  });
  return Service.of({
    init,
    url,
    request,
    create,
    remove
  });
}));
export const defaultLayer = layer.pipe(Layer.provide(Bus.layer), Layer.provide(Account.defaultLayer), Layer.provide(Config.defaultLayer), Layer.provide(FetchHttpClient.layer), Layer.provide(Provider.defaultLayer), Layer.provide(Session.defaultLayer));
export * as ShareNext from "./share-next.js";