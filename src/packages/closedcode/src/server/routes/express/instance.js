// Express InstanceRoutes: mounts all instance route groups on a single Router and
// handles the inline instance-root routes (/instance/dispose, /path, /vcs, etc.).
import express from "express";
import { Effect } from "effect";
import z from "zod";
import { AppRuntime } from "@/effect/app-runtime.js";
import { Format } from "@/format/index.js";
import { Instance } from "@/project/instance.js";
import { InstanceRuntime } from "@/project/instance-runtime.js";
import { Vcs } from "@/project/vcs.js";
import { Agent } from "@/agent/agent.js";
import { Skill } from "@/skill/index.js";
import { Global } from "core/global";
import { LSP } from "@/lsp/lsp.js";
import { Command } from "@/command/index.js";
import { paramToAttributeKey } from "../instance/trace.js";
import { registerOperation } from "../../express/openapi.js";
import { validator } from "../../express/validate.js";
import { ConfigRoutes } from "./config.js";
import { ProviderRoutes } from "./provider.js";
import { TuiRoutes } from "./tui.js";
import { ProjectRoutes } from "./project.js";
import { FileRoutes } from "./file.js";
import { PermissionRoutes } from "./permission.js";
import { QuestionRoutes } from "./question.js";
import { McpRoutes } from "./mcp.js";
import { ExperimentalRoutes } from "./experimental.js";
import { SyncRoutes } from "./sync.js";
import { SessionRoutes } from "./session.js";
import { EventRoutes } from "./event.js";
import { PtyRoutes } from "./pty.js";

// OTel span attributes for an Express request; mirrors routes/instance/trace.js requestAttributes.
function requestAttributes(req) {
  const attributes = { "http.method": req.method, "http.path": req.baseUrl + req.path };
  for (const [key, value] of Object.entries(req.params ?? {})) {
    attributes[paramToAttributeKey(key)] = value;
  }
  return attributes;
}

// Run an Effect generator inside an OTel span built from the request, then res.json() the result.
async function jsonRequest(name, req, res, gen) {
  const result = await AppRuntime.runPromise(Effect.gen(gen).pipe(Effect.withSpan(name, { attributes: requestAttributes(req) })));
  res.json(result);
}

