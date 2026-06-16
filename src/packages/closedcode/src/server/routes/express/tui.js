/**
 * @file Express route group for the instance /tui endpoints (TUI event publishing and control queue).
 * The module-level AsyncQueues and exported helpers (nextTuiRequest, submitTuiRequest,
 * submitTuiResponse, callTui, TuiRequest) are shared with the rest of the system.
 */
import express from "express";
import z from "zod";
import { Bus } from "#bus/index.js";
import { Session } from "#session/session.js";
import { TuiEvent } from "#cli/cmd/tui/event.js";
import { zodObject } from "#util/effect-zod.js";
import { AsyncQueue } from "#util/queue.js";
import { registerOperation } from "../../express/openapi.js";
import { validator } from "../../express/validate.js";
import { errors } from "../../express/errors.js";
import { runRequest } from "../instance/trace.js";

// Zod schema for a queued TUI request: the request path plus its raw JSON body.
export const TuiRequest = z.object({
  path: z.string(),
  body: z.any()
});

// Queue of inbound TUI requests awaiting a connected TUI to pull them.
const request = new AsyncQueue();
// Queue of TUI responses awaiting the originating caller.
const response = new AsyncQueue();

/**
 * Pulls the next pending TUI request from the request queue.
 * @returns {Promise<Object>} Promise resolving to the next queued TUI request.
 */
export function nextTuiRequest() {
  return request.next();
}
/**
 * Enqueues a TUI request for a connected TUI to pull.
 * @param {Object} body - The TUI request to enqueue (`{path, body}`).
 * @returns {void}
 */
export function submitTuiRequest(body) {
  request.push(body);
}
/**
 * Enqueues a TUI response for the originating caller waiting in callTui.
 * @param {*} body - The response payload to enqueue.
 * @returns {void}
 */
export function submitTuiResponse(body) {
  response.push(body);
}
/**
 * Forwards a request to the TUI and waits for its matching response.
 * Reads the JSON body from the context, enqueues a TUI request, then awaits the next response.
 * @param {Object} ctx - Request context exposing `req.json()` and `req.path`.
 * @returns {Promise<*>} Promise resolving to the TUI's response payload.
 */
export async function callTui(ctx) {
  const body = await ctx.req.json();
  submitTuiRequest({
    path: ctx.req.path,
    body
  });
  return response.next();
}

// Adapter shaping an Express req into the context surface that trace.js'
// requestAttributes() reads (method, url, param()). The TUI routes carry no route
// params, so param() returns an empty object.
/**
 * Adapts an Express request into the minimal context shape trace.js expects.
 * @param {Object} req - Express request object.
 * @returns {Object} Context with `req.method`, `req.url`, and a `req.param()` accessor.
 */
function traceContext(req) {
  return {
    req: {
      method: req.method,
      url: `${req.protocol}://${req.get("host") ?? "localhost"}${req.originalUrl}`,
      param: () => req.params ?? {}
    }
  };
}

/**
 * Builds the Express router for the instance /tui endpoints: publishing TUI events
 * (prompt append/submit/clear, open dialogs, toasts, command execution, session select)
 * and the /control request/response queue bridge.
 * @param {Object} registry - OpenAPI operation registry; route metadata is registered against it when present.
 * @returns {Object} Configured Express Router.
 */
