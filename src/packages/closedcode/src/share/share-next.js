/** @file ShareNext: the current session-sharing backend. Pushes session/message/part/diff/model updates to a configured share endpoint with debounced batching, and stores share credentials locally. */
import { Effect, Exit, Layer, Option, Schema, Scope, Context, Stream } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http";
import { Account } from "#account/account.js";
import { Bus } from "#bus/index.js";
import { InstanceState } from "#effect/instance-state.js";
import { Provider } from "#provider/provider.js";
import { ModelID, ProviderID } from "#provider/schema.js";
import { Session } from "#session/session.js";
import { MessageV2 } from "#session/message-v2.js";
import { Database } from "#storage/db.js";
import { Config } from "#config/config.js";
import * as Log from "core/util/log";
const log = Log.create({
  service: "share-next"
});
/** True when sharing has been disabled via the CLOSEDCODE_DISABLE_SHARE env var. */
const disabled = process.env["CLOSEDCODE_DISABLE_SHARE"] === "true" || process.env["CLOSEDCODE_DISABLE_SHARE"] === "1";
/** Schema for a share record returned by the share endpoint: id, public url, and write secret. */
const ShareSchema = Schema.Struct({
  id: Schema.String,
  url: Schema.String,
  secret: Schema.String
});
export class Service extends Context.Service()("@closedcode/ShareNext") {}
// Sequelize call-site conventions (ORM migration S3): Database.useAsync hands
// a handle { models, sequelize, tx }; every model call passes
// { transaction: h.tx }. Errors stay defects (Effect.sync -> Effect.promise).
/**
 * Converts a Sequelize row to a plain object, returning undefined for a null/absent row.
 * @param {Object} row - A Sequelize model instance, or null/undefined.
 * @returns {Object} The plain object form of the row, or undefined.
 */
const plain = row => (row == null ? undefined : row.get({ plain: true }));
/**
 * Runs a database handle callback inside an Effect, wrapping the Sequelize handle access.
 * @param {Function} fn - Async callback receiving the database handle `{ models, sequelize, tx }`.
 * @returns {Effect} An Effect resolving to the callback's result.
 */
const db = fn => Effect.promise(() => Database.useAsync(fn));
/**
 * Builds the set of REST endpoint paths for a share resource name.
 * @param {string} resource - The resource path segment (e.g. "share" or "shares").
 * @returns {Object} An object with `create` path and `sync`/`remove`/`data` path-builder functions taking a shareID.
 */
