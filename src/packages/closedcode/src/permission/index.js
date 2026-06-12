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
export const Action = Schema.Literals(["allow", "deny", "ask"]).annotate({
  identifier: "PermissionAction"
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
export const Rule = Schema.Struct({
  permission: Schema.String,
  pattern: Schema.String,
  action: Action
}).annotate({
  identifier: "PermissionRule"
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
export const Ruleset = Schema.mutable(Schema.Array(Rule)).annotate({
  identifier: "PermissionRuleset"
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
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
export const Reply = Schema.Literals(["once", "always", "reject"]).pipe(withStatics(s => ({
  zod: zod(s)
})));
const reply = {
  reply: Reply,
  message: Schema.optional(Schema.String)
};
export const ReplyBody = Schema.Struct(reply).annotate({
  identifier: "PermissionReplyBody"
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
export class Approval extends Schema.Class("PermissionApproval")({
  projectID: ProjectID,
  patterns: Schema.Array(Schema.String)
}) {
  static zod = zod(this);
}
export const Event = {
  Asked: BusEvent.define("permission.asked", Request),
  Replied: BusEvent.define("permission.replied", Schema.Struct({
    sessionID: SessionID,
    requestID: PermissionID,
    reply: Reply
  }))
};
export class RejectedError extends Schema.TaggedErrorClass()("PermissionRejectedError", {}) {
  get message() {
    return "The user rejected permission to use this specific tool call.";
  }
}
export class CorrectedError extends Schema.TaggedErrorClass()("PermissionCorrectedError", {
  feedback: Schema.String
}) {
  get message() {
    return `The user rejected permission to use this specific tool call with the following feedback: ${this.feedback}`;
  }
}
export class DeniedError extends Schema.TaggedErrorClass()("PermissionDeniedError", {
  ruleset: Schema.Any
}) {
  get message() {
    return `The user has specified a rule which prevents you from using this specific tool call. Here are some of the relevant rules ${JSON.stringify(this.ruleset)}`;
  }
}
export const AskInput = Schema.Struct({
  ...Request.fields,
  id: Schema.optional(PermissionID),
  ruleset: Ruleset
}).annotate({
  identifier: "PermissionAskInput"
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
export const ReplyInput = Schema.Struct({
  requestID: PermissionID,
  ...reply
}).annotate({
  identifier: "PermissionReplyInput"
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
export function evaluate(permission, pattern, ...rulesets) {
  return evalRule(permission, pattern, ...rulesets);
}
export class Service extends Context.Service()("@closedcode/Permission") {}
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
function expand(pattern) {
  if (pattern.startsWith("~/")) return os.homedir() + pattern.slice(1);
  if (pattern === "~") return os.homedir();
  if (pattern.startsWith("$HOME/")) return os.homedir() + pattern.slice(5);
  if (pattern.startsWith("$HOME")) return os.homedir() + pattern.slice(5);
  return pattern;
}
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
export function merge(...rulesets) {
  return rulesets.flat();
}
const EDIT_TOOLS = ["edit", "write", "apply_patch"];
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
export const defaultLayer = layer.pipe(Layer.provide(Bus.layer));
export * as Permission from "./index.js";