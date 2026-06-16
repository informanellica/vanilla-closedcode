/**
 * @file Session domain model. Creates and persists chat sessions, tracks parent /
 * child relationships and usage, maps between storage rows and runtime objects, and
 * publishes session lifecycle events on the bus.
 * @module closedcode/session
 */

import { Slug } from "core/util/slug";
import path from "path";
import { BusEvent } from "#bus/bus-event.js";
import { Bus } from "#bus/index.js";
import { Decimal } from "decimal.js";
import { Flag } from "core/flag/flag";
import { InstallationVersion } from "core/installation/version";
import { Database } from "#storage/db.js";
import { NotFoundError } from "#storage/storage.js";
import { Op } from "#storage/sequelize.js";
import { SyncEvent } from "../sync/index.js";
import { Storage } from "#storage/storage.js";
import * as Log from "core/util/log";
import { MessageV2 } from "./message-v2.js";
import { InstanceState } from "#effect/instance-state.js";
import { Snapshot } from "#snapshot/index.js";
import { ProjectID } from "../project/schema.js";
import { WorkspaceID } from "../control-plane/schema.js";
import { SessionID, MessageID, PartID } from "./schema.js";
import { ModelID, ProviderID } from "#provider/schema.js";
import { Permission } from "#permission/index.js";
import { Global } from "core/global";
import { Effect, Layer, Option, Context, Schema } from "effect";
import { zod } from "#util/effect-zod.js";
import { NonNegativeInt, optionalOmitUndefined, withStatics } from "#util/schema.js";
const log = Log.create({
  service: "session"
});
const parentTitlePrefix = "New session - ";
const childTitlePrefix = "Child session - ";
/**
 * Builds a default session title from a timestamped prefix.
 * @param {boolean} isChild - Whether the session is a child session (uses the child prefix).
 * @returns {string} The generated default title.
 */
function createDefaultTitle(isChild = false) {
  return (isChild ? childTitlePrefix : parentTitlePrefix) + new Date().toISOString();
}
/**
 * Tests whether a title is an auto-generated default (prefix + ISO timestamp).
 * @param {string} title - The session title to test.
 * @returns {boolean} True if the title matches the default-title pattern.
 */
export function isDefaultTitle(title) {
  return new RegExp(`^(${parentTitlePrefix}|${childTitlePrefix})\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$`).test(title);
}
/**
 * Converts a sqlite session row into a runtime session Info object, decoding
 * nested summary/share/model/time fields and normalizing nulls to undefined.
 * @param {Object} row - The plain database row.
 * @returns {Object} The session Info object.
 */
export function fromRow(row) {
  const summary = row.summary_additions !== null || row.summary_deletions !== null || row.summary_files !== null ? {
    additions: row.summary_additions ?? 0,
    deletions: row.summary_deletions ?? 0,
    files: row.summary_files ?? 0,
    diffs: row.summary_diffs ?? undefined
  } : undefined;
  const share = row.share_url ? {
    url: row.share_url
  } : undefined;
  const revert = row.revert ?? undefined;
  return {
    id: row.id,
    slug: row.slug,
    projectID: row.project_id,
    workspaceID: row.workspace_id ?? undefined,
    directory: row.directory,
    path: row.path ?? undefined,
    parentID: row.parent_id ?? undefined,
    title: row.title,
    agent: row.agent ?? undefined,
    model: row.model ? {
      id: ModelID.make(row.model.id),
      providerID: ProviderID.make(row.model.providerID),
      variant: row.model.variant
    } : undefined,
    version: row.version,
    summary,
    share,
    revert,
    permission: row.permission ?? undefined,
    time: {
      created: row.time_created,
      updated: row.time_updated,
      compacting: row.time_compacting ?? undefined,
      archived: row.time_archived ?? undefined
    }
  };
}
/**
 * Converts a runtime session Info object into a sqlite row, flattening nested
 * summary/share/time fields to their column names.
 * @param {Object} info - The session Info object.
 * @returns {Object} The database row representation.
 */
