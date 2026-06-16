/** @file Session sharing service: creates/removes shares, mirrors share URL onto session info, and auto-shares new sessions when configured. */
import { Session } from "#session/session.js";
import { SyncEvent } from "#sync/index.js";
import { Effect, Layer, Scope, Context } from "effect";
import { Config } from "#config/config.js";
import { Flag } from "core/flag/flag";
import * as ShareNext from "./share-next.js";
export class Service extends Context.Service()("@closedcode/SessionShare") {}
/**
 * Effect Layer providing the SessionShare service, which wraps ShareNext to create/remove shares, sync the resulting URL onto the session, and optionally auto-share newly created sessions.
 */
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const cfg = yield* Config.Service;
  const session = yield* Session.Service;
  const shareNext = yield* ShareNext.Service;
  const scope = yield* Scope.Scope;
  const sync = yield* SyncEvent.Service;
  /**
   * Creates a share for the session (unless sharing is disabled in config) and syncs the resulting share URL onto the session info.
   * @param {string} sessionID - The session identifier.
   * @returns {Promise<Object>} The created share result, including its `url`.
   */
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
  /**
   * Removes the session's share and clears the share URL from the session info.
   * @param {string} sessionID - The session identifier.
   * @returns {void}
   */
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
  /**
   * Creates a session and, for non-child sessions, auto-shares it in the background when the auto-share flag or config is enabled.
   * @param {Object} input - The session creation input forwarded to the Session service.
   * @returns {Promise<Object>} The created session.
   */
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
/** The SessionShare layer with all its dependencies (ShareNext, Session, Config, SyncEvent) provided. */
export const defaultLayer = layer.pipe(Layer.provide(ShareNext.defaultLayer), Layer.provide(Session.defaultLayer), Layer.provide(Config.defaultLayer), Layer.provide(SyncEvent.defaultLayer));
export * as SessionShare from "./session.js";