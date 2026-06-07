// OpenAPI foundation: per-route operation metadata is collected in a registry,
// Zod schemas are converted to JSON Schema, and everything is merged into a
// single OpenAPI document (a plain JS object) served by swagger-ui-express.
import swaggerUi from "swagger-ui-express";
import z from "zod";
import { OpenApi } from "effect/unstable/httpapi";
import { PublicApi } from "../routes/instance/httpapi/public.js";

// Shorthand for building the requestBody object for a JSON endpoint.
export function jsonBody(schema) {
  return { content: { "application/json": { schema } } };
}

// Per-app registry of OpenAPI path operations.
export function createRegistry() {
  return {
    operations: [],
    schemas: {},
  };
}

// Convert a Zod schema to a JSON Schema fragment suitable for an OpenAPI
// component or inline schema. If the Zod schema carries a `ref` (via
// .meta({ref})) we register it under components/schemas and return a $ref.
export function resolve(registry, zodSchema) {
  if (!zodSchema || typeof zodSchema !== "object") return {};
  const meta = typeof zodSchema.meta === "function" ? zodSchema.meta() : undefined;
  const ref = meta?.ref;
  // Use Zod 4's native JSON Schema emitter (z.toJSONSchema). Do NOT swap in a
  // Zod-3-era converter: those silently mis-convert Zod 4 schemas (e.g. an
  // object collapses to `{type:"string"}`).
  // `unrepresentable: "skip"` is required: Effect-derived `.zod` schemas
  // routinely contain transforms/pipes, and Zod 4 otherwise THROWS
  // ("Transforms cannot be represented in JSON Schema"), which would crash
  // spec generation (and thus server startup, since the spec is built in
  // createExpress()). Skipping drops the unrepresentable node.
  const json = z.toJSONSchema(zodSchema, { target: "draft-2020-12", io: "output", unrepresentable: "skip" });
  // Drop the $schema header (OpenAPI components do not use it) and the internal
  // `ref` marker we attach via .meta({ref}) for component registration.
  delete json.$schema;
  delete json.ref;
  if (ref) {
    registry.schemas[ref] = json;
    return { $ref: `#/components/schemas/${ref}` };
  }
  return json;
}

// Register a single OpenAPI operation for `method path`. `describe` carries
// {summary, description, operationId, responses, requestBody, parameters};
// `responses[code].content[type].schema` may be a Zod schema or plain JSON
// Schema object.
export function registerOperation(registry, method, path, describe) {
  if (!describe) return;
  const responses = {};
  for (const [code, resp] of Object.entries(describe.responses ?? {})) {
    const content = {};
    for (const [type, body] of Object.entries(resp.content ?? {})) {
      content[type] = {
        schema: maybeResolve(registry, body.schema),
      };
    }
    responses[code] = { description: resp.description ?? "", ...(Object.keys(content).length ? { content } : {}) };
  }
  registry.operations.push({
    path: normalizePath(path),
    method: method.toLowerCase(),
    operation: {
      summary: describe.summary,
      description: describe.description,
      operationId: describe.operationId,
      ...(describe.parameters ? { parameters: describe.parameters } : {}),
      ...(describe.requestBody ? { requestBody: resolveRequestBody(registry, describe.requestBody) } : {}),
      responses,
    },
  });
}

// Convert an Express path to its OpenAPI form: ":param" -> "{param}", and
// drop a trailing slash on group-root routes (a group mounted at "/config"
// with a "/" route yields "/config/", but the canonical spec uses "/config").
function normalizePath(path) {
  const oapi = path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
  return oapi.length > 1 ? oapi.replace(/\/+$/, "") : oapi;
}

function maybeResolve(registry, schema) {
  if (!schema) return {};
  // A Zod schema exposes a `_def`; a plain JSON Schema object does not.
  if (schema._def || schema._zod) return resolve(registry, schema);
  return schema;
}

function resolveRequestBody(registry, requestBody) {
  const content = {};
  for (const [type, body] of Object.entries(requestBody.content ?? {})) {
    content[type] = { schema: maybeResolve(registry, body.schema) };
  }
  return { ...requestBody, content };
}

// Build the final OpenAPI document from the registry merged with the Effect
// httpapi contract shape on top of a plain base object.
export function buildSpec(registry, documentation = {}) {
  // Base OpenAPI document as a plain JS object; all path/operation metadata
  // comes from the registry below (no JSDoc or YAML source parsing).
  const base = {
    openapi: documentation.openapi ?? "3.1.1",
    info: documentation.info ?? { title: "closedcode", version: "1.0.0", description: "closedcode api" },
    paths: {},
  };
  const paths = base.paths ?? {};
  for (const { path, method, operation } of registry.operations) {
    paths[path] ??= {};
    paths[path][method] = operation;
  }
  mergeEffectContractShape(paths);
  const effectComponents = OpenApi.fromApi(PublicApi).components ?? {};
  return {
    ...base,
    paths,
    components: {
      ...(base.components ?? {}),
      ...effectComponents,
      schemas: { ...(effectComponents.schemas ?? {}), ...(base.components?.schemas ?? {}), ...registry.schemas },
    },
  };
}

function mergeEffectContractShape(paths) {
  const effectPaths = OpenApi.fromApi(PublicApi).paths ?? {};
  for (const [path, item] of Object.entries(paths)) {
    const effectItem = effectPaths[path];
    if (!effectItem) continue;
    for (const method of ["get", "post", "put", "delete", "patch"]) {
      const operation = item?.[method];
      const effectOperation = effectItem?.[method];
      if (!operation || !effectOperation) continue;
      if (!operation.parameters?.length && effectOperation.parameters?.length) {
        operation.parameters = effectOperation.parameters;
      }
      if (!operation.requestBody && effectOperation.requestBody) {
        operation.requestBody = effectOperation.requestBody;
      }
    }
  }
}

// Mount swagger-ui at the given Express path serving the built spec.
export function serveDocs(app, mountPath, spec) {
  app.use(mountPath, swaggerUi.serve, swaggerUi.setup(spec));
}