export function toRow(info) {
  return {
    id: info.id,
    project_id: info.projectID,
    workspace_id: info.workspaceID,
    parent_id: info.parentID,
    slug: info.slug,
    directory: info.directory,
    path: info.path,
    title: info.title,
    agent: info.agent,
    model: info.model,
    version: info.version,
    share_url: info.share?.url,
    summary_additions: info.summary?.additions,
    summary_deletions: info.summary?.deletions,
    summary_files: info.summary?.files,
    summary_diffs: info.summary?.diffs,
    revert: info.revert ?? null,
    permission: info.permission,
    time_created: info.time.created,
    time_updated: info.time.updated,
    time_compacting: info.time.compacting,
    time_archived: info.time.archived
  };
}
/**
 * Derives a forked-session title, incrementing an existing `(fork #N)` suffix or
 * appending `(fork #1)` when none is present.
 * @param {string} title - The original session title.
 * @returns {string} The title for the new fork.
 */
function getForkedTitle(title) {
  const match = title.match(/^(.+) \(fork #(\d+)\)$/);
  if (match) {
    const base = match[1];
    const num = parseInt(match[2], 10);
    return `${base} (fork #${num + 1})`;
  }
  return `${title} (fork #1)`;
}
/**
 * Computes a session's directory path relative to the worktree, normalized to
 * forward slashes.
 * @param {string} worktree - Absolute worktree root.
 * @param {string} cwd - The session's working directory.
 * @returns {string} The worktree-relative, slash-normalized path.
 */
function sessionPath(worktree, cwd) {
  return path.relative(path.resolve(worktree), cwd).replaceAll("\\", "/");
}
const Summary = Schema.Struct({
  additions: NonNegativeInt,
  deletions: NonNegativeInt,
  files: NonNegativeInt,
  diffs: optionalOmitUndefined(Schema.Array(Snapshot.FileDiff))
});
const Share = Schema.Struct({
  url: Schema.String
});

// Legacy HTTP accepted negative values here. Keep archive timestamps permissive
// while excluding non-finite values that cannot round-trip through JSON.
export const ArchivedTimestamp = Schema.Finite;
const Time = Schema.Struct({
  created: NonNegativeInt,
  updated: NonNegativeInt,
  compacting: optionalOmitUndefined(NonNegativeInt),
  archived: optionalOmitUndefined(ArchivedTimestamp)
});
const Revert = Schema.Struct({
  messageID: MessageID,
  partID: optionalOmitUndefined(PartID),
  snapshot: optionalOmitUndefined(Schema.String),
  diff: optionalOmitUndefined(Schema.String)
});
const Model = Schema.Struct({
  id: ModelID,
  providerID: ProviderID,
  variant: optionalOmitUndefined(Schema.String)
});
export const Info = Schema.Struct({
  id: SessionID,
  slug: Schema.String,
  projectID: ProjectID,
  workspaceID: optionalOmitUndefined(WorkspaceID),
  directory: Schema.String,
  path: optionalOmitUndefined(Schema.String),
  parentID: optionalOmitUndefined(SessionID),
  summary: optionalOmitUndefined(Summary),
  share: optionalOmitUndefined(Share),
  title: Schema.String,
  agent: optionalOmitUndefined(Schema.String),
  model: optionalOmitUndefined(Model),
  version: Schema.String,
  time: Time,
  permission: optionalOmitUndefined(Permission.Ruleset),
  revert: optionalOmitUndefined(Revert)
}).annotate({
  identifier: "Session"
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
export const ProjectInfo = Schema.Struct({
  id: ProjectID,
  name: optionalOmitUndefined(Schema.String),
  worktree: Schema.String
}).annotate({
  identifier: "ProjectSummary"
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
export const GlobalInfo = Schema.Struct({
  ...Info.fields,
  project: Schema.NullOr(ProjectInfo)
}).annotate({
  identifier: "GlobalSession"
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
export const CreateInput = Schema.optional(Schema.Struct({
  parentID: Schema.optional(SessionID),
  title: Schema.optional(Schema.String),
  agent: Schema.optional(Schema.String),
  model: Schema.optional(Model),
  permission: Schema.optional(Permission.Ruleset),
  workspaceID: Schema.optional(WorkspaceID)
})).pipe(withStatics(s => ({
  zod: zod(s)
})));
export const ForkInput = Schema.Struct({
  sessionID: SessionID,
  messageID: Schema.optional(MessageID)
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
export const GetInput = SessionID;
export const ChildrenInput = SessionID;
export const RemoveInput = SessionID;
export const SetTitleInput = Schema.Struct({
  sessionID: SessionID,
  title: Schema.String
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
export const SetArchivedInput = Schema.Struct({
  sessionID: SessionID,
  time: Schema.optional(ArchivedTimestamp)
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
export const SetPermissionInput = Schema.Struct({
  sessionID: SessionID,
  permission: Permission.Ruleset
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
export const SetRevertInput = Schema.Struct({
  sessionID: SessionID,
  revert: Schema.optional(Revert),
  summary: Schema.optional(Summary)
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
export const MessagesInput = Schema.Struct({
  sessionID: SessionID,
  limit: Schema.optional(NonNegativeInt)
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
const CreatedEventSchema = Schema.Struct({
  sessionID: SessionID,
  info: Info
});
const UpdatedShare = Schema.Struct({
  url: Schema.optional(Schema.NullOr(Schema.String))
});
const UpdatedTime = Schema.Struct({
  created: Schema.optional(Schema.NullOr(NonNegativeInt)),
  updated: Schema.optional(Schema.NullOr(NonNegativeInt)),
  compacting: Schema.optional(Schema.NullOr(NonNegativeInt)),
  archived: Schema.optional(Schema.NullOr(ArchivedTimestamp))
});
const UpdatedInfo = Schema.Struct({
  id: Schema.optional(Schema.NullOr(SessionID)),
  slug: Schema.optional(Schema.NullOr(Schema.String)),
  projectID: Schema.optional(Schema.NullOr(ProjectID)),
  workspaceID: Schema.optional(Schema.NullOr(WorkspaceID)),
  directory: Schema.optional(Schema.NullOr(Schema.String)),
  path: Schema.optional(Schema.NullOr(Schema.String)),
  parentID: Schema.optional(Schema.NullOr(SessionID)),
  summary: Schema.optional(Schema.NullOr(Summary)),
  share: Schema.optional(UpdatedShare),
  title: Schema.optional(Schema.NullOr(Schema.String)),
  agent: Schema.optional(Schema.NullOr(Schema.String)),
  model: Schema.optional(Schema.NullOr(Model)),
  version: Schema.optional(Schema.NullOr(Schema.String)),
  time: Schema.optional(UpdatedTime),
  permission: Schema.optional(Schema.NullOr(Permission.Ruleset)),
  revert: Schema.optional(Schema.NullOr(Revert))
});
const UpdatedEventSchema = Schema.Struct({
  sessionID: SessionID,
  info: UpdatedInfo
});
/**
 * Session-related events. `Created`/`Updated`/`Deleted` are sync events
 * persisted via projectors; `Diff` and `Error` are bus-only events.
 */
export const Event = {
  Created: SyncEvent.define({
    type: "session.created",
    version: 1,
    aggregate: "sessionID",
    schema: CreatedEventSchema
  }),
  Updated: SyncEvent.define({
    type: "session.updated",
    version: 1,
    aggregate: "sessionID",
    schema: UpdatedEventSchema,
    busSchema: CreatedEventSchema
  }),
  Deleted: SyncEvent.define({
    type: "session.deleted",
    version: 1,
    aggregate: "sessionID",
    schema: CreatedEventSchema
  }),
  Diff: BusEvent.define("session.diff", Schema.Struct({
    sessionID: SessionID,
    diff: Schema.Array(Snapshot.FileDiff)
  })),
  Error: BusEvent.define("session.error", Schema.Struct({
    sessionID: Schema.optional(SessionID),
    // Reuses MessageV2.Assistant.fields.error (already Schema.optional) so
    // the derived zod keeps the same discriminated-union shape on the bus.
    error: MessageV2.Assistant.fields.error
  }))
};
/**
 * Computes the absolute path of a session's plan markdown file. Stored under the
 * worktree's `.closedcode/plans` when the project is under version control,
 * otherwise under the global data directory.
 * @param {Object} input - Session info providing `time.created` and `slug`.
 * @param {Object} instance - Instance context with `project.vcs` and `worktree`.
 * @returns {string} The absolute path to the plan file.
 */
export function plan(input, instance) {
  const base = instance.project.vcs ? path.join(instance.worktree, ".closedcode", "plans") : path.join(Global.Path.data, "plans");
  return path.join(base, [input.time.created, input.slug].join("-") + ".md");
}
/**
 * Computes token usage and cost for a model step. Normalizes provider usage
 * fields (subtracting cached tokens from input, separating reasoning tokens) and
 * applies the model's per-million pricing, including the optional over-200K tier.
 * @param {Object} input - `{ model, usage, metadata }` for the step.
 * @returns {{cost: number, tokens: Object}} The computed cost and token breakdown.
 */
export const getUsage = input => {
  const safe = value => {
    if (!Number.isFinite(value)) return 0;
    return value;
  };
  const inputTokens = safe(input.usage.inputTokens ?? 0);
  const outputTokens = safe(input.usage.outputTokens ?? 0);
  const reasoningTokens = safe(input.usage.outputTokenDetails?.reasoningTokens ?? input.usage.reasoningTokens ?? 0);
  const cacheReadInputTokens = safe(input.usage.inputTokenDetails?.cacheReadTokens ?? input.usage.cachedInputTokens ?? 0);
  const cacheWriteInputTokens = safe(Number(input.usage.inputTokenDetails?.cacheWriteTokens ?? 0));

  // AI SDK v6 normalized inputTokens to include cached tokens across all providers
  // (including Anthropic/Bedrock which previously excluded them). Always subtract cache
  // tokens to get the non-cached input count for separate cost calculation.
  const adjustedInputTokens = safe(inputTokens - cacheReadInputTokens - cacheWriteInputTokens);
  const total = input.usage.totalTokens;
  const tokens = {
    total,
    input: adjustedInputTokens,
    output: safe(outputTokens - reasoningTokens),
    reasoning: reasoningTokens,
    cache: {
      write: cacheWriteInputTokens,
      read: cacheReadInputTokens
    }
  };
  const costInfo = input.model.cost?.experimentalOver200K && tokens.input + tokens.cache.read > 200_000 ? input.model.cost.experimentalOver200K : input.model.cost;
  return {
    cost: safe(new Decimal(0).add(new Decimal(tokens.input).mul(costInfo?.input ?? 0).div(1_000_000)).add(new Decimal(tokens.output).mul(costInfo?.output ?? 0).div(1_000_000)).add(new Decimal(tokens.cache.read).mul(costInfo?.cache?.read ?? 0).div(1_000_000)).add(new Decimal(tokens.cache.write).mul(costInfo?.cache?.write ?? 0).div(1_000_000)).add(new Decimal(tokens.reasoning).mul(costInfo?.output ?? 0).div(1_000_000)).toNumber()),
    tokens
  };
};
/** Error thrown when an operation targets a session that is currently busy. */
export class BusyError extends Error {
  /**
   * @param {string} sessionID - The busy session's ID.
   */
  constructor(sessionID) {
    super(`Session ${sessionID} is busy`);
    this.sessionID = sessionID;
  }
}
/** Effect service tag for the Session service. */
export class Service extends Context.Service()("@closedcode/Session") {}
// Sequelize call-site conventions (ORM migration S3): callbacks receive the
// handle { models, sequelize, tx } and every model call passes
// { transaction: h.tx }; reads return plain rows (JSON columns parsed).
/**
 * Extracts a plain JS object from a sequelize row instance.
 * @param {*} row - The sequelize row (or null/undefined).
 * @returns {Object} The plain row object, or undefined when the row is null.
 */
const plain = row => (row == null ? undefined : row.get({ plain: true }));
/**
 * Runs an async database callback inside an Effect, providing the sequelize handle.
 * @param {Function} fn - Async callback receiving the handle `{ models, sequelize, tx }`.
 * @returns {*} An Effect yielding the callback's result.
 */
const db = fn => Effect.promise(() => Database.useAsync(fn));
/** Layer that builds the Session service: CRUD over sessions, messages, and parts. */
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const bus = yield* Bus.Service;
  const storage = yield* Storage.Service;
  const sync = yield* SyncEvent.Service;
  /**
   * Builds a new session Info, emits the Created sync event, and (when workspaces
   * are disabled) republishes a legacy Updated bus event for compatibility.
   * @param {Object} input - Session fields (directory, path, parentID, title, agent, model, permission, workspaceID).
   * @returns {*} An Effect yielding the newly created session Info.
   */
  const createNext = Effect.fn("Session.createNext")(function* (input) {
    const ctx = yield* InstanceState.context;
    const result = {
      id: SessionID.descending(input.id),
      slug: Slug.create(),
      version: InstallationVersion,
      projectID: ctx.project.id,
      directory: input.directory,
      path: input.path,
      workspaceID: input.workspaceID,
      parentID: input.parentID,
      title: input.title ?? createDefaultTitle(!!input.parentID),
      agent: input.agent,
      model: input.model,
      permission: input.permission,
      time: {
        created: Date.now(),
        updated: Date.now()
      }
    };
    log.info("created", result);
    yield* sync.run(Event.Created, {
      sessionID: result.id,
      info: result
    });
    if (!Flag.CLOSEDCODE_EXPERIMENTAL_WORKSPACES) {
      // This only exist for backwards compatibility. We should not be
      // manually publishing this event; it is a sync event now
      yield* bus.publish(Event.Updated, {
        sessionID: result.id,
        info: result
      });
    }
    return result;
  });
  /**
   * Loads a session by ID, throwing NotFoundError if it does not exist.
   * @param {string} id - The session ID.
   * @returns {*} An Effect yielding the session Info.
   */
  const get = Effect.fn("Session.get")(function* (id) {
    const row = yield* db(async h => plain(await h.models.Session.findOne({
      where: {
        id
      },
      transaction: h.tx
    })));
    if (!row) throw new NotFoundError({
      message: `Session not found: ${id}`
    });
    return fromRow(row);
  });
  /**
   * Lists sessions for the current project, merging in the provided filters.
   * @param {Object} input - Optional list filters (directory, path, search, limit, etc.).
   * @returns {*} An Effect yielding an array of session Info objects.
   */
  const list = Effect.fn("Session.list")(function* (input) {
    const ctx = yield* InstanceState.context;
    return yield* Effect.promise(() => listByProject({
      projectID: ctx.project.id,
      ...(input ?? {})
    }));
  });
  /**
   * Lists the direct child sessions of a parent session.
   * @param {string} parentID - The parent session ID.
   * @returns {*} An Effect yielding an array of child session Info objects.
   */
  const children = Effect.fn("Session.children")(function* (parentID) {
    const rows = yield* db(async h => (await h.models.Session.findAll({
      where: {
        parent_id: parentID
      },
      transaction: h.tx
    })).map(r => r.get({
      plain: true
    })));
    return rows.map(fromRow);
  });
  /**
   * Recursively deletes a session and all of its child sessions, emitting the
   * Deleted sync event (publishing only when an instance context exists) and
   * removing its sync history. Errors are logged rather than thrown.
   * @param {string} sessionID - The session to remove.
   * @returns {*} An Effect that completes once removal is attempted.
   */
  const remove = Effect.fnUntraced(function* (sessionID) {
    try {
      const session = yield* get(sessionID);
      const kids = yield* children(sessionID);
      for (const child of kids) {
        yield* remove(child.id);
      }

      // `remove` needs to work in all cases, such as a broken
      // sessions that run cleanup. In certain cases these will
      // run without any instance state, so we need to turn off
      // publishing of events in that case
      const hasInstance = yield* InstanceState.directory.pipe(Effect.as(true), Effect.catchCause(() => Effect.succeed(false)));
      yield* sync.run(Event.Deleted, {
        sessionID,
        info: session
      }, {
        publish: hasInstance
      });
      yield* sync.remove(sessionID);
    } catch (e) {
      log.error(e);
    }
  });
  /**
   * Upserts a message by emitting the MessageV2 Updated sync event.
   * @param {Object} msg - The message info to persist.
   * @returns {*} An Effect yielding the same message.
   */
  const updateMessage = msg => Effect.gen(function* () {
    yield* sync.run(MessageV2.Event.Updated, {
      sessionID: msg.sessionID,
      info: msg
    });
    return msg;
  }).pipe(Effect.withSpan("Session.updateMessage"));
  /**
   * Upserts a message part by emitting the MessageV2 PartUpdated sync event with
   * a structured clone of the part.
   * @param {Object} part - The part to persist.
   * @returns {*} An Effect yielding the same part.
   */
  const updatePart = part => Effect.gen(function* () {
    yield* sync.run(MessageV2.Event.PartUpdated, {
      sessionID: part.sessionID,
      part: structuredClone(part),
      time: Date.now()
    });
    return part;
  }).pipe(Effect.withSpan("Session.updatePart"));
  /**
   * Loads a single message part by session/message/part ID.
   * @param {Object} input - `{ sessionID, messageID, partID }`.
   * @returns {*} An Effect yielding the part (with id/sessionID/messageID merged in), or undefined.
   */
  const getPart = Effect.fn("Session.getPart")(function* (input) {
    const row = yield* db(async h => plain(await h.models.Part.findOne({
      where: {
        session_id: input.sessionID,
        message_id: input.messageID,
        id: input.partID
      },
      transaction: h.tx
    })));
    if (!row) return;
    return {
      ...row.data,
      id: row.id,
      sessionID: row.session_id,
      messageID: row.message_id
    };
  });
  /**
   * Creates a new session in the current instance's directory/worktree,
   * defaulting the workspace from instance state.
   * @param {Object} input - Optional `{ parentID, title, agent, model, permission, workspaceID }`.
   * @returns {*} An Effect yielding the created session Info.
   */
  const create = Effect.fn("Session.create")(function* (input) {
    const ctx = yield* InstanceState.context;
    const workspace = yield* InstanceState.workspaceID;
    return yield* createNext({
      parentID: input?.parentID,
      directory: ctx.directory,
      path: sessionPath(ctx.worktree, ctx.directory),
      title: input?.title,
      agent: input?.agent,
      model: input?.model,
      permission: input?.permission,
      workspaceID: input?.workspaceID ?? workspace
    });
  });
  /**
   * Forks a session into a new one, copying its messages and parts (with fresh
   * IDs) up to but not including the optional `messageID` cutoff, remapping
   * parent/tail references via an ID map.
   * @param {Object} input - `{ sessionID, messageID }`.
   * @returns {*} An Effect yielding the new forked session Info.
   */
  const fork = Effect.fn("Session.fork")(function* (input) {
    const ctx = yield* InstanceState.context;
    const original = yield* get(input.sessionID);
    const title = getForkedTitle(original.title);
    const session = yield* createNext({
      directory: ctx.directory,
      path: sessionPath(ctx.worktree, ctx.directory),
      workspaceID: original.workspaceID,
      title
    });
    const msgs = yield* messages({
      sessionID: input.sessionID
    });
    const idMap = new Map();
    for (const msg of msgs) {
      if (input.messageID && msg.info.id >= input.messageID) break;
      const newID = MessageID.ascending();
      idMap.set(msg.info.id, newID);
      const parentID = msg.info.role === "assistant" && msg.info.parentID ? idMap.get(msg.info.parentID) : undefined;
      const cloned = yield* updateMessage({
        ...msg.info,
        sessionID: session.id,
        id: newID,
        ...(parentID && {
          parentID
        })
      });
      for (const part of msg.parts) {
        const p = {
          ...part,
          id: PartID.ascending(),
          messageID: cloned.id,
          sessionID: session.id
        };
        if (p.type === "compaction" && p.tail_start_id) {
          p.tail_start_id = idMap.get(p.tail_start_id);
        }
        yield* updatePart(p);
      }
    }
    return session;
  });
  /**
   * Emits an Updated sync event applying a partial change to a session.
   * @param {string} sessionID - The session to update.
   * @param {Object} info - Partial session fields to change (use `null` to clear).
   * @returns {*} An Effect that completes once the event is run.
   */
  const patch = (sessionID, info) => sync.run(Event.Updated, {
    sessionID,
    info
  });
  /**
   * Bumps a session's `time.updated` to the current time.
   * @param {string} sessionID - The session to touch.
   * @returns {*} An Effect that completes once the update is emitted.
   */
  const touch = Effect.fn("Session.touch")(function* (sessionID) {
    yield* patch(sessionID, {
      time: {
        updated: Date.now()
      }
    });
  });
  /**
   * Sets a session's title.
   * @param {Object} input - `{ sessionID, title }`.
   * @returns {*} An Effect that completes once the update is emitted.
   */
  const setTitle = Effect.fn("Session.setTitle")(function* (input) {
    yield* patch(input.sessionID, {
      title: input.title
    });
  });
  /**
   * Sets (or clears) a session's archived timestamp.
   * @param {Object} input - `{ sessionID, time }`.
   * @returns {*} An Effect that completes once the update is emitted.
   */
  const setArchived = Effect.fn("Session.setArchived")(function* (input) {
    yield* patch(input.sessionID, {
      time: {
        archived: input.time
      }
    });
  });
  /**
   * Updates a session's permission ruleset and bumps `time.updated`.
   * @param {Object} input - `{ sessionID, permission }`.
   * @returns {*} An Effect that completes once the update is emitted.
   */
  const setPermission = Effect.fn("Session.setPermission")(function* (input) {
    yield* patch(input.sessionID, {
      permission: input.permission,
      time: {
        updated: Date.now()
      }
    });
  });
  /**
   * Records a session's revert marker and diff summary, bumping `time.updated`.
   * @param {Object} input - `{ sessionID, revert, summary }`.
   * @returns {*} An Effect that completes once the update is emitted.
   */
  const setRevert = Effect.fn("Session.setRevert")(function* (input) {
    yield* patch(input.sessionID, {
      summary: input.summary,
      time: {
        updated: Date.now()
      },
      revert: input.revert
    });
  });
  /**
   * Clears a session's revert marker and bumps `time.updated`.
   * @param {string} sessionID - The session to clear the revert from.
   * @returns {*} An Effect that completes once the update is emitted.
   */
  const clearRevert = Effect.fn("Session.clearRevert")(function* (sessionID) {
    yield* patch(sessionID, {
      time: {
        updated: Date.now()
      },
      revert: null
    });
  });
  /**
   * Updates a session's diff summary and bumps `time.updated`.
   * @param {Object} input - `{ sessionID, summary }`.
   * @returns {*} An Effect that completes once the update is emitted.
   */
  const setSummary = Effect.fn("Session.setSummary")(function* (input) {
    yield* patch(input.sessionID, {
      time: {
        updated: Date.now()
      },
      summary: input.summary
    });
  });
  /**
   * Reads the stored file-diff summary for a session, defaulting to an empty array.
   * @param {string} sessionID - The session whose diff to read.
   * @returns {*} An Effect yielding the array of file diffs.
   */
  const diff = Effect.fn("Session.diff")(function* (sessionID) {
    return yield* storage.read(["session_diff", sessionID]).pipe(Effect.orElseSucceed(() => []));
  });
  /**
   * Lists a session's messages (with parts). With a `limit`, returns a page of
   * the most recent messages; otherwise streams and returns all in chronological order.
   * @param {Object} input - `{ sessionID, limit }`.
   * @returns {*} An Effect yielding an array of message items.
   */
  const messages = Effect.fn("Session.messages")(function* (input) {
    if (input.limit) {
      const result = yield* Effect.promise(() => MessageV2.page({
        sessionID: input.sessionID,
        limit: input.limit
      }));
      return result.items;
    }
    return yield* Effect.promise(async () => {
      const items = [];
      for await (const item of MessageV2.stream(input.sessionID)) items.push(item);
      return items.reverse();
    });
  });
  /**
   * Removes a message by emitting the MessageV2 Removed sync event.
   * @param {Object} input - `{ sessionID, messageID }`.
   * @returns {*} An Effect yielding the removed message ID.
   */
  const removeMessage = Effect.fn("Session.removeMessage")(function* (input) {
    yield* sync.run(MessageV2.Event.Removed, {
      sessionID: input.sessionID,
      messageID: input.messageID
    });
    return input.messageID;
  });
  /**
   * Removes a message part by emitting the MessageV2 PartRemoved sync event.
   * @param {Object} input - `{ sessionID, messageID, partID }`.
   * @returns {*} An Effect yielding the removed part ID.
   */
  const removePart = Effect.fn("Session.removePart")(function* (input) {
    yield* sync.run(MessageV2.Event.PartRemoved, {
      sessionID: input.sessionID,
      messageID: input.messageID,
      partID: input.partID
    });
    return input.partID;
  });
  /**
   * Publishes an incremental part-delta event on the bus (e.g. streaming text/reasoning).
   * @param {Object} input - The part-delta payload `{ sessionID, messageID, partID, field, delta }`.
   * @returns {*} An Effect that completes once published.
   */
  const updatePartDelta = Effect.fnUntraced(function* (input) {
    yield* bus.publish(MessageV2.Event.PartDelta, input);
  });

  /** Finds the first message matching the predicate, searching newest-first. */
  const findMessage = Effect.fn("Session.findMessage")(function* (sessionID, predicate) {
    return yield* Effect.promise(async () => {
      for await (const item of MessageV2.stream(sessionID)) {
        if (predicate(item)) return Option.some(item);
      }
      return Option.none();
    });
  });
  return Service.of({
    list,
    create,
    fork,
    touch,
    get,
    setTitle,
    setArchived,
    setPermission,
    setRevert,
    clearRevert,
    setSummary,
    diff,
    messages,
    children,
    remove,
    updateMessage,
    removeMessage,
    removePart,
    updatePart,
    getPart,
    updatePartDelta,
    findMessage
  });
}));
export const defaultLayer = layer.pipe(Layer.provide(Bus.layer), Layer.provide(Storage.defaultLayer), Layer.provide(SyncEvent.defaultLayer));
/**
 * Queries sessions for a project, applying optional workspace/path/directory,
 * roots-only, start time, and title-search filters, ordered by most recently
 * updated.
 * @param {Object} input - Filters including `projectID` plus optional
 *   `workspaceID`, `path`, `directory`, `scope`, `roots`, `start`, `search`, `limit`.
 * @returns {Promise<Array>} A promise of matching session Info objects.
 */
async function listByProject(input) {
  const where = {
    project_id: input.projectID
  };
  if (input.workspaceID) {
    where.workspace_id = input.workspaceID;
  }
  if (input.path !== undefined) {
    if (input.path) {
      const conds = [{
        path: input.path
      }, {
        path: {
          [Op.like]: `${input.path}/%`
        }
      }];
      where[Op.or] = input.directory ? [...conds, {
        path: {
          [Op.is]: null
        },
        directory: input.directory
      }] : conds;
    }
  } else if (input.scope !== "project" && !Flag.CLOSEDCODE_EXPERIMENTAL_WORKSPACES) {
    if (input.directory) {
      where.directory = input.directory;
    }
  }
  if (input.roots) {
    where.parent_id = {
      [Op.is]: null
    };
  }
  if (input.start) {
    where.time_updated = {
      [Op.gte]: input.start
    };
  }
  if (input.search) {
    where.title = {
      [Op.like]: `%${input.search}%`
    };
  }
  const limit = input.limit ?? 100;
  const rows = await Database.useAsync(async h => (await h.models.Session.findAll({
    where,
    order: [["time_updated", "DESC"]],
    limit,
    transaction: h.tx
  })).map(r => r.get({
    plain: true
  })));
  return rows.map(fromRow);
}
/**
 * Async-iterates sessions across all projects (not scoped to the current
 * instance), applying optional directory/roots/time-range/search/archived
 * filters and joining each session with its project summary.
 * @param {Object} input - Optional filters `{ directory, roots, start, cursor, search, archived, limit }`.
 * @returns {AsyncGenerator<Object>} Yields GlobalInfo-shaped session objects with an attached `project`.
 */
export async function* listGlobal(input) {
  const where = {};
  if (input?.directory) {
    where.directory = input.directory;
  }
  if (input?.roots) {
    where.parent_id = {
      [Op.is]: null
    };
  }
  // `start` (gte) and `cursor` (lt) both constrain time_updated; merge the
  // operators into a single attribute condition.
  const timeUpdated = {};
  if (input?.start) {
    timeUpdated[Op.gte] = input.start;
  }
  if (input?.cursor) {
    timeUpdated[Op.lt] = input.cursor;
  }
  if (Object.getOwnPropertySymbols(timeUpdated).length > 0) {
    where.time_updated = timeUpdated;
  }
  if (input?.search) {
    where.title = {
      [Op.like]: `%${input.search}%`
    };
  }
  if (!input?.archived) {
    where.time_archived = {
      [Op.is]: null
    };
  }
  const limit = input?.limit ?? 100;
  const rows = await Database.useAsync(async h => (await h.models.Session.findAll({
    where,
    order: [["time_updated", "DESC"], ["id", "DESC"]],
    limit,
    transaction: h.tx
  })).map(r => r.get({
    plain: true
  })));
  const ids = [...new Set(rows.map(row => row.project_id))];
  const projects = new Map();
  if (ids.length > 0) {
    const items = await Database.useAsync(async h => (await h.models.Project.findAll({
      attributes: ["id", "name", "worktree"],
      where: {
        id: {
          [Op.in]: ids
        }
      },
      transaction: h.tx
    })).map(r => r.get({
      plain: true
    })));
    for (const item of items) {
      projects.set(item.id, {
        id: item.id,
        name: item.name ?? undefined,
        worktree: item.worktree
      });
    }
  }
  for (const row of rows) {
    const project = projects.get(row.project_id) ?? null;
    yield {
      ...fromRow(row),
      project
    };
  }
}
export * as Session from "./session.js";