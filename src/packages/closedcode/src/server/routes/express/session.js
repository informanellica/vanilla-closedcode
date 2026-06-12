// Express route group for the instance /session endpoints (27 operations).
import express from "express";
import { Effect } from "effect";
import z from "zod";
import { SessionID, MessageID, PartID } from "#session/schema.js";
import { Session } from "#session/session.js";
import { MessageV2 } from "#session/message-v2.js";
import { SessionPrompt } from "#session/prompt.js";
import { SessionRunState } from "#session/run-state.js";
import { SessionCompaction } from "#session/compaction.js";
import { SessionRevert } from "#session/revert.js";
import { SessionShare } from "#share/session.js";
import { SessionStatus } from "#session/status.js";
import { SessionSummary } from "#session/summary.js";
import { Todo } from "#session/todo.js";
import { Agent } from "#agent/agent.js";
import { Snapshot } from "#snapshot/index.js";
import { Command } from "#command/index.js";
import * as Log from "core/util/log";
import { Permission } from "#permission/index.js";
import { PermissionID } from "#permission/schema.js";
import { ModelID, ProviderID } from "#provider/schema.js";
import { zodObject } from "#util/effect-zod.js";
import { Bus } from "#bus/index.js";
import { NamedError } from "core/util/error";
import { AppRuntime } from "#effect/app-runtime.js";
import { registerOperation } from "../../express/openapi.js";
import { validator } from "../../express/validate.js";
import { errors } from "../../express/errors.js";

const log = Log.create({ service: "server" });

// Group-relative mount of this router.
const BASE = "/session";

// Reused query-boolean schema + coercion helper.
const QueryBoolean = z.union([
  z.preprocess((value) => (value === "true" ? true : value === "false" ? false : value), z.boolean()),
  z.enum(["true", "false"]),
]);
function queryBoolean(value) {
  if (value === undefined) return;
  return value === true || value === "true";
}

// OTel attribute key normalisation: `fooID` -> `foo.id`; other params are namespaced under `closedcode.`.
function paramToAttributeKey(key) {
  const m = key.match(/^(.+)ID$/);
  if (m) return `${m[1].toLowerCase()}.id`;
  return `closedcode.${key}`;
}

// OTel span attributes for an Express request; mirrors trace.js requestAttributes.
function requestAttributes(req) {
  const attributes = {
    "http.method": req.method,
    "http.path": req.path,
  };
  for (const [key, value] of Object.entries(req.params ?? {})) {
    attributes[paramToAttributeKey(key)] = value;
  }
  return attributes;
}

// Runs an Effect inside a named span carrying the request attributes.
function runRequest(name, req, effect) {
  return AppRuntime.runPromise(
    effect.pipe(
      Effect.withSpan(name, {
        attributes: requestAttributes(req),
      }),
    ),
  );
}

// Runs an Effect generator and JSON-encodes the resolved value onto the response.
async function jsonRequest(name, req, res, gen) {
  res.json(await runRequest(name, req, Effect.gen(gen)));
}