export function TuiRoutes(registry) {
  const router = express.Router();

  // Register a route's openapi metadata against the GROUP-RELATIVE mount ("/tui").
  const describe = (method, path, meta) => registry && registerOperation(registry, method, "/tui" + path, meta);

  describe("post", "/append-prompt", {
    summary: "Append TUI prompt",
    description: "Append prompt to the TUI",
    operationId: "tui.appendPrompt",
    responses: {
      200: {
        description: "Prompt processed successfully",
        content: {
          "application/json": {
            schema: z.boolean()
          }
        }
      },
      ...errors(400)
    }
  });
  router.post("/append-prompt", validator("json", zodObject(TuiEvent.PromptAppend.properties)), async (req, res, next) => {
    try {
      await Bus.publish(TuiEvent.PromptAppend, req.valid.json);
      res.json(true);
    } catch (err) {
      next(err);
    }
  });

  describe("post", "/open-help", {
    summary: "Open help dialog",
    description: "Open the help dialog in the TUI to display user assistance information.",
    operationId: "tui.openHelp",
    responses: {
      200: {
        description: "Help dialog opened successfully",
        content: {
          "application/json": {
            schema: z.boolean()
          }
        }
      }
    }
  });
  router.post("/open-help", async (_req, res, next) => {
    try {
      await Bus.publish(TuiEvent.CommandExecute, {
        command: "help.show"
      });
      res.json(true);
    } catch (err) {
      next(err);
    }
  });

  describe("post", "/open-sessions", {
    summary: "Open sessions dialog",
    description: "Open the session dialog",
    operationId: "tui.openSessions",
    responses: {
      200: {
        description: "Session dialog opened successfully",
        content: {
          "application/json": {
            schema: z.boolean()
          }
        }
      }
    }
  });
  router.post("/open-sessions", async (_req, res, next) => {
    try {
      await Bus.publish(TuiEvent.CommandExecute, {
        command: "session.list"
      });
      res.json(true);
    } catch (err) {
      next(err);
    }
  });

  describe("post", "/open-themes", {
    summary: "Open themes dialog",
    description: "Open the theme dialog",
    operationId: "tui.openThemes",
    responses: {
      200: {
        description: "Theme dialog opened successfully",
        content: {
          "application/json": {
            schema: z.boolean()
          }
        }
      }
    }
  });
  router.post("/open-themes", async (_req, res, next) => {
    try {
      await Bus.publish(TuiEvent.CommandExecute, {
        command: "session.list"
      });
      res.json(true);
    } catch (err) {
      next(err);
    }
  });

  describe("post", "/open-models", {
    summary: "Open models dialog",
    description: "Open the model dialog",
    operationId: "tui.openModels",
    responses: {
      200: {
        description: "Model dialog opened successfully",
        content: {
          "application/json": {
            schema: z.boolean()
          }
        }
      }
    }
  });
  router.post("/open-models", async (_req, res, next) => {
    try {
      await Bus.publish(TuiEvent.CommandExecute, {
        command: "model.list"
      });
      res.json(true);
    } catch (err) {
      next(err);
    }
  });

  describe("post", "/submit-prompt", {
    summary: "Submit TUI prompt",
    description: "Submit the prompt",
    operationId: "tui.submitPrompt",
    responses: {
      200: {
        description: "Prompt submitted successfully",
        content: {
          "application/json": {
            schema: z.boolean()
          }
        }
      }
    }
  });
  router.post("/submit-prompt", async (_req, res, next) => {
    try {
      await Bus.publish(TuiEvent.CommandExecute, {
        command: "prompt.submit"
      });
      res.json(true);
    } catch (err) {
      next(err);
    }
  });

  describe("post", "/clear-prompt", {
    summary: "Clear TUI prompt",
    description: "Clear the prompt",
    operationId: "tui.clearPrompt",
    responses: {
      200: {
        description: "Prompt cleared successfully",
        content: {
          "application/json": {
            schema: z.boolean()
          }
        }
      }
    }
  });
  router.post("/clear-prompt", async (_req, res, next) => {
    try {
      await Bus.publish(TuiEvent.CommandExecute, {
        command: "prompt.clear"
      });
      res.json(true);
    } catch (err) {
      next(err);
    }
  });

  describe("post", "/execute-command", {
    summary: "Execute TUI command",
    description: "Execute a TUI command (e.g. agent_cycle)",
    operationId: "tui.executeCommand",
    responses: {
      200: {
        description: "Command executed successfully",
        content: {
          "application/json": {
            schema: z.boolean()
          }
        }
      },
      ...errors(400)
    }
  });
  router.post("/execute-command", validator("json", z.object({
    command: z.string()
  })), async (req, res, next) => {
    try {
      const command = req.valid.json.command;
      await Bus.publish(TuiEvent.CommandExecute, {
        command: {
          session_new: "session.new",
          session_share: "session.share",
          session_interrupt: "session.interrupt",
          session_compact: "session.compact",
          messages_page_up: "session.page.up",
          messages_page_down: "session.page.down",
          messages_line_up: "session.line.up",
          messages_line_down: "session.line.down",
          messages_half_page_up: "session.half.page.up",
          messages_half_page_down: "session.half.page.down",
          messages_first: "session.first",
          messages_last: "session.last",
          agent_cycle: "agent.cycle"
        }[command]
      });
      res.json(true);
    } catch (err) {
      next(err);
    }
  });

  describe("post", "/show-toast", {
    summary: "Show TUI toast",
    description: "Show a toast notification in the TUI",
    operationId: "tui.showToast",
    responses: {
      200: {
        description: "Toast notification shown successfully",
        content: {
          "application/json": {
            schema: z.boolean()
          }
        }
      }
    }
  });
  router.post("/show-toast", validator("json", zodObject(TuiEvent.ToastShow.properties)), async (req, res, next) => {
    try {
      await Bus.publish(TuiEvent.ToastShow, req.valid.json);
      res.json(true);
    } catch (err) {
      next(err);
    }
  });

  describe("post", "/publish", {
    summary: "Publish TUI event",
    description: "Publish a TUI event",
    operationId: "tui.publish",
    responses: {
      200: {
        description: "Event published successfully",
        content: {
          "application/json": {
            schema: z.boolean()
          }
        }
      },
      ...errors(400)
    }
  });
  router.post("/publish", validator("json", z.union(Object.values(TuiEvent).map(def => {
    return z.object({
      type: z.literal(def.type),
      properties: zodObject(def.properties)
    }).meta({
      ref: `Event.${def.type}`
    });
  }))), async (req, res, next) => {
    try {
      const evt = req.valid.json;
      await Bus.publish(Object.values(TuiEvent).find(def => def.type === evt.type), evt.properties);
      res.json(true);
    } catch (err) {
      next(err);
    }
  });

  describe("post", "/select-session", {
    summary: "Select session",
    description: "Navigate the TUI to display the specified session.",
    operationId: "tui.selectSession",
    responses: {
      200: {
        description: "Session selected successfully",
        content: {
          "application/json": {
            schema: z.boolean()
          }
        }
      },
      ...errors(400, 404)
    }
  });
  router.post("/select-session", validator("json", zodObject(TuiEvent.SessionSelect.properties)), async (req, res, next) => {
    try {
      const {
        sessionID
      } = req.valid.json;
      await runRequest("TuiRoutes.sessionSelect", traceContext(req), Session.Service.use(svc => svc.get(sessionID)));
      await Bus.publish(TuiEvent.SessionSelect, {
        sessionID
      });
      res.json(true);
    } catch (err) {
      next(err);
    }
  });

  // Nested control routes, inlined at /control.
  describe("get", "/control/next", {
    summary: "Get next TUI request",
    description: "Retrieve the next TUI (Terminal User Interface) request from the queue for processing.",
    operationId: "tui.control.next",
    responses: {
      200: {
        description: "Next TUI request",
        content: {
          "application/json": {
            schema: TuiRequest
          }
        }
      }
    }
  });
  router.get("/control/next", async (_req, res, next) => {
    try {
      const req = await nextTuiRequest();
      res.json(req);
    } catch (err) {
      next(err);
    }
  });

  describe("post", "/control/response", {
    summary: "Submit TUI response",
    description: "Submit a response to the TUI request queue to complete a pending request.",
    operationId: "tui.control.response",
    responses: {
      200: {
        description: "Response submitted successfully",
        content: {
          "application/json": {
            schema: z.boolean()
          }
        }
      }
    }
  });
  router.post("/control/response", validator("json", z.any()), async (req, res, next) => {
    try {
      const body = req.valid.json;
      submitTuiResponse(body);
      res.json(true);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
