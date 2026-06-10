// Express route group for the instance /project endpoints.
import express from "express";
import { Effect } from "effect";
import { Instance } from "#project/instance.js";
import { InstanceRuntime } from "#project/instance-runtime.js";
import { Project } from "#project/project.js";
import z from "zod";
import { ProjectID } from "#project/schema.js";
import { AppRuntime } from "#effect/app-runtime.js";
import { registerOperation } from "../../express/openapi.js";
import { validator } from "../../express/validate.js";
import { errors } from "../../express/errors.js";
import { paramToAttributeKey } from "../instance/trace.js";

// OTel span attributes for an Express handler: method, path, and every matched route param.
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

// Runs an Effect inside a span with the request attributes.
function runRequest(name, req, effect) {
  return AppRuntime.runPromise(effect.pipe(Effect.withSpan(name, {
    attributes: requestAttributes(req),
  })));
}

export function ProjectRoutes(registry) {
  const router = express.Router();

  // Registers a route's openapi metadata against the GROUP-RELATIVE mount ("/project").
  const describe = (method, path, meta) => registry && registerOperation(registry, method, "/project" + path, meta);

  describe("get", "/", {
    summary: "List all projects",
    description: "Get a list of projects that have been opened with ClosedCode.",
    operationId: "project.list",
    responses: {
      200: {
        description: "List of projects",
        content: {
          "application/json": {
            schema: Project.Info.zod.array(),
          },
        },
      },
    },
  });
  router.get("/", async (_req, res, next) => {
    try {
      const projects = await Project.list();
      res.json(projects);
    } catch (err) {
      next(err);
    }
  });

  describe("get", "/current", {
    summary: "Get current project",
    description: "Retrieve the currently active project that ClosedCode is working with.",
    operationId: "project.current",
    responses: {
      200: {
        description: "Current project information",
        content: {
          "application/json": {
            schema: Project.Info.zod,
          },
        },
      },
    },
  });
  router.get("/current", async (_req, res, next) => {
    try {
      res.json(Instance.project);
    } catch (err) {
      next(err);
    }
  });

  describe("post", "/git/init", {
    summary: "Initialize git repository",
    description: "Create a git repository for the current project and return the refreshed project info.",
    operationId: "project.initGit",
    responses: {
      200: {
        description: "Project information after git initialization",
        content: {
          "application/json": {
            schema: Project.Info.zod,
          },
        },
      },
    },
  });
  router.post("/git/init", async (req, res, next) => {
    try {
      const dir = Instance.directory;
      const prev = Instance.project;
      const next_ = await runRequest("ProjectRoutes.initGit", req, Project.Service.use(svc => svc.initGit({
        directory: dir,
        project: prev,
      })));
      if (next_.id === prev.id && next_.vcs === prev.vcs && next_.worktree === prev.worktree) return res.json(next_);
      await InstanceRuntime.reloadInstance({
        directory: dir,
        worktree: dir,
        project: next_,
      });
      res.json(next_);
    } catch (err) {
      next(err);
    }
  });

  describe("patch", "/:projectID", {
    summary: "Update project",
    description: "Update project properties such as name, icon, and commands.",
    operationId: "project.update",
    responses: {
      200: {
        description: "Updated project information",
        content: {
          "application/json": {
            schema: Project.Info.zod,
          },
        },
      },
      ...errors(400, 404),
    },
  });
  router.patch(
    "/:projectID",
    validator("param", z.object({ projectID: ProjectID.zod })),
    validator("json", Project.UpdateInput.omit({ projectID: true })),
    async (req, res, next) => {
      try {
        const result = await runRequest("ProjectRoutes.update", req, Effect.gen(function* () {
          const projectID = req.valid.param.projectID;
          const body = req.valid.json;
          const svc = yield* Project.Service;
          return yield* svc.update({
            ...body,
            projectID,
          });
        }));
        res.json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