export function SessionRoutes(registry) {
  const router = express.Router();

  // Register a route's openapi metadata against the GROUP-RELATIVE mount ("/session").
  const describe = (method, path, meta) => registry && registerOperation(registry, method, BASE + path, meta);

  // GET / — List sessions
  describe("get", "/", {
    summary: "List sessions",
    description: "Get a list of all ClosedCode sessions, sorted by most recently updated.",
    operationId: "session.list",
    responses: {
      200: {
        description: "List of sessions",
        content: { "application/json": { schema: Session.Info.zod.array() } },
      },
    },
  });
  router.get(
    "/",
    validator(
      "query",
      z.object({
        directory: z.string().optional().meta({ description: "Filter sessions by directory" }),
        // TODO: in 2.0 remove `scope` and `directory` and default
        // to list all sessions for a project
        scope: z.enum(["project"]).optional().meta({ description: "List all sessions for the current project" }),
        path: z.string().optional().meta({ description: "Filter sessions by project-relative path" }),
        roots: QueryBoolean.optional().meta({ description: "Only return root sessions (no parentID)" }),
        start: z.coerce.number().optional().meta({ description: "Filter sessions updated on or after this timestamp (milliseconds since epoch)" }),
        search: z.string().optional().meta({ description: "Filter sessions by title (case-insensitive)" }),
        limit: z.coerce.number().optional().meta({ description: "Maximum number of sessions to return" }),
      }),
    ),
    async (req, res, next) => {
      try {
        const query = req.valid.query;
        res.json(
          await runRequest(
            "SessionRoutes.list",
            req,
            Session.Service.use((svc) =>
              svc.list({
                directory: query.scope === "project" ? undefined : query.directory,
                path: query.path,
                roots: queryBoolean(query.roots),
                start: query.start,
                search: query.search,
                limit: query.limit,
              }),
            ),
          ),
        );
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /status — Get session status
  describe("get", "/status", {
    summary: "Get session status",
    description: "Retrieve the current status of all sessions, including active, idle, and completed states.",
    operationId: "session.status",
    responses: {
      200: {
        description: "Get session status",
        content: { "application/json": { schema: z.record(z.string(), SessionStatus.Info.zod) } },
      },
      ...errors(400),
    },
  });
  router.get("/status", async (req, res, next) => {
    try {
      await jsonRequest("SessionRoutes.status", req, res, function* () {
        const svc = yield* SessionStatus.Service;
        return Object.fromEntries(yield* svc.list());
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /:sessionID — Get session
  describe("get", "/:sessionID", {
    summary: "Get session",
    description: "Retrieve detailed information about a specific ClosedCode session.",
    tags: ["Session"],
    operationId: "session.get",
    responses: {
      200: {
        description: "Get session",
        content: { "application/json": { schema: Session.Info.zod } },
      },
      ...errors(400, 404),
    },
  });
  router.get("/:sessionID", validator("param", z.object({ sessionID: Session.GetInput.zod })), async (req, res, next) => {
    try {
      const sessionID = req.valid.param.sessionID;
      await jsonRequest("SessionRoutes.get", req, res, function* () {
        const session = yield* Session.Service;
        return yield* session.get(sessionID);
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /:sessionID/children — Get session children
  describe("get", "/:sessionID/children", {
    summary: "Get session children",
    tags: ["Session"],
    description: "Retrieve all child sessions that were forked from the specified parent session.",
    operationId: "session.children",
    responses: {
      200: {
        description: "List of children",
        content: { "application/json": { schema: Session.Info.zod.array() } },
      },
      ...errors(400, 404),
    },
  });
  router.get("/:sessionID/children", validator("param", z.object({ sessionID: Session.ChildrenInput.zod })), async (req, res, next) => {
    try {
      const sessionID = req.valid.param.sessionID;
      await jsonRequest("SessionRoutes.children", req, res, function* () {
        const session = yield* Session.Service;
        return yield* session.children(sessionID);
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /:sessionID/todo — Get session todos
  describe("get", "/:sessionID/todo", {
    summary: "Get session todos",
    description: "Retrieve the todo list associated with a specific session, showing tasks and action items.",
    operationId: "session.todo",
    responses: {
      200: {
        description: "Todo list",
        content: { "application/json": { schema: Todo.Info.zod.array() } },
      },
      ...errors(400, 404),
    },
  });
  router.get("/:sessionID/todo", validator("param", z.object({ sessionID: SessionID.zod })), async (req, res, next) => {
    try {
      const sessionID = req.valid.param.sessionID;
      await jsonRequest("SessionRoutes.todo", req, res, function* () {
        const todo = yield* Todo.Service;
        return yield* todo.get(sessionID);
      });
    } catch (err) {
      next(err);
    }
  });

  // POST / — Create session
  describe("post", "/", {
    summary: "Create session",
    description: "Create a new ClosedCode session for interacting with AI assistants and managing conversations.",
    operationId: "session.create",
    responses: {
      ...errors(400),
      200: {
        description: "Successfully created session",
        content: { "application/json": { schema: Session.Info.zod } },
      },
    },
  });
  router.post("/", validator("json", Session.CreateInput.zod), async (req, res, next) => {
    try {
      await jsonRequest("SessionRoutes.create", req, res, function* () {
        const body = req.valid.json ?? {};
        const svc = yield* SessionShare.Service;
        return yield* svc.create(body);
      });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /:sessionID — Delete session
  describe("delete", "/:sessionID", {
    summary: "Delete session",
    description: "Delete a session and permanently remove all associated data, including messages and history.",
    operationId: "session.delete",
    responses: {
      200: {
        description: "Successfully deleted session",
        content: { "application/json": { schema: z.boolean() } },
      },
      ...errors(400, 404),
    },
  });
  router.delete("/:sessionID", validator("param", z.object({ sessionID: Session.RemoveInput.zod })), async (req, res, next) => {
    try {
      await jsonRequest("SessionRoutes.delete", req, res, function* () {
        const sessionID = req.valid.param.sessionID;
        const svc = yield* Session.Service;
        yield* svc.remove(sessionID);
        return true;
      });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /:sessionID — Update session
  describe("patch", "/:sessionID", {
    summary: "Update session",
    description: "Update properties of an existing session, such as title or other metadata.",
    operationId: "session.update",
    responses: {
      200: {
        description: "Successfully updated session",
        content: { "application/json": { schema: Session.Info.zod } },
      },
      ...errors(400, 404),
    },
  });
  router.patch(
    "/:sessionID",
    validator("param", z.object({ sessionID: SessionID.zod })),
    validator(
      "json",
      z.object({
        title: z.string().optional(),
        permission: Permission.Ruleset.zod.optional(),
        time: z.object({ archived: z.number().optional() }).optional(),
      }),
    ),
    async (req, res, next) => {
      try {
        await jsonRequest("SessionRoutes.update", req, res, function* () {
          const sessionID = req.valid.param.sessionID;
          const updates = req.valid.json;
          const session = yield* Session.Service;
          const current = yield* session.get(sessionID);
          if (updates.title !== undefined) {
            yield* session.setTitle({ sessionID, title: updates.title });
          }
          if (updates.permission !== undefined) {
            yield* session.setPermission({
              sessionID,
              permission: Permission.merge(current.permission ?? [], updates.permission),
            });
          }
          if (updates.time?.archived !== undefined) {
            yield* session.setArchived({ sessionID, time: updates.time.archived });
          }
          return yield* session.get(sessionID);
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /:sessionID/init — Initialize session
  // TODO(v2): remove this dedicated route and rely on the normal `/init` command flow.
  describe("post", "/:sessionID/init", {
    summary: "Initialize session",
    description: "Analyze the current application and create an AGENTS.md file with project-specific agent configurations.",
    operationId: "session.init",
    responses: {
      200: {
        description: "200",
        content: { "application/json": { schema: z.boolean() } },
      },
      ...errors(400, 404),
    },
  });
  router.post(
    "/:sessionID/init",
    validator("param", z.object({ sessionID: SessionID.zod })),
    validator("json", z.object({ modelID: ModelID.zod, providerID: ProviderID.zod, messageID: MessageID.zod })),
    async (req, res, next) => {
      try {
        await jsonRequest("SessionRoutes.init", req, res, function* () {
          const sessionID = req.valid.param.sessionID;
          const body = req.valid.json;
          const svc = yield* SessionPrompt.Service;
          yield* svc.command({
            sessionID,
            messageID: body.messageID,
            model: body.providerID + "/" + body.modelID,
            command: Command.Default.INIT,
            arguments: "",
          });
          return true;
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /:sessionID/fork — Fork session
  describe("post", "/:sessionID/fork", {
    summary: "Fork session",
    description: "Create a new session by forking an existing session at a specific message point.",
    operationId: "session.fork",
    responses: {
      200: {
        description: "200",
        content: { "application/json": { schema: Session.Info.zod } },
      },
    },
  });
  router.post(
    "/:sessionID/fork",
    validator("param", z.object({ sessionID: SessionID.zod })),
    validator("json", zodObject(Session.ForkInput).omit({ sessionID: true })),
    async (req, res, next) => {
      try {
        await jsonRequest("SessionRoutes.fork", req, res, function* () {
          const sessionID = req.valid.param.sessionID;
          const body = req.valid.json;
          const svc = yield* Session.Service;
          return yield* svc.fork({ ...body, sessionID });
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /:sessionID/abort — Abort session
  describe("post", "/:sessionID/abort", {
    summary: "Abort session",
    description: "Abort an active session and stop any ongoing AI processing or command execution.",
    operationId: "session.abort",
    responses: {
      200: {
        description: "Aborted session",
        content: { "application/json": { schema: z.boolean() } },
      },
      ...errors(400, 404),
    },
  });
  router.post("/:sessionID/abort", validator("param", z.object({ sessionID: SessionID.zod })), async (req, res, next) => {
    try {
      await jsonRequest("SessionRoutes.abort", req, res, function* () {
        const svc = yield* SessionPrompt.Service;
        yield* svc.cancel(req.valid.param.sessionID);
        return true;
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /:sessionID/share — Share session
  describe("post", "/:sessionID/share", {
    summary: "Share session",
    description: "Create a shareable link for a session, allowing others to view the conversation.",
    operationId: "session.share",
    responses: {
      200: {
        description: "Successfully shared session",
        content: { "application/json": { schema: Session.Info.zod } },
      },
      ...errors(400, 404),
    },
  });
  router.post("/:sessionID/share", validator("param", z.object({ sessionID: SessionID.zod })), async (req, res, next) => {
    try {
      await jsonRequest("SessionRoutes.share", req, res, function* () {
        const sessionID = req.valid.param.sessionID;
        const share = yield* SessionShare.Service;
        const session = yield* Session.Service;
        yield* share.share(sessionID);
        return yield* session.get(sessionID);
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /:sessionID/diff — Get message diff
  describe("get", "/:sessionID/diff", {
    summary: "Get message diff",
    description: "Get the file changes (diff) that resulted from a specific user message in the session.",
    operationId: "session.diff",
    responses: {
      200: {
        description: "Successfully retrieved diff",
        content: { "application/json": { schema: Snapshot.FileDiff.zod.array() } },
      },
    },
  });
  router.get(
    "/:sessionID/diff",
    validator("param", z.object({ sessionID: SessionID.zod })),
    validator("query", zodObject(SessionSummary.DiffInput).omit({ sessionID: true })),
    async (req, res, next) => {
      try {
        await jsonRequest("SessionRoutes.diff", req, res, function* () {
          const query = req.valid.query;
          const params = req.valid.param;
          const summary = yield* SessionSummary.Service;
          return yield* summary.diff({ sessionID: params.sessionID, messageID: query.messageID });
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // DELETE /:sessionID/share — Unshare session
  describe("delete", "/:sessionID/share", {
    summary: "Unshare session",
    description: "Remove the shareable link for a session, making it private again.",
    operationId: "session.unshare",
    responses: {
      200: {
        description: "Successfully unshared session",
        content: { "application/json": { schema: Session.Info.zod } },
      },
      ...errors(400, 404),
    },
  });
  router.delete("/:sessionID/share", validator("param", z.object({ sessionID: SessionID.zod })), async (req, res, next) => {
    try {
      await jsonRequest("SessionRoutes.unshare", req, res, function* () {
        const sessionID = req.valid.param.sessionID;
        const share = yield* SessionShare.Service;
        const session = yield* Session.Service;
        yield* share.unshare(sessionID);
        return yield* session.get(sessionID);
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /:sessionID/summarize — Summarize session
  describe("post", "/:sessionID/summarize", {
    summary: "Summarize session",
    description: "Generate a concise summary of the session using AI compaction to preserve key information.",
    operationId: "session.summarize",
    responses: {
      200: {
        description: "Summarized session",
        content: { "application/json": { schema: z.boolean() } },
      },
      ...errors(400, 404),
    },
  });
  router.post(
    "/:sessionID/summarize",
    validator("param", z.object({ sessionID: SessionID.zod })),
    validator(
      "json",
      z.object({
        providerID: ProviderID.zod,
        modelID: ModelID.zod,
        auto: z.boolean().optional().default(false),
      }),
    ),
    async (req, res, next) => {
      try {
        await jsonRequest("SessionRoutes.summarize", req, res, function* () {
          const sessionID = req.valid.param.sessionID;
          const body = req.valid.json;
          const session = yield* Session.Service;
          const revert = yield* SessionRevert.Service;
          const compact = yield* SessionCompaction.Service;
          const prompt = yield* SessionPrompt.Service;
          const agent = yield* Agent.Service;
          yield* revert.cleanup(yield* session.get(sessionID));
          const msgs = yield* session.messages({ sessionID });
          const defaultAgent = yield* agent.defaultAgent();
          let currentAgent = defaultAgent;
          for (let i = msgs.length - 1; i >= 0; i--) {
            const info = msgs[i].info;
            if (info.role === "user") {
              currentAgent = info.agent || defaultAgent;
              break;
            }
          }
          yield* compact.create({
            sessionID,
            agent: currentAgent,
            model: { providerID: body.providerID, modelID: body.modelID },
            auto: body.auto,
          });
          yield* prompt.loop({ sessionID });
          return true;
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /:sessionID/message — Get session messages
  describe("get", "/:sessionID/message", {
    summary: "Get session messages",
    description: "Retrieve all messages in a session, including user prompts and AI responses.",
    operationId: "session.messages",
    responses: {
      200: {
        description: "List of messages",
        content: { "application/json": { schema: MessageV2.WithParts.zod.array() } },
      },
      ...errors(400, 404),
    },
  });
  router.get(
    "/:sessionID/message",
    validator("param", z.object({ sessionID: SessionID.zod })),
    validator(
      "query",
      z
        .object({
          limit: z.coerce.number().int().min(0).optional().meta({ description: "Maximum number of messages to return" }),
          before: z
            .string()
            .optional()
            .meta({ description: "Opaque cursor for loading older messages" })
            .refine(
              (value) => {
                if (!value) return true;
                try {
                  MessageV2.cursor.decode(value);
                  return true;
                } catch {
                  return false;
                }
              },
              { message: "Invalid cursor" },
            ),
        })
        .refine((value) => !value.before || value.limit !== undefined, {
          message: "before requires limit",
          path: ["before"],
        }),
    ),
    async (req, res, next) => {
      try {
        const query = req.valid.query;
        const sessionID = req.valid.param.sessionID;
        if (query.limit === undefined || query.limit === 0) {
          const messages = await runRequest(
            "SessionRoutes.messages",
            req,
            Effect.gen(function* () {
              const session = yield* Session.Service;
              yield* session.get(sessionID);
              return yield* session.messages({ sessionID });
            }),
          );
          return res.json(messages);
        }
        const page = await MessageV2.page({ sessionID, limit: query.limit, before: query.before });
        if (page.cursor) {
          const url = new URL(req.protocol + "://" + req.get("host") + req.originalUrl);
          url.searchParams.set("limit", query.limit.toString());
          url.searchParams.set("before", page.cursor);
          res.set("Access-Control-Expose-Headers", "Link, X-Next-Cursor");
          res.set("Link", `<${url.toString()}>; rel="next"`);
          res.set("X-Next-Cursor", page.cursor);
        }
        res.json(page.items);
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /:sessionID/message/:messageID — Get message
  describe("get", "/:sessionID/message/:messageID", {
    summary: "Get message",
    description: "Retrieve a specific message from a session by its message ID.",
    operationId: "session.message",
    responses: {
      200: {
        description: "Message",
        content: {
          "application/json": {
            schema: z.object({
              info: MessageV2.Info.zod,
              parts: MessageV2.Part.zod.array(),
            }),
          },
        },
      },
      ...errors(400, 404),
    },
  });
  router.get(
    "/:sessionID/message/:messageID",
    validator("param", z.object({ sessionID: SessionID.zod, messageID: MessageID.zod })),
    async (req, res, next) => {
      try {
        const params = req.valid.param;
        const message = await MessageV2.get({ sessionID: params.sessionID, messageID: params.messageID });
        res.json(message);
      } catch (err) {
        next(err);
      }
    },
  );

  // DELETE /:sessionID/message/:messageID — Delete message
  describe("delete", "/:sessionID/message/:messageID", {
    summary: "Delete message",
    description:
      "Permanently delete a specific message (and all of its parts) from a session. This does not revert any file changes that may have been made while processing the message.",
    operationId: "session.deleteMessage",
    responses: {
      200: {
        description: "Successfully deleted message",
        content: { "application/json": { schema: z.boolean() } },
      },
      ...errors(400, 404),
    },
  });
  router.delete(
    "/:sessionID/message/:messageID",
    validator("param", z.object({ sessionID: SessionID.zod, messageID: MessageID.zod })),
    async (req, res, next) => {
      try {
        await jsonRequest("SessionRoutes.deleteMessage", req, res, function* () {
          const params = req.valid.param;
          const state = yield* SessionRunState.Service;
          const session = yield* Session.Service;
          yield* state.assertNotBusy(params.sessionID);
          yield* session.removeMessage({ sessionID: params.sessionID, messageID: params.messageID });
          return true;
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // DELETE /:sessionID/message/:messageID/part/:partID — Delete part
  describe("delete", "/:sessionID/message/:messageID/part/:partID", {
    description: "Delete a part from a message",
    operationId: "part.delete",
    responses: {
      200: {
        description: "Successfully deleted part",
        content: { "application/json": { schema: z.boolean() } },
      },
      ...errors(400, 404),
    },
  });
  router.delete(
    "/:sessionID/message/:messageID/part/:partID",
    validator("param", z.object({ sessionID: SessionID.zod, messageID: MessageID.zod, partID: PartID.zod })),
    async (req, res, next) => {
      try {
        await jsonRequest("SessionRoutes.deletePart", req, res, function* () {
          const params = req.valid.param;
          const svc = yield* Session.Service;
          yield* svc.removePart({ sessionID: params.sessionID, messageID: params.messageID, partID: params.partID });
          return true;
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // PATCH /:sessionID/message/:messageID/part/:partID — Update part
  describe("patch", "/:sessionID/message/:messageID/part/:partID", {
    description: "Update a part in a message",
    operationId: "part.update",
    responses: {
      200: {
        description: "Successfully updated part",
        content: { "application/json": { schema: MessageV2.Part.zod } },
      },
      ...errors(400, 404),
    },
  });
  router.patch(
    "/:sessionID/message/:messageID/part/:partID",
    validator("param", z.object({ sessionID: SessionID.zod, messageID: MessageID.zod, partID: PartID.zod })),
    validator("json", MessageV2.Part.zod),
    async (req, res, next) => {
      try {
        const params = req.valid.param;
        const body = req.valid.json;
        if (body.id !== params.partID || body.messageID !== params.messageID || body.sessionID !== params.sessionID) {
          throw new Error(
            `Part mismatch: body.id='${body.id}' vs partID='${params.partID}', body.messageID='${body.messageID}' vs messageID='${params.messageID}', body.sessionID='${body.sessionID}' vs sessionID='${params.sessionID}'`,
          );
        }
        await jsonRequest("SessionRoutes.updatePart", req, res, function* () {
          const svc = yield* Session.Service;
          return yield* svc.updatePart(body);
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /:sessionID/message — Send message (returns the AI response).
  // Runs the prompt first, then commits status 200 + Content-Type and writes the
  // JSON payload. Headers are NOT pre-flushed: if prompt() fails (e.g. no
  // provider configured) the error must still flow through ErrorMiddleware as a
  // normal framed HTTP error, matching the Effect httpapi stream which only
  // emits headers once the first chunk is produced.
  describe("post", "/:sessionID/message", {
    summary: "Send message",
    description: "Create and send a new message to a session, streaming the AI response.",
    operationId: "session.prompt",
    responses: {
      200: {
        description: "Created message",
        content: {
          "application/json": {
            schema: z.object({
              info: MessageV2.Assistant.zod,
              parts: MessageV2.Part.zod.array(),
            }),
          },
        },
      },
      ...errors(400, 404),
    },
  });
  router.post(
    "/:sessionID/message",
    validator("param", z.object({ sessionID: SessionID.zod })),
    validator("json", zodObject(SessionPrompt.PromptInput).omit({ sessionID: true })),
    async (req, res, next) => {
      try {
        const sessionID = req.valid.param.sessionID;
        const body = req.valid.json;
        const msg = await runRequest(
          "SessionRoutes.prompt",
          req,
          SessionPrompt.Service.use((svc) => svc.prompt({ ...body, sessionID })),
        );
        // Commit the response only after prompt() resolves.
        res.status(200);
        res.set("Content-Type", "application/json");
        res.write(JSON.stringify(msg));
        res.end();
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /:sessionID/prompt_async — Send async message (fire-and-forget, 204).
  describe("post", "/:sessionID/prompt_async", {
    summary: "Send async message",
    description:
      "Create and send a new message to a session asynchronously, starting the session if needed and returning immediately.",
    operationId: "session.prompt_async",
    responses: {
      204: { description: "Prompt accepted" },
      ...errors(400, 404),
    },
  });
  router.post(
    "/:sessionID/prompt_async",
    validator("param", z.object({ sessionID: SessionID.zod })),
    validator("json", zodObject(SessionPrompt.PromptInput).omit({ sessionID: true })),
    async (req, res, next) => {
      try {
        const sessionID = req.valid.param.sessionID;
        const body = req.valid.json;
        void runRequest(
          "SessionRoutes.prompt_async",
          req,
          SessionPrompt.Service.use((svc) => svc.prompt({ ...body, sessionID })),
        ).catch((err) => {
          log.error("prompt_async failed", { sessionID, error: err });
          void Bus.publish(Session.Event.Error, {
            sessionID,
            error: new NamedError.Unknown({
              message: err instanceof Error ? err.message : String(err),
            }).toObject(),
          });
        });
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /:sessionID/command — Send command
  describe("post", "/:sessionID/command", {
    summary: "Send command",
    description: "Send a new command to a session for execution by the AI assistant.",
    operationId: "session.command",
    responses: {
      200: {
        description: "Created message",
        content: {
          "application/json": {
            schema: z.object({
              info: MessageV2.Assistant.zod,
              parts: MessageV2.Part.zod.array(),
            }),
          },
        },
      },
      ...errors(400, 404),
    },
  });
  router.post(
    "/:sessionID/command",
    validator("param", z.object({ sessionID: SessionID.zod })),
    validator("json", zodObject(SessionPrompt.CommandInput).omit({ sessionID: true })),
    async (req, res, next) => {
      try {
        await jsonRequest("SessionRoutes.command", req, res, function* () {
          const sessionID = req.valid.param.sessionID;
          const body = req.valid.json;
          const svc = yield* SessionPrompt.Service;
          return yield* svc.command({ ...body, sessionID });
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /:sessionID/shell — Run shell command
  describe("post", "/:sessionID/shell", {
    summary: "Run shell command",
    description: "Execute a shell command within the session context and return the AI's response.",
    operationId: "session.shell",
    responses: {
      200: {
        description: "Created message",
        content: { "application/json": { schema: MessageV2.WithParts.zod } },
      },
      ...errors(400, 404),
    },
  });
  router.post(
    "/:sessionID/shell",
    validator("param", z.object({ sessionID: SessionID.zod })),
    validator("json", zodObject(SessionPrompt.ShellInput).omit({ sessionID: true })),
    async (req, res, next) => {
      try {
        await jsonRequest("SessionRoutes.shell", req, res, function* () {
          const sessionID = req.valid.param.sessionID;
          const body = req.valid.json;
          const svc = yield* SessionPrompt.Service;
          return yield* svc.shell({ ...body, sessionID });
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /:sessionID/revert — Revert message
  describe("post", "/:sessionID/revert", {
    summary: "Revert message",
    description: "Revert a specific message in a session, undoing its effects and restoring the previous state.",
    operationId: "session.revert",
    responses: {
      200: {
        description: "Updated session",
        content: { "application/json": { schema: Session.Info.zod } },
      },
      ...errors(400, 404),
    },
  });
  router.post(
    "/:sessionID/revert",
    validator("param", z.object({ sessionID: SessionID.zod })),
    validator("json", zodObject(SessionRevert.RevertInput).omit({ sessionID: true })),
    async (req, res, next) => {
      try {
        const sessionID = req.valid.param.sessionID;
        const body = req.valid.json;
        log.info("revert", body);
        await jsonRequest("SessionRoutes.revert", req, res, function* () {
          const svc = yield* SessionRevert.Service;
          return yield* svc.revert({ sessionID, ...body });
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /:sessionID/unrevert — Restore reverted messages
  describe("post", "/:sessionID/unrevert", {
    summary: "Restore reverted messages",
    description: "Restore all previously reverted messages in a session.",
    operationId: "session.unrevert",
    responses: {
      200: {
        description: "Updated session",
        content: { "application/json": { schema: Session.Info.zod } },
      },
      ...errors(400, 404),
    },
  });
  router.post("/:sessionID/unrevert", validator("param", z.object({ sessionID: SessionID.zod })), async (req, res, next) => {
    try {
      await jsonRequest("SessionRoutes.unrevert", req, res, function* () {
        const sessionID = req.valid.param.sessionID;
        const svc = yield* SessionRevert.Service;
        return yield* svc.unrevert({ sessionID });
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /:sessionID/permissions/:permissionID — Respond to permission (deprecated)
  describe("post", "/:sessionID/permissions/:permissionID", {
    summary: "Respond to permission",
    deprecated: true,
    description: "Approve or deny a permission request from the AI assistant.",
    operationId: "permission.respond",
    responses: {
      200: {
        description: "Permission processed successfully",
        content: { "application/json": { schema: z.boolean() } },
      },
      ...errors(400, 404),
    },
  });
  router.post(
    "/:sessionID/permissions/:permissionID",
    validator("param", z.object({ sessionID: SessionID.zod, permissionID: PermissionID.zod })),
    validator("json", z.object({ response: Permission.Reply.zod })),
    async (req, res, next) => {
      try {
        await jsonRequest("SessionRoutes.permissionRespond", req, res, function* () {
          const params = req.valid.param;
          const svc = yield* Permission.Service;
          yield* svc.reply({ requestID: params.permissionID, reply: req.valid.json.response });
          return true;
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