export function InstanceRoutes(registry, upgradeWebSocket) {
  const router = express.Router();

  router.use("/project", ProjectRoutes(registry));
  router.use("/pty", PtyRoutes(registry, upgradeWebSocket));
  router.use("/config", ConfigRoutes(registry));
  router.use("/experimental", ExperimentalRoutes(registry));
  router.use("/session", SessionRoutes(registry));
  router.use("/permission", PermissionRoutes(registry));
  router.use("/question", QuestionRoutes(registry));
  router.use("/provider", ProviderRoutes(registry));
  router.use("/sync", SyncRoutes(registry));
  // FileRoutes and EventRoutes declare their full paths internally, so they mount at "/".
  router.use("/", FileRoutes(registry));
  router.use("/", EventRoutes(registry));
  router.use("/mcp", McpRoutes(registry));
  router.use("/tui", TuiRoutes(registry));

  // Inline instance-root routes (ported from routes/instance/index.js).
  // Mounted at the instance root, so OpenAPI paths are the bare paths.
  const describe = (method, path, meta) => registry && registerOperation(registry, method, path, meta);
  const json = (code, description, schema) => ({ [code]: { description, content: { "application/json": { schema } } } });

  describe("post", "/instance/dispose", {
    summary: "Dispose instance",
    description: "Clean up and dispose the current ClosedCode instance, releasing all resources.",
    operationId: "instance.dispose",
    responses: json(200, "Instance disposed", z.boolean()),
  });
  router.post("/instance/dispose", async (req, res, next) => {
    try {
      await InstanceRuntime.disposeInstance(Instance.current);
      res.json(true);
    } catch (err) { next(err); }
  });

  describe("get", "/path", {
    summary: "Get paths",
    description: "Retrieve the current working directory and related path information for the ClosedCode instance.",
    operationId: "path.get",
    responses: json(200, "Path", z.object({
      home: z.string(), state: z.string(), config: z.string(), worktree: z.string(), directory: z.string(),
    }).meta({ ref: "Path" })),
  });
  router.get("/path", async (req, res, next) => {
    try {
      res.json({
        home: Global.Path.home,
        state: Global.Path.state,
        config: Global.Path.config,
        worktree: Instance.worktree,
        directory: Instance.directory,
      });
    } catch (err) { next(err); }
  });

  describe("get", "/vcs", {
    summary: "Get VCS info",
    description: "Retrieve version control system (VCS) information for the current project, such as git branch.",
    operationId: "vcs.get",
    responses: json(200, "VCS info", Vcs.Info.zod),
  });
  router.get("/vcs", async (req, res, next) => {
    try {
      await jsonRequest("InstanceRoutes.vcs.get", req, res, function* () {
        const vcs = yield* Vcs.Service;
        const [branch, default_branch] = yield* Effect.all([vcs.branch(), vcs.defaultBranch()], { concurrency: 2 });
        return { branch, default_branch };
      });
    } catch (err) { next(err); }
  });

  describe("get", "/vcs/diff", {
    summary: "Get VCS diff",
    description: "Retrieve the current git diff for the working tree or against the default branch.",
    operationId: "vcs.diff",
    responses: json(200, "VCS diff", Vcs.FileDiff.zod.array()),
  });
  router.get("/vcs/diff", validator("query", z.object({ mode: Vcs.Mode.zod })), async (req, res, next) => {
    try {
      await jsonRequest("InstanceRoutes.vcs.diff", req, res, function* () {
        const vcs = yield* Vcs.Service;
        return yield* vcs.diff(req.valid.query.mode);
      });
    } catch (err) { next(err); }
  });

  describe("get", "/command", {
    summary: "List commands",
    description: "Get a list of all available commands in the ClosedCode system.",
    operationId: "command.list",
    responses: json(200, "List of commands", Command.Info.zod.array()),
  });
  router.get("/command", async (req, res, next) => {
    try {
      await jsonRequest("InstanceRoutes.command.list", req, res, function* () {
        const svc = yield* Command.Service;
        return yield* svc.list();
      });
    } catch (err) { next(err); }
  });

  describe("get", "/agent", {
    summary: "List agents",
    description: "Get a list of all available AI agents in the ClosedCode system.",
    operationId: "app.agents",
    responses: json(200, "List of agents", Agent.Info.zod.array()),
  });
  router.get("/agent", async (req, res, next) => {
    try {
      await jsonRequest("InstanceRoutes.agent.list", req, res, function* () {
        const svc = yield* Agent.Service;
        return yield* svc.list();
      });
    } catch (err) { next(err); }
  });

  describe("get", "/skill", {
    summary: "List skills",
    description: "Get a list of all available skills in the ClosedCode system.",
    operationId: "app.skills",
    responses: json(200, "List of skills", Skill.Info.zod.array()),
  });
  router.get("/skill", async (req, res, next) => {
    try {
      await jsonRequest("InstanceRoutes.skill.list", req, res, function* () {
        const skill = yield* Skill.Service;
        return yield* skill.all();
      });
    } catch (err) { next(err); }
  });

  describe("get", "/lsp", {
    summary: "Get LSP status",
    description: "Get LSP server status",
    operationId: "lsp.status",
    responses: json(200, "LSP server status", LSP.Status.zod.array()),
  });
  router.get("/lsp", async (req, res, next) => {
    try {
      await jsonRequest("InstanceRoutes.lsp.status", req, res, function* () {
        const lsp = yield* LSP.Service;
        return yield* lsp.status();
      });
    } catch (err) { next(err); }
  });

  describe("get", "/formatter", {
    summary: "Get formatter status",
    description: "Get formatter status",
    operationId: "formatter.status",
    responses: json(200, "Formatter status", Format.Status.zod.array()),
  });
  router.get("/formatter", async (req, res, next) => {
    try {
      await jsonRequest("InstanceRoutes.formatter.status", req, res, function* () {
        const svc = yield* Format.Service;
        return yield* svc.status();
      });
    } catch (err) { next(err); }
  });

  return router;
}
