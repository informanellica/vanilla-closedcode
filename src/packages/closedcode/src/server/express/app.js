// Express app factory: wires the Express adapter, root middleware chain, shared
// OpenAPI registry, swagger-ui docs, and all route groups (global, control
// plane, control-plane workspace, instance, ui).
//
// All groups share ONE registry so the built OpenAPI spec contains every
// operation. The spec is built AFTER all groups are mounted (operations are
// registered synchronously when each factory runs).
import express from "express";
import { adapter } from "../adapter.express.js";
import { AuthMiddleware, CompressionMiddleware, CorsMiddleware, ErrorMiddleware, InstanceMiddleware, LoggerMiddleware } from "./middleware.js";
import { Flag } from "core/flag/flag";
import { WorkspaceID } from "#control-plane/schema.js";
import { createRegistry, buildSpec, serveDocs } from "./openapi.js";
import { GlobalRoutes } from "../routes/express/global.js";
import { ControlPlaneRoutes } from "../routes/express/control.js";
import { WorkspaceRoutes } from "../routes/express/control-workspace.js";
import { InstanceRoutes } from "../routes/express/instance.js";
import { UIRoutes } from "../routes/express/ui.js";
import * as ServerBackend from "../backend.js";

export function createExpress(opts = {}, selection = ServerBackend.select()) {
  const backendAttributes = ServerBackend.attributes(selection);
  const app = express();
  const registry = createRegistry();

  // Root middleware chain: auth -> logger -> compression -> cors.
  // (Error handler is registered last, after routes.)
  app.use(express.json());
  app.use(AuthMiddleware);
  app.use(LoggerMiddleware(backendAttributes));
  app.use(CompressionMiddleware);
  app.use(CorsMiddleware(opts));

  // The WebSocket upgrade helper is created alongside the runtime so the PTY
  // route group can register its upgrade handler factories. injectWebSocket is
  // wired into the HTTP server inside adapter.create(app).listen().
  const runtime = adapter.create(app);
  const upgradeWebSocket = runtime.upgradeWebSocket;

  // Route groups share the registry (and upgrade helper for the instance/pty
  // group). Order: global, control plane, workspace, instance, UI catch-all.
  app.use("/global", GlobalRoutes(registry));
  app.use("/", ControlPlaneRoutes(registry));

  // Instance middleware resolves the project directory from query/header and
  // wraps downstream handlers in WithInstance.provide() so that Effect services
  // (Config, Session, etc.) are available. Must come before InstanceRoutes.
  const workspaceID = Flag.CLOSEDCODE_WORKSPACE_ID ? WorkspaceID.make(Flag.CLOSEDCODE_WORKSPACE_ID) : undefined;
  app.use(InstanceMiddleware(workspaceID));

  // Control-plane workspace group: the /experimental/workspace endpoints are
  // "local" instance routes (they read Instance.project), so they must run
  // AFTER InstanceMiddleware has established the instance context.
  app.use("/experimental/workspace", WorkspaceRoutes(registry));
  app.use("/", InstanceRoutes(registry, upgradeWebSocket));

  // OpenAPI spec + interactive docs. Built AFTER all groups mount so every
  // registered operation is included.
  const spec = buildSpec(registry, {
    info: { title: "closedcode", version: "1.0.0", description: "closedcode api" },
    openapi: "3.1.1",
  });
  serveDocs(app, "/docs", spec);

  // UI catch-all LAST.
  app.use("/", UIRoutes(registry));

  // Error handler last.
  app.use(ErrorMiddleware);

  return { app: adapter.addFetch(app), runtime, openapi: () => spec };
}

// Standalone spec generation.
export function openapi() {
  return createExpress({}).openapi();
}
