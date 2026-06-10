import { Session } from "#session/session.js";
import { SyncEvent } from "#sync/index.js";
import { Effect, Layer, Scope, Context } from "effect";
import { Config } from "#config/config.js";
import { Flag } from "core/flag/flag";
import * as ShareNext from "./share-next.js";
export class Service extends Context.Service()("@closedcode/SessionShare") {}
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const cfg = yield* Config.Service;
  const session = yield* Session.Service;
  const shareNext = yield* ShareNext.Service;
  const scope = yield* Scope.Scope;
  const sync = yield* SyncEvent.Service;
  const share = Effect.fn("SessionShare.share")(function* (sessionID) {
    const conf = yield* cfg.get();
    if (conf.share === "disabled") throw new Error("Sharing is disabled in configuration");
    const result = yield* shareNext.create(sessionID);
    yield* sync.run(Session.Event.Updated, {
      sessionID,
      info: {
        share: {
          url: result.url
        }
      }
    });
    return result;
  });
  const unshare = Effect.fn("SessionShare.unshare")(function* (sessionID) {
    yield* shareNext.remove(sessionID);
    yield* sync.run(Session.Event.Updated, {
      sessionID,
      info: {
        share: {
          url: null
        }
      }
    });
  });
  const create = Effect.fn("SessionShare.create")(function* (input) {
    const result = yield* session.create(input);
    if (result.parentID) return result;
    const conf = yield* cfg.get();
    if (!(Flag.CLOSEDCODE_AUTO_SHARE || conf.share === "auto")) return result;
    yield* share(result.id).pipe(Effect.ignore, Effect.forkIn(scope));
    return result;
  });
  return Service.of({
    create,
    share,
    unshare
  });
}));
export const defaultLayer = layer.pipe(Layer.provide(ShareNext.defaultLayer), Layer.provide(Session.defaultLayer), Layer.provide(Config.defaultLayer), Layer.provide(SyncEvent.defaultLayer));
export * as SessionShare from "./session.js";