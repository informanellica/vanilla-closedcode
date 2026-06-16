/** @file Express route group for the instance /provider endpoints (list, auth methods, OAuth authorize/callback). */
// Express route group for the instance /provider endpoints (list, auth, OAuth).
import express from "express";
import { Effect } from "effect";
import z from "zod";
import { mapValues } from "remeda";
import { Config } from "#config/config.js";
import { Provider } from "#provider/provider.js";
import { ModelsDev } from "#provider/models.js";
import { ProviderAuth } from "#provider/auth.js";
import { ProviderID } from "#provider/schema.js";
import { AppRuntime } from "#effect/app-runtime.js";
import { registerOperation } from "../../express/openapi.js";
import { validator } from "../../express/validate.js";
import { errors } from "../../express/errors.js";

// OTel attribute key normalisation: `fooID` -> `foo.id`; any other param is namespaced under `closedcode.`.
/**
 * Normalises an Express route param name into an OTel attribute key: `fooID` becomes `foo.id`; any other
 * param is namespaced under `closedcode.`.
 * @param {string} key - The route param name.
 * @returns {string} The normalised attribute key.
 */
function paramToAttributeKey(key) {
  const m = key.match(/^(.+)ID$/);
  if (m) return `${m[1].toLowerCase()}.id`;
  return `closedcode.${key}`;
}

// OTel span attributes for an Express request: method, path, and matched route params.
/**
 * Builds OTel span attributes from an Express request: HTTP method, mounted path, and every matched route param.
 * @param {Object} req - The Express request object.
 * @returns {Object} A flat record of span attribute keys to values.
 */
function requestAttributes(req) {
  const attributes = {
    "http.method": req.method,
    "http.path": req.baseUrl + req.path,
  };
  for (const [key, value] of Object.entries(req.params ?? {})) {
    attributes[paramToAttributeKey(key)] = value;
  }
  return attributes;
}

// Runs an Effect generator under an OTel span and responds with the JSON result.
/**
 * Runs an Effect generator under an OTel span built from the request, then writes the resolved value as JSON.
 * @param {string} name - The span name.
 * @param {Object} req - The Express request object.
 * @param {Object} res - The Express response object.
 * @param {Function} effect - A function returning an Effect generator to run.
 * @returns {Promise<void>} Resolves once the response JSON has been written.
 */
async function jsonRequest(name, req, res, effect) {
  const result = await AppRuntime.runPromise(
    Effect.gen(() => effect()).pipe(Effect.withSpan(name, { attributes: requestAttributes(req) })),
  );
  res.json(result);
}

/**
 * Builds the Express router for the /provider route group (list providers, auth methods, OAuth authorize/callback).
 * @param {Object} registry - The OpenAPI registry used to register route metadata (may be falsy to skip).
 * @returns {Object} The configured Express Router for this group.
 */
export function ProviderRoutes(registry) {
  const router = express.Router();

  // Registers a route's openapi metadata against the GROUP-RELATIVE mount ("/provider").
  const describe = (method, path, meta) => registry && registerOperation(registry, method, "/provider" + path, meta);

  describe("get", "/", {
    summary: "List providers",
    description: "Get a list of all available AI providers, including both available and connected ones.",
    operationId: "provider.list",
    responses: {
      200: {
        description: "List of providers",
        content: {
          "application/json": {
            schema: Provider.ListResult.zod,
          },
        },
      },
    },
  });
  router.get("/", async (req, res, next) => {
    try {
      await jsonRequest("ProviderRoutes.list", req, res, function* () {
        const svc = yield* Provider.Service;
        const cfg = yield* Config.Service;
        const config = yield* cfg.get();
        const all = yield* ModelsDev.Service.use((s) => s.get());
        const disabled = new Set(config.disabled_providers ?? []);
        const enabled = config.enabled_providers ? new Set(config.enabled_providers) : undefined;
        const filtered = {};
        for (const [key, value] of Object.entries(all)) {
          if ((enabled ? enabled.has(key) : true) && !disabled.has(key) && Provider.isLocalProvider(Provider.fromModelsDevProvider(value))) {
            filtered[key] = value;
          }
        }
        const connected = yield* svc.list();
        const providers = Object.assign(mapValues(filtered, (x) => Provider.fromModelsDevProvider(x)), connected);
        return {
          all: Object.values(providers),
          default: Provider.defaultModelIDs(providers),
          connected: Object.keys(connected),
        };
      });
    } catch (err) {
      next(err);
    }
  });

  describe("get", "/auth", {
    summary: "Get provider auth methods",
    description: "Retrieve available authentication methods for all AI providers.",
    operationId: "provider.auth",
    responses: {
      200: {
        description: "Provider auth methods",
        content: {
          "application/json": {
            schema: ProviderAuth.Methods.zod,
          },
        },
      },
    },
  });
  router.get("/auth", async (req, res, next) => {
    try {
      await jsonRequest("ProviderRoutes.auth", req, res, function* () {
        const svc = yield* ProviderAuth.Service;
        return yield* svc.methods();
      });
    } catch (err) {
      next(err);
    }
  });

  describe("post", "/:providerID/oauth/authorize", {
    summary: "OAuth authorize",
    description: "Initiate OAuth authorization for a specific AI provider to get an authorization URL.",
    operationId: "provider.oauth.authorize",
    responses: {
      200: {
        description: "Authorization URL and method",
        content: {
          "application/json": {
            schema: ProviderAuth.Authorization.zod.optional(),
          },
        },
      },
      ...errors(400),
    },
  });
  router.post(
    "/:providerID/oauth/authorize",
    validator("param", z.object({
      providerID: ProviderID.zod.meta({
        description: "Provider ID",
      }),
    })),
    validator("json", ProviderAuth.AuthorizeInput.zod),
    async (req, res, next) => {
      try {
        await jsonRequest("ProviderRoutes.oauth.authorize", req, res, function* () {
          const providerID = req.valid.param.providerID;
          const { method, inputs } = req.valid.json;
          const svc = yield* ProviderAuth.Service;
          return yield* svc.authorize({
            providerID,
            method,
            inputs,
          });
        });
      } catch (err) {
        next(err);
      }
    },
  );

  describe("post", "/:providerID/oauth/callback", {
    summary: "OAuth callback",
    description: "Handle the OAuth callback from a provider after user authorization.",
    operationId: "provider.oauth.callback",
    responses: {
      200: {
        description: "OAuth callback processed successfully",
        content: {
          "application/json": {
            schema: z.boolean(),
          },
        },
      },
      ...errors(400),
    },
  });
  router.post(
    "/:providerID/oauth/callback",
    validator("param", z.object({
      providerID: ProviderID.zod.meta({
        description: "Provider ID",
      }),
    })),
    validator("json", ProviderAuth.CallbackInput.zod),
    async (req, res, next) => {
      try {
        await jsonRequest("ProviderRoutes.oauth.callback", req, res, function* () {
          const providerID = req.valid.param.providerID;
          const { method, code } = req.valid.json;
          const svc = yield* ProviderAuth.Service;
          yield* svc.callback({
            providerID,
            method,
            code,
          });
          return true;
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