function api(resource) {
  return {
    create: `/api/${resource}`,
    sync: shareID => `/api/${resource}/${shareID}/sync`,
    remove: shareID => `/api/${resource}/${shareID}`,
    data: shareID => `/api/${resource}/${shareID}/data`
  };
}
/** Endpoint paths for the legacy ("share") self-hosted/enterprise share API. */
const legacyApi = api("share");
/** Endpoint paths for the console ("shares") share API used with an active org account. */
const consoleApi = api("shares");
/**
 * Derives a stable dedupe key for a sync item so that repeated updates to the same entity collapse in the pending queue.
 * @param {Object} item - A sync item with a `type` ("session" | "message" | "part" | "session_diff" | "model") and `data`.
 * @returns {string} The dedupe key for that item.
 */
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
/**
 * Effect Layer providing the ShareNext service, which subscribes to session/message/part/diff events and pushes batched updates to the configured share endpoint.
 */
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const account = yield* Account.Service;
  const bus = yield* Bus.Service;
  const cfg = yield* Config.Service;
  const http = yield* HttpClient.HttpClient;
  const httpOk = HttpClient.filterStatusOk(http);
  const provider = yield* Provider.Service;
  const session = yield* Session.Service;
  /**
   * Queues sync items for a shared session and schedules a debounced flush; merges into any existing queue so the latest update per key wins. No-op when sharing is disabled or the session is not shared.
   * @param {string} sessionID - The session identifier.
   * @param {Array} data - Sync items (`{ type, data }`) to enqueue.
   * @returns {Effect} An Effect performing the enqueue and flush scheduling.
   */
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
  // Per-instance state: a pending sync queue, a forked scope for background flushes,
  // a cache of known share records, and (unless disabled) bus subscriptions that feed sync().
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
    /**
     * Subscribes to a bus event and runs the handler for each event, logging and swallowing failures so one bad event does not tear down the subscription.
     * @param {Object} def - The bus event definition to subscribe to.
     * @param {Function} fn - Handler invoked with each event, returning an Effect.
     * @returns {Effect} A forked-scoped subscription Effect.
     */
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
  /**
   * Resolves the share endpoint, headers, and API path-set to use: an authenticated console API when an org account is active, otherwise the configured enterprise URL. Throws when no share endpoint is configured.
   * @returns {Promise<Object>} An object `{ headers, api, baseUrl }`.
   */
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
  /**
   * Reads the stored share record for a session from the database.
   * @param {string} sessionID - The session identifier.
   * @returns {Promise<Object>} The share record `{ id, secret, url }`, or undefined when not shared.
   */
  const get = Effect.fnUntraced(function* (sessionID) {
    const row = yield* db(async h => plain(await h.models.SessionShare.findOne({
      where: { session_id: sessionID },
      transaction: h.tx
    })));
    if (!row) return;
    return {
      id: row.id,
      secret: row.secret,
      url: row.url
    };
  });
  /**
   * Returns the share record for a session, memoizing the result (including the "not shared" case) in the in-memory cache.
   * @param {string} sessionID - The session identifier.
   * @returns {Promise<Object>} The share record, or undefined when not shared.
   */
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
  /**
   * Drains a session's pending sync queue and POSTs the batched items to the share endpoint's sync route. No-op when disabled, nothing queued, or the session is not shared.
   * @param {string} sessionID - The session identifier.
   * @returns {void}
   */
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
  /**
   * Performs a full sync of a session: pushes the session info, all messages and their parts, the session diff, and the distinct models used by user messages.
   * @param {string} sessionID - The session identifier.
   * @returns {void}
   */
  const full = Effect.fn("ShareNext.full")(function* (sessionID) {
    log.info("full sync", {
      sessionID
    });
    const info = yield* session.get(sessionID);
    const diffs = yield* session.diff(sessionID);
    const messages = yield* Effect.promise(() => Array.fromAsync(MessageV2.stream(sessionID)));
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
  /**
   * Eagerly initializes the instance state (and thus the bus subscriptions). No-op when sharing is disabled.
   * @returns {void}
   */
  const init = Effect.fn("ShareNext.init")(function* () {
    if (disabled) return;
    yield* InstanceState.get(state);
  });
  /**
   * Returns the base URL of the resolved share endpoint.
   * @returns {Promise<string>} The share endpoint base URL.
   */
  const url = Effect.fn("ShareNext.url")(function* () {
    return (yield* request()).baseUrl;
  });
  /**
   * Creates a new share for a session: POSTs to the create endpoint, persists the returned credentials, caches them, and kicks off a background full sync. Returns empty credentials when sharing is disabled.
   * @param {string} sessionID - The session identifier.
   * @returns {Promise<Object>} The share record `{ id, url, secret }`.
   */
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
    yield* db(h => h.models.SessionShare.upsert({
      session_id: sessionID,
      id: result.id,
      secret: result.secret,
      url: result.url
    }, { transaction: h.tx }));
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
  /**
   * Removes a session's share: deletes it on the endpoint, removes the stored record, and clears the cache and queue entries. No-op when disabled; when no local share is known, just clears local state.
   * @param {string} sessionID - The session identifier.
   * @returns {void}
   */
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
    yield* db(h => h.models.SessionShare.destroy({ where: { session_id: sessionID }, transaction: h.tx }));
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
/** The ShareNext layer with all its dependencies (Bus, Account, Config, HTTP client, Provider, Session) provided. */
export const defaultLayer = layer.pipe(Layer.provide(Bus.layer), Layer.provide(Account.defaultLayer), Layer.provide(Config.defaultLayer), Layer.provide(FetchHttpClient.layer), Layer.provide(Provider.defaultLayer), Layer.provide(Session.defaultLayer));
export * as ShareNext from "./share-next.js";