import { SessionID } from "#session/schema.js";
import { WorkspaceID } from "#control-plane/schema.js";
import { Op } from "#storage/sequelize.js";
import * as Database from "#storage/db.js";
import { Context, DateTime, Effect, Layer, Schema } from "effect";
import { SessionMessage } from "./session-message.js";
import { EventV2 } from "./event.js";
import { ProjectID } from "#project/schema.js";
import { ModelID, ProviderID } from "#provider/schema.js";
import { SessionEvent } from "./session-event.js";
import { V2Schema } from "./schema.js";
import { optionalOmitUndefined } from "#util/schema.js";
export const Delivery = Schema.Union([Schema.Literal("immediate"), Schema.Literal("deferred")]).annotate({
  identifier: "Session.Delivery"
});
export const DefaultDelivery = "immediate";
export class Info extends Schema.Class("Session.Info")({
  id: SessionID,
  parentID: optionalOmitUndefined(SessionID),
  projectID: ProjectID,
  workspaceID: optionalOmitUndefined(WorkspaceID),
  path: optionalOmitUndefined(Schema.String),
  agent: optionalOmitUndefined(Schema.String),
  model: Schema.Struct({
    id: ModelID,
    providerID: ProviderID,
    variant: optionalOmitUndefined(Schema.String)
  }).pipe(optionalOmitUndefined),
  time: Schema.Struct({
    created: V2Schema.DateTimeUtcFromMillis,
    updated: V2Schema.DateTimeUtcFromMillis,
    archived: optionalOmitUndefined(V2Schema.DateTimeUtcFromMillis)
  }),
  title: Schema.String
  /*
  slug: Schema.String,
  directory: Schema.String,
  path: optionalOmitUndefined(Schema.String),
  parentID: optionalOmitUndefined(SessionID),
  summary: optionalOmitUndefined(Summary),
  share: optionalOmitUndefined(Share),
  title: Schema.String,
  version: Schema.String,
  time: Time,
  permission: optionalOmitUndefined(Permission.Ruleset),
  revert: optionalOmitUndefined(Revert),
  */
}) {}
export class Service extends Context.Service()("@closedcode/v2/Session") {}
// Sequelize call-site conventions (ORM migration S3): reads go through
// Database.useAsync with the handle { models, sequelize, tx }; rows are
// returned plain (JSON columns parsed) to match the previous drizzle shapes.
const plain = row => (row == null ? undefined : row.get({ plain: true }));
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const decodeMessage = Schema.decodeUnknownSync(SessionMessage.Message);
  const decode = row => decodeMessage({
    ...row.data,
    id: row.id,
    type: row.type
  });
  function fromRow(row) {
    return new Info({
      id: SessionID.make(row.id),
      projectID: ProjectID.make(row.project_id),
      workspaceID: row.workspace_id ? WorkspaceID.make(row.workspace_id) : undefined,
      title: row.title,
      parentID: row.parent_id ? SessionID.make(row.parent_id) : undefined,
      path: row.path ?? "",
      agent: row.agent ?? undefined,
      model: row.model ? {
        id: ModelID.make(row.model.id),
        providerID: ProviderID.make(row.model.providerID),
        variant: row.model.variant
      } : undefined,
      time: {
        created: DateTime.makeUnsafe(row.time_created),
        updated: DateTime.makeUnsafe(row.time_updated),
        archived: row.time_archived ? DateTime.makeUnsafe(row.time_archived) : undefined
      }
    });
  }
  const result = {
    list: Effect.fn("V2Session.list")(function* (input) {
      const direction = input.cursor?.direction ?? "next";
      let order = input.order ?? "desc";
      // Query the adjacent rows in reverse, then flip them back into the requested order below.
      if (direction === "previous" && order === "asc") order = "desc";
      if (direction === "previous" && order === "desc") order = "asc";
      const conditions = [];
      if (input.directory) conditions.push({
        directory: input.directory
      });
      if (input.path) conditions.push({
        [Op.or]: [{
          path: input.path
        }, {
          path: {
            [Op.like]: `${input.path}/%`
          }
        }]
      });
      if (input.workspaceID) conditions.push({
        workspace_id: input.workspaceID
      });
      if (input.roots) conditions.push({
        parent_id: {
          [Op.is]: null
        }
      });
      if (input.start) conditions.push({
        time_created: {
          [Op.gte]: input.start
        }
      });
      if (input.search) conditions.push({
        title: {
          [Op.like]: `%${input.search}%`
        }
      });
      if (input.cursor) {
        conditions.push(order === "asc" ? {
          [Op.or]: [{
            time_created: {
              [Op.gt]: input.cursor.time
            }
          }, {
            time_created: input.cursor.time,
            id: {
              [Op.gt]: input.cursor.id
            }
          }]
        } : {
          [Op.or]: [{
            time_created: {
              [Op.lt]: input.cursor.time
            }
          }, {
            time_created: input.cursor.time,
            id: {
              [Op.lt]: input.cursor.id
            }
          }]
        });
      }
      const rows = yield* Effect.promise(() => Database.useAsync(async h => (await h.models.Session.findAll({
        where: conditions.length > 0 ? {
          [Op.and]: conditions
        } : undefined,
        order: [["time_created", order === "asc" ? "ASC" : "DESC"], ["id", order === "asc" ? "ASC" : "DESC"]],
        ...(input.limit === undefined ? {} : {
          limit: input.limit
        }),
        transaction: h.tx
      })).map(r => r.get({
        plain: true
      }))));
      return (direction === "previous" ? rows.toReversed() : rows).map(row => fromRow(row));
    }),
    messages: Effect.fn("V2Session.messages")(function* (input) {
      const direction = input.cursor?.direction ?? "next";
      let order = input.order ?? "desc";
      // Query the adjacent rows in reverse, then flip them back into the requested order below.
      if (direction === "previous" && order === "asc") order = "desc";
      if (direction === "previous" && order === "desc") order = "asc";
      const boundary = input.cursor ? order === "asc" ? {
        [Op.or]: [{
          time_created: {
            [Op.gt]: input.cursor.time
          }
        }, {
          time_created: input.cursor.time,
          id: {
            [Op.gt]: input.cursor.id
          }
        }]
      } : {
        [Op.or]: [{
          time_created: {
            [Op.lt]: input.cursor.time
          }
        }, {
          time_created: input.cursor.time,
          id: {
            [Op.lt]: input.cursor.id
          }
        }]
      } : undefined;
      const where = boundary ? {
        [Op.and]: [{
          session_id: input.sessionID
        }, boundary]
      } : {
        session_id: input.sessionID
      };
      const rows = yield* Effect.promise(() => Database.useAsync(async h => {
        const found = (await h.models.SessionMessage.findAll({
          where,
          order: [["time_created", order === "asc" ? "ASC" : "DESC"], ["id", order === "asc" ? "ASC" : "DESC"]],
          ...(input.limit === undefined ? {} : {
            limit: input.limit
          }),
          transaction: h.tx
        })).map(r => r.get({
          plain: true
        }));
        return direction === "previous" ? found.toReversed() : found;
      }));
      return rows.map(row => decode(row));
    }),
    context: Effect.fn("V2Session.context")(function* (sessionID) {
      const rows = yield* Effect.promise(() => Database.useAsync(async h => {
        const compaction = plain(await h.models.SessionMessage.findOne({
          where: {
            session_id: sessionID,
            type: "compaction"
          },
          order: [["time_created", "DESC"], ["id", "DESC"]],
          transaction: h.tx
        }));
        return (await h.models.SessionMessage.findAll({
          where: compaction ? {
            [Op.and]: [{
              session_id: sessionID
            }, {
              [Op.or]: [{
                time_created: {
                  [Op.gt]: compaction.time_created
                }
              }, {
                time_created: compaction.time_created,
                id: {
                  [Op.gte]: compaction.id
                }
              }]
            }]
          } : {
            session_id: sessionID
          },
          order: [["time_created", "ASC"], ["id", "ASC"]],
          transaction: h.tx
        })).map(r => r.get({
          plain: true
        }));
      }));
      return rows.map(row => decode(row));
    }),
    prompt: Effect.fn("V2Session.prompt")(function* (_input) {
      return {};
    }),
    shell: Effect.fn("V2Session.shell")(function* (_input) {}),
    skill: Effect.fn("V2Session.skill")(function* (_input) {}),
    switchAgent: Effect.fn("V2Session.switchAgent")(function* (input) {
      EventV2.run(SessionEvent.AgentSwitched.Sync, {
        sessionID: input.sessionID,
        timestamp: DateTime.makeUnsafe(Date.now()),
        agent: input.agent
      });
    }),
    switchModel: Effect.fn("V2Session.switchModel")(function* (input) {
      EventV2.run(SessionEvent.ModelSwitched.Sync, {
        sessionID: input.sessionID,
        timestamp: DateTime.makeUnsafe(Date.now()),
        id: input.id,
        providerID: input.providerID,
        variant: input.variant
      });
    }),
    compact: Effect.fn("V2Session.compact")(function* (_sessionID) {}),
    wait: Effect.fn("V2Session.wait")(function* (_sessionID) {})
  };
  return Service.of(result);
}));
export const defaultLayer = layer;
export * as SessionV2 from "./session.js";