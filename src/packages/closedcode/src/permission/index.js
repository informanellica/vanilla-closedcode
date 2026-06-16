/** @file Permission service: schemas, rule evaluation, and the Effect layer that asks the user for and records tool-call permissions. */

import { Bus } from "#bus/index.js";
import { BusEvent } from "#bus/bus-event.js";
import { InstanceState } from "#effect/instance-state.js";
import { ProjectID } from "#project/schema.js";
import { MessageID, SessionID } from "#session/schema.js";
import { Database } from "#storage/db.js";
import { zod } from "#util/effect-zod.js";
import * as Log from "core/util/log";
import { withStatics } from "#util/schema.js";
import { Wildcard } from "#util/wildcard.js";
import { Deferred, Effect, Layer, Schema, Context } from "effect";
import os from "os";
import { evaluate as evalRule } from "./evaluate.js";
import { PermissionID } from "./schema.js";
const log = Log.create({
  service: "permission"
});
/** Permission action literal: one of "allow", "deny", or "ask". */
export const Action = Schema.Literals(["allow", "deny", "ask"]).annotate({
  identifier: "PermissionAction"
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
/** A single permission rule: a permission key, a pattern, and the action to take. */
export const Rule = Schema.Struct({
  permission: Schema.String,
  pattern: Schema.String,
  action: Action
}).annotate({
  identifier: "PermissionRule"
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
/** A mutable ordered array of permission Rules. */
export const Ruleset = Schema.mutable(Schema.Array(Rule)).annotate({
  identifier: "PermissionRuleset"
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
/** A pending permission request shown to the user for a specific tool call. */
export class Request extends Schema.Class("PermissionRequest")({
  id: PermissionID,
  sessionID: SessionID,
  permission: Schema.String,
  patterns: Schema.Array(Schema.String),
  metadata: Schema.Record(Schema.String, Schema.Unknown),
  always: Schema.Array(Schema.String),
  tool: Schema.optional(Schema.Struct({
    messageID: MessageID,
    callID: Schema.String
  }))
}) {
  static zod = zod(this);
}
/** User reply to a permission request: "once", "always", or "reject". */
export const Reply = Schema.Literals(["once", "always", "reject"]).pipe(withStatics(s => ({
  zod: zod(s)
})));
const reply = {
  reply: Reply,
  message: Schema.optional(Schema.String)
};
/** Body of a permission reply: the reply value plus an optional message. */
export const ReplyBody = Schema.Struct(reply).annotate({
  identifier: "PermissionReplyBody"
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
/** A set of always-allowed patterns approved for a given project. */
export class Approval extends Schema.Class("PermissionApproval")({
  projectID: ProjectID,
  patterns: Schema.Array(Schema.String)
}) {
  static zod = zod(this);
}
/** Bus events published by the permission service: Asked (request raised) and Replied (request resolved). */
export const Event = {
  Asked: BusEvent.define("permission.asked", Request),
  Replied: BusEvent.define("permission.replied", Schema.Struct({
    sessionID: SessionID,
    requestID: PermissionID,
    reply: Reply
  }))
};
/** Error raised when the user rejects permission for a tool call without feedback. */
export class RejectedError extends Schema.TaggedErrorClass()("PermissionRejectedError", {}) {
  get message() {
    return "The user rejected permission to use this specific tool call.";
  }
}
/** Error raised when the user rejects permission for a tool call and provides corrective feedback. */
export class CorrectedError extends Schema.TaggedErrorClass()("PermissionCorrectedError", {
  feedback: Schema.String
}) {
  get message() {
    return `The user rejected permission to use this specific tool call with the following feedback: ${this.feedback}`;
  }
}
/** Error raised when a configured rule explicitly denies a tool call; carries the relevant rules. */
export class DeniedError extends Schema.TaggedErrorClass()("PermissionDeniedError", {
  ruleset: Schema.Any
}) {
  get message() {
    return `The user has specified a rule which prevents you from using this specific tool call. Here are some of the relevant rules ${JSON.stringify(this.ruleset)}`;
  }
}
/** Input to the ask operation: a Request (with optional id) plus the ruleset to evaluate against. */
export const AskInput = Schema.Struct({
  ...Request.fields,
  id: Schema.optional(PermissionID),
  ruleset: Ruleset
}).annotate({
  identifier: "PermissionAskInput"
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
/** Input to the reply operation: the target requestID plus the reply value and optional message. */
export const ReplyInput = Schema.Struct({
  requestID: PermissionID,
  ...reply
}).annotate({
  identifier: "PermissionReplyInput"
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
/**
 * Evaluate a permission/pattern pair against rulesets (thin re-export of evaluate.js).
 * @param {string} permission - The permission key being checked.
 * @param {string} pattern - The concrete pattern/argument being checked.
 * @param {...Array} rulesets - One or more rule arrays to evaluate against.
 * @returns {Object} The matched rule, or a default "ask" rule.
 */
export function evaluate(permission, pattern, ...rulesets) {
  return evalRule(permission, pattern, ...rulesets);
}
/** Effect Context service tag for the permission service. */
export class Service extends Context.Service()("@closedcode/Permission") {}
/**
 * Effect layer providing the permission Service.
 *
 * Loads previously approved rules from the database, exposes ask/reply/list
 * operations over pending requests, persists "always" approvals, and resolves
 * other pending requests in the same session when a reply makes them allowable.
 */
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const bus = yield* Bus.Service;
  const state = yield* InstanceState.make(Effect.fn("Permission.state")(function* (ctx) {
    // Sequelize layer (ORM migration S3): reads return plain rows. The JSON
    // `data` column comes back as raw TEXT from sequelize's sqlite dialect,
    // so decode it like drizzle's { mode: "json" } did; the typeof guard
    // keeps this a no-op if the layer ever starts parsing itself.
    const row = yield* Effect.promise(() => Database.useAsync(async h => {
      const found = await h.models.Permission.findOne({
        where: { project_id: ctx.project.id },
        transaction: h.tx
      });
      if (found == null) return undefined;
      const data = found.get("data");
      return {
        ...found.get({ plain: true }),
        data: typeof data === "string" ? JSON.parse(data) : data
      };
    }));
    const state = {
      pending: new Map(),
      approved: row?.data ?? []
    };
    yield* Effect.addFinalizer(() => Effect.gen(function* () {
      for (const item of state.pending.values()) {
        yield* Deferred.fail(item.deferred, new RejectedError());
      }
      state.pending.clear();
    }));
    return state;
  }));
  // Evaluate each requested pattern; deny immediately on a deny rule, skip
  // allowed patterns, and otherwise raise a pending request and await the
  // user's reply (returns once approved, fails on rejection).
  const ask = Effect.fn("Permission.ask")(function* (input) {
    const {
      approved,
      pending
    } = yield* InstanceState.get(state);
    const {
      ruleset,
      ...request
    } = input;
    let needsAsk = false;
    for (const pattern of request.patterns) {
      const rule = evaluate(request.permission, pattern, ruleset, approved);
      log.info("evaluated", {
        permission: request.permission,
        pattern,
        action: rule
      });
      if (rule.action === "deny") {
        return yield* new DeniedError({
          ruleset: ruleset.filter(rule => Wildcard.match(request.permission, rule.permission))
        });
      }
      if (rule.action === "allow") continue;
      needsAsk = true;
    }
    if (!needsAsk) return;
    const id = request.id ?? PermissionID.ascending();
    const info = Schema.decodeUnknownSync(Request)({
      id,
      ...request
    });
    log.info("asking", {
      id,
      permission: info.permission,
      patterns: info.patterns
    });
    const deferred = yield* Deferred.make();
    pending.set(id, {
      info,
      deferred
    });
    yield* bus.publish(Event.Asked, info);
    return yield* Effect.ensuring(Deferred.await(deferred), Effect.sync(() => {
      pending.delete(id);
    }));
  });
  // Resolve a pending request by id: rejecting fails the deferred (and rejects
  // every other pending request in the same session); approving succeeds it,
  // records "always" approvals, and unblocks other now-allowable requests.
  const reply = Effect.fn("Permission.reply")(function* (input) {
    const {
      approved,
      pending
    } = yield* InstanceState.get(state);
    const existing = pending.get(input.requestID);
    if (!existing) return;
    pending.delete(input.requestID);
    yield* bus.publish(Event.Replied, {
      sessionID: existing.info.sessionID,
      requestID: existing.info.id,
      reply: input.reply
    });
    if (input.reply === "reject") {
      yield* Deferred.fail(existing.deferred, input.message ? new CorrectedError({
        feedback: input.message
      }) : new RejectedError());
      for (const [id, item] of pending.entries()) {
        if (item.info.sessionID !== existing.info.sessionID) continue;
        pending.delete(id);
        yield* bus.publish(Event.Replied, {
          sessionID: item.info.sessionID,
          requestID: item.info.id,
          reply: "reject"
        });
        yield* Deferred.fail(item.deferred, new RejectedError());
      }
      return;
    }
    yield* Deferred.succeed(existing.deferred, undefined);
    if (input.reply === "once") return;
    for (const pattern of existing.info.always) {
      approved.push({
        permission: existing.info.permission,
        pattern,
        action: "allow"
      });
    }
    for (const [id, item] of pending.entries()) {
      if (item.info.sessionID !== existing.info.sessionID) continue;
      const ok = item.info.patterns.every(pattern => evaluate(item.info.permission, pattern, approved).action === "allow");
      if (!ok) continue;
      pending.delete(id);
      yield* bus.publish(Event.Replied, {
        sessionID: item.info.sessionID,
        requestID: item.info.id,
        reply: "always"
      });
      yield* Deferred.succeed(item.deferred, undefined);
    }
  });
  // Return the info objects for all currently pending permission requests.
  const list = Effect.fn("Permission.list")(function* () {
    const pending = (yield* InstanceState.get(state)).pending;
    return Array.from(pending.values(), item => item.info);
  });
  return Service.of({
    ask,
    reply,
    list
  });
}));
/**
 * Expand leading home-directory shorthands in a pattern to an absolute path.
 *
 * Handles "~", "~/", "$HOME" and "$HOME/" prefixes; returns the pattern
 * unchanged otherwise.
 * @param {string} pattern - The pattern that may begin with a home shorthand.
 * @returns {string} The pattern with the home prefix expanded, if any.
 */
function expand(pattern) {
  if (pattern.startsWith("~/")) return os.homedir() + pattern.slice(1);
  if (pattern === "~") return os.homedir();
  if (pattern.startsWith("$HOME/")) return os.homedir() + pattern.slice(5);
  if (pattern.startsWith("$HOME")) return os.homedir() + pattern.slice(5);
  return pattern;
}
/**
 * Build a permission ruleset from a config permission object.
 *
 * Each config entry maps a permission key either to a single action string
 * (applied with pattern "*") or to an object of pattern-to-action entries
 * (patterns are home-expanded).
 * @param {Object} permission - Config object mapping permission keys to actions or pattern maps.
 * @returns {Array} The resulting list of {permission, pattern, action} rules.
 */
export function fromConfig(permission) {
  const ruleset = [];
  for (const [key, value] of Object.entries(permission)) {
    if (typeof value === "string") {
      ruleset.push({
        permission: key,
        action: value,
        pattern: "*"
      });
      continue;
    }
    ruleset.push(...Object.entries(value).map(([pattern, action]) => ({
      permission: key,
      pattern: expand(pattern),
      action
    })));
  }
  return ruleset;
}
/**
 * Merge multiple rulesets into a single flat ruleset.
 * @param {...Array} rulesets - The rulesets to merge.
 * @returns {Array} A single flattened array of rules.
 */
export function merge(...rulesets) {
  return rulesets.flat();
}
/** Tool names that all map to the "edit" permission key. */
const EDIT_TOOLS = ["edit", "write", "apply_patch"];
/**
 * Determine which tools are fully disabled by the ruleset.
 *
 * A tool is disabled when the last rule matching its permission has pattern
 * "*" and action "deny". Edit-family tools are checked under the "edit" key.
 * @param {Array} tools - Tool names to check.
 * @param {Array} ruleset - The ruleset to evaluate against.
 * @returns {Set} The set of tool names that are disabled.
 */
export function disabled(tools, ruleset) {
  const result = new Set();
  for (const tool of tools) {
    const permission = EDIT_TOOLS.includes(tool) ? "edit" : tool;
    const rule = ruleset.findLast(rule => Wildcard.match(permission, rule.permission));
    if (!rule) continue;
    if (rule.pattern === "*" && rule.action === "deny") result.add(tool);
  }
  return result;
}
/** The permission layer with its Bus dependency provided. */
export const defaultLayer = layer.pipe(Layer.provide(Bus.layer));
export * as Permission from "./index.js";