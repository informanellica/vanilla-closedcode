// Express route group for the experimental instance endpoints (11 ops).
import express from "express";
import { Effect, Option } from "effect";
import z from "zod";
import * as EffectZod from "#util/effect-zod.js";
import { ProviderID, ModelID } from "#provider/schema.js";
import { ToolRegistry } from "#tool/registry.js";
import { Worktree } from "#worktree/index.js";
import { Instance } from "#project/instance.js";
import { Project } from "#project/project.js";
import { MCP } from "#mcp/index.js";
import { Session } from "#session/session.js";
import { Config } from "#config/config.js";
import { ConsoleState } from "#config/console-state.js";
import { Account } from "#account/account.js";
import { AccountID, OrgID } from "#account/schema.js";
import { Agent } from "#agent/agent.js";
import { AppRuntime } from "#effect/app-runtime.js";
import { registerOperation } from "../../express/openapi.js";
import { validator } from "../../express/validate.js";
import { errors } from "../../express/errors.js";

const ConsoleOrgOption = z.object({
  accountID: z.string(),
  accountEmail: z.string(),
  accountUrl: z.string(),
  orgID: z.string(),
  orgName: z.string(),
  active: z.boolean(),
});
const ConsoleOrgList = z.object({
  orgs: z.array(ConsoleOrgOption),
});
const ConsoleSwitchBody = z.object({
  accountID: z.string(),
  orgID: z.string(),
});
const QueryBoolean = z.union([z.preprocess(value => value === "true" ? true : value === "false" ? false : value, z.boolean()), z.enum(["true", "false"])]);
function queryBoolean(value) {
  if (value === undefined) return;
  return value === true || value === "true";
}

// Local equivalents of trace.js requestAttributes/runRequest/jsonRequest.
// Mirrors the OTel attribute naming (`fooID` -> `foo.id`, else `closedcode.<key>`).
function paramToAttributeKey(key) {
  const m = key.match(/^(.+)ID$/);
  if (m) return `${m[1].toLowerCase()}.id`;
  return `closedcode.${key}`;
}
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
function runRequestExpress(name, req, effect) {
  return AppRuntime.runPromise(effect.pipe(Effect.withSpan(name, {
    attributes: requestAttributes(req),
  })));
}
async function jsonRequestExpress(name, req, res, genFn) {
  res.json(await runRequestExpress(name, req, Effect.gen(genFn)));
}

