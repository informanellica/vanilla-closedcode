/** @file Session revert/unrevert: rolls the workspace back to a chosen message/part via filesystem snapshots, recording the resulting diff, and prunes the reverted messages on cleanup. */
import { Effect, Layer, Context, Schema } from "effect";
import { Bus } from "../bus/index.js";
import { Snapshot } from "../snapshot/index.js";
import { Storage } from "#storage/storage.js";
import { SyncEvent } from "../sync/index.js";
import * as Log from "core/util/log";
import { zod } from "#util/effect-zod.js";
import { withStatics } from "#util/schema.js";
import * as Session from "./session.js";
import { MessageV2 } from "./message-v2.js";
import { SessionID, MessageID, PartID } from "./schema.js";
import { SessionRunState } from "./run-state.js";
import { SessionSummary } from "./summary.js";
const log = Log.create({
  service: "session.revert"
});
/** Input schema for a revert request: the session plus the message (and optional part) to revert back to. */
export const RevertInput = Schema.Struct({
  sessionID: SessionID,
  messageID: MessageID,
  partID: Schema.optional(PartID)
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
/** Effect service tag for the session revert service. */
export class Service extends Context.Service()("@closedcode/SessionRevert") {}
/** Layer that builds the SessionRevert service (revert / unrevert / cleanup operations). */
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const sessions = yield* Session.Service;
  const snap = yield* Snapshot.Service;
  const storage = yield* Storage.Service;
  const bus = yield* Bus.Service;
  const summary = yield* SessionSummary.Service;
  const state = yield* SessionRunState.Service;
  const sync = yield* SyncEvent.Service;
  /**
   * Reverts the session's workspace back to the given message/part. Captures a
   * snapshot of the current state (so it can be undone), restores the prior
   * snapshot and reverses intervening patches, computes the resulting file diff,
   * persists it, and records the revert point on the session.
   * @param {Object} input - Revert target.
   * @param {string} input.sessionID - Session to revert.
   * @param {string} input.messageID - Message to revert back to.
   * @param {string} input.partID - Optional part within the message to revert to.
   * @returns {*} An Effect yielding the updated session info.
   */
  const revert = Effect.fn("SessionRevert.revert")(function* (input) {
    yield* state.assertNotBusy(input.sessionID);
    const all = yield* sessions.messages({
      sessionID: input.sessionID
    });
    let lastUser;
    const session = yield* sessions.get(input.sessionID);
    let rev;
    const patches = [];
    for (const msg of all) {
      if (msg.info.role === "user") lastUser = msg.info;
      const remaining = [];
      for (const part of msg.parts) {
        if (rev) {
          if (part.type === "patch") patches.push(part);
          continue;
        }
        if (!rev) {
          if (msg.info.id === input.messageID && !input.partID || part.id === input.partID) {
            const partID = remaining.some(item => ["text", "tool"].includes(item.type)) ? input.partID : undefined;
            rev = {
              messageID: !partID && lastUser ? lastUser.id : msg.info.id,
              partID
            };
          }
          remaining.push(part);
        }
      }
    }
    if (!rev) return session;
    rev.snapshot = session.revert?.snapshot ?? (yield* snap.track());
    if (session.revert?.snapshot) yield* snap.restore(session.revert.snapshot);
    yield* snap.revert(patches);
    if (rev.snapshot) rev.diff = yield* snap.diff(rev.snapshot);
    const range = all.filter(msg => msg.info.id >= rev.messageID);
    const diffs = yield* summary.computeDiff({
      messages: range
    });
    yield* storage.write(["session_diff", input.sessionID], diffs).pipe(Effect.ignore);
    yield* bus.publish(Session.Event.Diff, {
      sessionID: input.sessionID,
      diff: diffs
    });
    yield* sessions.setRevert({
      sessionID: input.sessionID,
      revert: rev,
      summary: {
        additions: diffs.reduce((sum, x) => sum + x.additions, 0),
        deletions: diffs.reduce((sum, x) => sum + x.deletions, 0),
        files: diffs.length
      }
    });
    return yield* sessions.get(input.sessionID);
  });
  /**
   * Undoes a prior revert by restoring the snapshot captured at revert time and
   * clearing the recorded revert point. No-op if the session is not reverted.
   * @param {Object} input - The session to unrevert.
   * @param {string} input.sessionID - Session to unrevert.
   * @returns {*} An Effect yielding the updated session info.
   */
  const unrevert = Effect.fn("SessionRevert.unrevert")(function* (input) {
    log.info("unreverting", input);
    yield* state.assertNotBusy(input.sessionID);
    const session = yield* sessions.get(input.sessionID);
    if (!session.revert) return session;
    if (session.revert.snapshot) yield* snap.restore(session.revert.snapshot);
    yield* sessions.clearRevert(input.sessionID);
    return yield* sessions.get(input.sessionID);
  });
  /**
   * Finalizes a pending revert by permanently removing messages (and trailing
   * parts) after the revert point, then clears the revert marker. Called before
   * a session resumes so the reverted-away history is discarded.
   * @param {Object} session - Session info carrying an optional `revert` marker.
   * @returns {*} An Effect that completes once messages/parts are pruned.
   */
  const cleanup = Effect.fn("SessionRevert.cleanup")(function* (session) {
    if (!session.revert) return;
    const sessionID = session.id;
    const msgs = yield* sessions.messages({
      sessionID
    });
    const messageID = session.revert.messageID;
    const remove = [];
    let target;
    for (const msg of msgs) {
      if (msg.info.id < messageID) continue;
      if (msg.info.id > messageID) {
        remove.push(msg);
        continue;
      }
      if (session.revert.partID) {
        target = msg;
        continue;
      }
      remove.push(msg);
    }
    for (const msg of remove) {
      yield* sync.run(MessageV2.Event.Removed, {
        sessionID,
        messageID: msg.info.id
      });
    }
    if (session.revert.partID && target) {
      const partID = session.revert.partID;
      const idx = target.parts.findIndex(part => part.id === partID);
      if (idx >= 0) {
        const removeParts = target.parts.slice(idx);
        target.parts = target.parts.slice(0, idx);
        for (const part of removeParts) {
          yield* sync.run(MessageV2.Event.PartRemoved, {
            sessionID,
            messageID: target.info.id,
            partID: part.id
          });
        }
      }
    }
    yield* sessions.clearRevert(sessionID);
  });
  return Service.of({
    revert,
    unrevert,
    cleanup
  });
}));
export const defaultLayer = Layer.suspend(() => layer.pipe(Layer.provide(SessionRunState.defaultLayer), Layer.provide(Session.defaultLayer), Layer.provide(Snapshot.defaultLayer), Layer.provide(Storage.defaultLayer), Layer.provide(Bus.layer), Layer.provide(SessionSummary.defaultLayer), Layer.provide(SyncEvent.defaultLayer)));
export * as SessionRevert from "./revert.js";