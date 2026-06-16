/** @file Computes and persists per-session and per-message diff summaries (additions/deletions/files) from snapshots. */
import { Effect, Layer, Context, Schema } from "effect";
import { Bus } from "#bus/index.js";
import { Snapshot } from "#snapshot/index.js";
import { Storage } from "#storage/storage.js";
import { zod } from "#util/effect-zod.js";
import { withStatics } from "#util/schema.js";
import * as Session from "./session.js";
import { SessionID, MessageID } from "./schema.js";
/**
 * Decodes a git "C-quoted" path (a path git wraps in double quotes with backslash/octal escapes) back into its real UTF-8 form. Returns the input unchanged when it is not a quoted path.
 * @param {string} input - A path as emitted by git, possibly double-quoted with escape sequences.
 * @returns {string} The decoded path, or the original input if it was not quoted.
 */
function unquoteGitPath(input) {
  if (!input.startsWith('"')) return input;
  if (!input.endsWith('"')) return input;
  const body = input.slice(1, -1);
  const bytes = [];
  for (let i = 0; i < body.length; i++) {
    const char = body[i];
    if (char !== "\\") {
      bytes.push(char.charCodeAt(0));
      continue;
    }
    const next = body[i + 1];
    if (!next) {
      bytes.push("\\".charCodeAt(0));
      continue;
    }
    if (next >= "0" && next <= "7") {
      const chunk = body.slice(i + 1, i + 4);
      const match = chunk.match(/^[0-7]{1,3}/);
      if (!match) {
        bytes.push(next.charCodeAt(0));
        i++;
        continue;
      }
      bytes.push(parseInt(match[0], 8));
      i += match[0].length;
      continue;
    }
    const escaped = next === "n" ? "\n" : next === "r" ? "\r" : next === "t" ? "\t" : next === "b" ? "\b" : next === "f" ? "\f" : next === "v" ? "\v" : next === "\\" || next === '"' ? next : undefined;
    bytes.push((escaped ?? next).charCodeAt(0));
    i++;
  }
  return Buffer.from(bytes).toString();
}
export class Service extends Context.Service()("@closedcode/SessionSummary") {}
/**
 * Effect Layer providing the SessionSummary service, which derives file diffs between snapshots, stores them, and exposes summarize/diff/computeDiff operations.
 */
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const sessions = yield* Session.Service;
  const snapshot = yield* Snapshot.Service;
  const storage = yield* Storage.Service;
  const bus = yield* Bus.Service;
  /**
   * Computes the full diff between the first step-start snapshot and the last step-finish snapshot found across the given messages.
   * @param {Object} input - Object with a `messages` array of message-with-parts objects.
   * @returns {Promise<Array>} The list of file diff entries, or an empty array when no snapshot bounds are found.
   */
  const computeDiff = Effect.fn("SessionSummary.computeDiff")(function* (input) {
    let from;
    let to;
    for (const item of input.messages) {
      if (!from) {
        for (const part of item.parts) {
          if (part.type === "step-start" && part.snapshot) {
            from = part.snapshot;
            break;
          }
        }
      }
      for (const part of item.parts) {
        if (part.type === "step-finish" && part.snapshot) to = part.snapshot;
      }
    }
    if (from && to) return yield* snapshot.diffFull(from, to);
    return [];
  });
  /**
   * Recomputes the session-wide diff summary (additions, deletions, file count), persists the diffs, publishes a Diff event, and updates the target user message's per-message diff summary.
   * @param {Object} input - Object with `sessionID` and optional `messageID` identifying the message to attach a per-message summary to.
   * @returns {void}
   */
  const summarize = Effect.fn("SessionSummary.summarize")(function* (input) {
    const all = yield* sessions.messages({
      sessionID: input.sessionID
    });
    if (!all.length) return;
    const diffs = yield* computeDiff({
      messages: all
    });
    yield* sessions.setSummary({
      sessionID: input.sessionID,
      summary: {
        additions: diffs.reduce((sum, x) => sum + x.additions, 0),
        deletions: diffs.reduce((sum, x) => sum + x.deletions, 0),
        files: diffs.length
      }
    });
    yield* storage.write(["session_diff", input.sessionID], diffs).pipe(Effect.ignore);
    yield* bus.publish(Session.Event.Diff, {
      sessionID: input.sessionID,
      diff: diffs
    });
    const messages = all.filter(m => m.info.id === input.messageID || m.info.role === "assistant" && m.info.parentID === input.messageID);
    const target = messages.find(m => m.info.id === input.messageID);
    if (!target || target.info.role !== "user") return;
    const msgDiffs = yield* computeDiff({
      messages
    });
    target.info.summary = {
      ...target.info.summary,
      diffs: msgDiffs
    };
    yield* sessions.updateMessage(target.info);
  });
  /**
   * Reads the stored session diff, normalizing any git-quoted file paths to their decoded form and re-persisting when changed.
   * @param {Object} input - Object with `sessionID`.
   * @returns {Promise<Array>} The (possibly path-normalized) list of stored diff entries.
   */
  const diff = Effect.fn("SessionSummary.diff")(function* (input) {
    const diffs = yield* storage.read(["session_diff", input.sessionID]).pipe(Effect.catch(() => Effect.succeed([])));
    const next = diffs.map(item => {
      const file = unquoteGitPath(item.file);
      if (file === item.file) return item;
      return {
        ...item,
        file
      };
    });
    const changed = next.some((item, i) => item.file !== diffs[i]?.file);
    if (changed) yield* storage.write(["session_diff", input.sessionID], next).pipe(Effect.ignore);
    return next;
  });
  return Service.of({
    summarize,
    diff,
    computeDiff
  });
}));
/** The SessionSummary layer with all its dependencies (Session, Snapshot, Storage, Bus) provided. */
export const defaultLayer = Layer.suspend(() => layer.pipe(Layer.provide(Session.defaultLayer), Layer.provide(Snapshot.defaultLayer), Layer.provide(Storage.defaultLayer), Layer.provide(Bus.layer)));
/** Schema for diff requests: a required `sessionID` and optional `messageID`. */
export const DiffInput = Schema.Struct({
  sessionID: SessionID,
  messageID: Schema.optional(MessageID)
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
export * as SessionSummary from "./summary.js";