export function ExperimentalRoutes(registry) {
  const router = express.Router();

  // Helper that registers a route's openapi metadata against the group mount ("/experimental").
  const describe = (method, path, meta) => registry && registerOperation(registry, method, "/experimental" + path, meta);

  describe("get", "/console", {
    summary: "Get active Console provider metadata",
    description: "Get the active Console org name and the set of provider IDs managed by that Console org.",
    operationId: "experimental.console.get",
    responses: {
      200: {
        description: "Active Console provider metadata",
        content: { "application/json": { schema: ConsoleState.zod } },
      },
    },
  });
  router.get("/console", async (req, res, next) => {
    try {
      await jsonRequestExpress("ExperimentalRoutes.console.get", req, res, function* () {
        const config = yield* Config.Service;
        const account = yield* Account.Service;
        const [state, groups] = yield* Effect.all([config.getConsoleState(), account.orgsByAccount()], {
          concurrency: "unbounded",
        });
        return {
          ...state,
          switchableOrgCount: groups.reduce((count, group) => count + group.orgs.length, 0),
        };
      });
    } catch (err) {
      next(err);
    }
  });

  describe("get", "/console/orgs", {
    summary: "List switchable Console orgs",
    description: "Get the available Console orgs across logged-in accounts, including the current active org.",
    operationId: "experimental.console.listOrgs",
    responses: {
      200: {
        description: "Switchable Console orgs",
        content: { "application/json": { schema: ConsoleOrgList } },
      },
    },
  });
  router.get("/console/orgs", async (req, res, next) => {
    try {
      await jsonRequestExpress("ExperimentalRoutes.console.listOrgs", req, res, function* () {
        const account = yield* Account.Service;
        const [groups, active] = yield* Effect.all([account.orgsByAccount(), account.active()], {
          concurrency: "unbounded",
        });
        const info = Option.getOrUndefined(active);
        const orgs = groups.flatMap(group => group.orgs.map(org => ({
          accountID: group.account.id,
          accountEmail: group.account.email,
          accountUrl: group.account.url,
          orgID: org.id,
          orgName: org.name,
          active: !!info && info.id === group.account.id && info.active_org_id === org.id,
        })));
        return { orgs };
      });
    } catch (err) {
      next(err);
    }
  });

  describe("post", "/console/switch", {
    summary: "Switch active Console org",
    description: "Persist a new active Console account/org selection for the current local ClosedCode state.",
    operationId: "experimental.console.switchOrg",
    responses: {
      200: {
        description: "Switch success",
        content: { "application/json": { schema: z.boolean() } },
      },
    },
  });
  router.post("/console/switch", validator("json", ConsoleSwitchBody), async (req, res, next) => {
    try {
      await jsonRequestExpress("ExperimentalRoutes.console.switchOrg", req, res, function* () {
        const body = req.valid.json;
        const account = yield* Account.Service;
        yield* account.use(AccountID.make(body.accountID), Option.some(OrgID.make(body.orgID)));
        return true;
      });
    } catch (err) {
      next(err);
    }
  });

  describe("get", "/tool/ids", {
    summary: "List tool IDs",
    description: "Get a list of all available tool IDs, including both built-in tools and dynamically registered tools.",
    operationId: "tool.ids",
    responses: {
      200: {
        description: "Tool IDs",
        content: { "application/json": { schema: z.array(z.string()).meta({ ref: "ToolIDs" }) } },
      },
      ...errors(400),
    },
  });
  router.get("/tool/ids", async (req, res, next) => {
    try {
      await jsonRequestExpress("ExperimentalRoutes.tool.ids", req, res, function* () {
        const registry = yield* ToolRegistry.Service;
        return yield* registry.ids();
      });
    } catch (err) {
      next(err);
    }
  });

  describe("get", "/tool", {
    summary: "List tools",
    description: "Get a list of available tools with their JSON schema parameters for a specific provider and model combination.",
    operationId: "tool.list",
    responses: {
      200: {
        description: "Tools",
        content: {
          "application/json": {
            schema: z.array(z.object({
              id: z.string(),
              description: z.string(),
              parameters: z.any(),
            }).meta({ ref: "ToolListItem" })).meta({ ref: "ToolList" }),
          },
        },
      },
      ...errors(400),
    },
  });
  router.get("/tool", validator("query", z.object({
    provider: z.string(),
    model: z.string(),
  })), async (req, res, next) => {
    try {
      const { provider, model } = req.valid.query;
      const tools = await runRequestExpress("ExperimentalRoutes.tool.list", req, Effect.gen(function* () {
        const agents = yield* Agent.Service;
        const registry = yield* ToolRegistry.Service;
        return yield* registry.tools({
          providerID: ProviderID.make(provider),
          modelID: ModelID.make(model),
          agent: yield* agents.get(yield* agents.defaultAgent()),
        });
      }));
      res.json(tools.map(t => ({
        id: t.id,
        description: t.description,
        parameters: EffectZod.toJsonSchema(t.parameters),
      })));
    } catch (err) {
      next(err);
    }
  });

  describe("post", "/worktree", {
    summary: "Create worktree",
    description: "Create a new git worktree for the current project and run any configured startup scripts.",
    operationId: "worktree.create",
    responses: {
      200: {
        description: "Worktree created",
        content: { "application/json": { schema: Worktree.Info.zod } },
      },
      ...errors(400),
    },
  });
  router.post("/worktree", validator("json", Worktree.CreateInput.zod.optional()), async (req, res, next) => {
    try {
      await jsonRequestExpress("ExperimentalRoutes.worktree.create", req, res, function* () {
        const body = req.valid.json;
        const svc = yield* Worktree.Service;
        return yield* svc.create(body);
      });
    } catch (err) {
      next(err);
    }
  });

  describe("get", "/worktree", {
    summary: "List worktrees",
    description: "List all sandbox worktrees for the current project.",
    operationId: "worktree.list",
    responses: {
      200: {
        description: "List of worktree directories",
        content: { "application/json": { schema: z.array(z.string()) } },
      },
    },
  });
  router.get("/worktree", async (req, res, next) => {
    try {
      await jsonRequestExpress("ExperimentalRoutes.worktree.list", req, res, function* () {
        const svc = yield* Project.Service;
        return yield* svc.sandboxes(Instance.project.id);
      });
    } catch (err) {
      next(err);
    }
  });

  describe("delete", "/worktree", {
    summary: "Remove worktree",
    description: "Remove a git worktree and delete its branch.",
    operationId: "worktree.remove",
    responses: {
      200: {
        description: "Worktree removed",
        content: { "application/json": { schema: z.boolean() } },
      },
      ...errors(400),
    },
  });
  router.delete("/worktree", validator("json", Worktree.RemoveInput.zod), async (req, res, next) => {
    try {
      await jsonRequestExpress("ExperimentalRoutes.worktree.remove", req, res, function* () {
        const body = req.valid.json;
        const worktree = yield* Worktree.Service;
        const project = yield* Project.Service;
        yield* worktree.remove(body);
        yield* project.removeSandbox(Instance.project.id, body.directory);
        return true;
      });
    } catch (err) {
      next(err);
    }
  });

  describe("post", "/worktree/reset", {
    summary: "Reset worktree",
    description: "Reset a worktree branch to the primary default branch.",
    operationId: "worktree.reset",
    responses: {
      200: {
        description: "Worktree reset",
        content: { "application/json": { schema: z.boolean() } },
      },
      ...errors(400),
    },
  });
  router.post("/worktree/reset", validator("json", Worktree.ResetInput.zod), async (req, res, next) => {
    try {
      await jsonRequestExpress("ExperimentalRoutes.worktree.reset", req, res, function* () {
        const body = req.valid.json;
        const svc = yield* Worktree.Service;
        yield* svc.reset(body);
        return true;
      });
    } catch (err) {
      next(err);
    }
  });

  describe("get", "/session", {
    summary: "List sessions",
    description: "Get a list of all ClosedCode sessions across projects, sorted by most recently updated. Archived sessions are excluded by default.",
    operationId: "experimental.session.list",
    responses: {
      200: {
        description: "List of sessions",
        content: { "application/json": { schema: Session.GlobalInfo.zod.array() } },
      },
    },
  });
  router.get("/session", validator("query", z.object({
    directory: z.string().optional().meta({
      description: "Filter sessions by project directory",
    }),
    roots: QueryBoolean.optional().meta({
      description: "Only return root sessions (no parentID)",
    }),
    start: z.coerce.number().optional().meta({
      description: "Filter sessions updated on or after this timestamp (milliseconds since epoch)",
    }),
    cursor: z.coerce.number().optional().meta({
      description: "Return sessions updated before this timestamp (milliseconds since epoch)",
    }),
    search: z.string().optional().meta({
      description: "Filter sessions by title (case-insensitive)",
    }),
    limit: z.coerce.number().optional().meta({
      description: "Maximum number of sessions to return",
    }),
    archived: QueryBoolean.optional().meta({
      description: "Include archived sessions (default false)",
    }),
  })), async (req, res, next) => {
    try {
      const query = req.valid.query;
      const limit = query.limit ?? 100;
      const sessions = [];
      for await (const session of Session.listGlobal({
        directory: query.directory,
        roots: queryBoolean(query.roots),
        start: query.start,
        cursor: query.cursor,
        search: query.search,
        limit: limit + 1,
        archived: queryBoolean(query.archived),
      })) {
        sessions.push(session);
      }
      const hasMore = sessions.length > limit;
      const list = hasMore ? sessions.slice(0, limit) : sessions;
      if (hasMore && list.length > 0) {
        res.set("x-next-cursor", String(list[list.length - 1].time.updated));
      }
      res.json(list);
    } catch (err) {
      next(err);
    }
  });

  describe("get", "/resource", {
    summary: "Get MCP resources",
    description: "Get all available MCP resources from connected servers. Optionally filter by name.",
    operationId: "experimental.resource.list",
    responses: {
      200: {
        description: "MCP resources",
        content: { "application/json": { schema: z.record(z.string(), MCP.Resource.zod) } },
      },
    },
  });
  router.get("/resource", async (req, res, next) => {
    try {
      await jsonRequestExpress("ExperimentalRoutes.resource.list", req, res, function* () {
        const mcp = yield* MCP.Service;
        return yield* mcp.resources();
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
