/** @file Builds the public OpenAPI spec for the closedcode HTTP API, rewriting the generated spec to match the legacy (Express-generated) SDK surface. */
import { OpenApi } from "effect/unstable/httpapi";
import { ClosedCodeHttpApi } from "./api.js";
// Instance routes use middleware for directory/workspace resolution, but HttpApi
// doesn't surface middleware query params in the spec. Inject them explicitly.
const InstanceQueryParameters = [{
  name: "directory",
  in: "query",
  required: false,
  schema: {
    type: "string"
  }
}, {
  name: "workspace",
  in: "query",
  required: false,
  schema: {
    type: "string"
  }
}];

// Query schemas describe decoded Effect values, but the generated SDK needs the
// public call shape. These keep SDK callers passing numbers/booleans while the
// server still decodes string query params at runtime.
const QueryNumberParameters = new Set(["start", "cursor", "limit", "method"]);
const QueryBooleanParameters = new Set(["roots", "archived"]);
const QueryParameterSchemas = {
  "GET /find/file limit": {
    type: "integer",
    minimum: 1,
    maximum: 200
  },
  "GET /session/{sessionID}/diff messageID": {
    type: "string",
    pattern: "^msg.*"
  },
  "GET /session/{sessionID}/message limit": {
    type: "integer",
    minimum: 0,
    maximum: Number.MAX_SAFE_INTEGER
  }
};
const PathParameterSchemas = {
  sessionID: {
    type: "string",
    pattern: "^ses.*"
  },
  messageID: {
    type: "string",
    pattern: "^msg.*"
  },
  partID: {
    type: "string",
    pattern: "^prt.*"
  },
  permissionID: {
    type: "string",
    pattern: "^per.*"
  },
  ptyID: {
    type: "string",
    pattern: "^pty.*"
  }
};
const LegacyComponentDescriptions = {
  LogLevel: "Log level",
  ServerConfig: "Server configuration for closedcode serve and web commands",
  LayoutConfig: "@deprecated Always uses stretch layout."
};
/**
 * Transform a freshly generated OpenAPI spec in place to match the legacy SDK surface.
 * Fixes self-referencing components, strips optional-null union arms, normalizes/dedupes component
 * names and descriptions, applies legacy schema overrides, removes built-in error/security schemas,
 * injects instance query params, documents SSE event streams, and normalizes parameters/error responses.
 * @param {Object} input - The generated OpenAPI spec object (mutated in place).
 * @returns {Object} The same spec object, transformed.
 */
function matchLegacyOpenApi(input) {
  const spec = input;

  // Effect's multi-document JSON Schema deduplicator can produce self-referencing
  // component schemas (e.g. `{"$ref":"#components/schemas/X"}` as the definition
  // of X itself) when the same AST node appears both as a standalone endpoint
  // payload and inside an annotated union arm. Resolve these by inlining the
  // actual schema from any parent union that references them.
  fixSelfReferencingComponents(spec);

  // Effect's Schema.optional emits `anyOf: [T, {type:"null"}]` in OpenAPI,
  // but the legacy SDK expected plain `T` for optional fields. Strip null
  // from all component schemas so both request and response types match.
  for (const [name, schema] of Object.entries(spec.components?.schemas ?? {})) {
    spec.components.schemas[name] = stripOptionalNull(structuredClone(schema));
  }
  normalizeComponentNames(spec);
  collapseDuplicateComponents(spec);
  applyLegacySchemaOverrides(spec);
  normalizeComponentDescriptions(spec);
  addLegacyErrorSchemas(spec);
  delete spec.components?.schemas?.Unauthorized;
  delete spec.components?.schemas?.EffectHttpApiErrorBadRequest;
  delete spec.components?.schemas?.EffectHttpApiErrorNotFound;
  delete spec.components?.schemas?.effect_HttpApiError_BadRequest;
  delete spec.components?.schemas?.effect_HttpApiError_NotFound;
  delete spec.components?.securitySchemes;
  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    const isInstanceRoute = !path.startsWith("/global/") && !path.startsWith("/auth/");
    for (const method of ["get", "post", "put", "delete", "patch"]) {
      const operation = item[method];
      if (!operation) continue;
      if (operation.requestBody) {
        // The Express-generated OpenAPI never marked request bodies as required.
        // Keep that SDK surface stable during the HttpApi migration.
        delete operation.requestBody.required;
        const body = operation.requestBody.content?.["application/json"];
        if (body?.schema) body.schema = stripOptionalNull(structuredClone(body.schema));
        if (path === "/experimental/workspace" && method === "post") {
          // Workspace creation fields `branch` and `extra` are Schema.NullOr —
          // genuinely nullable, not just optional. Re-add the null that the
          // component-level strip above removed.
          const ref = operation.requestBody.content?.["application/json"]?.schema?.$ref?.replace("#components/schemas/", "");
          const properties = ref ? spec.components?.schemas?.[ref]?.properties : operation.requestBody.content?.["application/json"]?.schema?.properties;
          if (properties?.branch) properties.branch = {
            anyOf: [properties.branch, {
              type: "null"
            }]
          };
          if (properties?.extra) properties.extra = {
            anyOf: [properties.extra, {
              type: "null"
            }]
          };
        }
      }
      for (const response of Object.values(operation.responses ?? {})) {
        for (const content of Object.values(response.content ?? {})) {
          if (content.schema) content.schema = stripOptionalNull(structuredClone(content.schema));
        }
      }
      // Express applies auth as runtime middleware outside OpenAPI metadata, so
      // the legacy SDK did not expose auth schemes or generated 401 error unions.
      delete operation.security;
      delete operation.responses?.["401"];
      normalizeLegacyErrorResponses(operation);
      normalizeLegacyOperation(operation, path, method);
      if ((path === "/event" || path === "/global/event") && method === "get") {
        // HttpApi has no first-class SSE response schema, and these handlers are
        // raw/streaming routes. Document the actual wire protocol explicitly.
        operation.responses["200"] = {
          description: "Event stream",
          content: {
            "text/event-stream": {
              schema: path === "/event" ? {
                $ref: "#components/schemas/Event"
              } : {
                $ref: "#components/schemas/GlobalEvent"
              }
            }
          }
        };
      }
      if (!isInstanceRoute) continue;
      operation.parameters = [...InstanceQueryParameters, ...(operation.parameters ?? []).filter(param => param.in !== "query" || param.name !== "directory" && param.name !== "workspace")];
      for (const param of operation.parameters) normalizeParameter(param, `${method.toUpperCase()} ${path}`);
    }
  }
  return input;
}
/**
 * Add the legacy `BadRequestError` and `NotFoundError` component schemas the old SDK expected.
 * @param {Object} spec - The OpenAPI spec object (mutated in place).
 * @returns {void}
 */
function addLegacyErrorSchemas(spec) {
  if (!spec.components?.schemas) return;
  spec.components.schemas.BadRequestError = {
    type: "object",
    required: ["data", "errors", "success"],
    properties: {
      data: {},
      errors: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: {}
        }
      },
      success: {
        type: "boolean",
        enum: [false]
      }
    }
  };
  spec.components.schemas.NotFoundError = {
    type: "object",
    required: ["name", "data"],
    properties: {
      name: {
        type: "string",
        enum: ["NotFoundError"]
      },
      data: {
        type: "object",
        required: ["message"],
        properties: {
          message: {
            type: "string"
          }
        }
      }
    }
  };
}
/**
 * Collapse numeric-suffixed duplicate component schemas (e.g. `Foo2`) into their base name (`Foo`)
 * when the schemas are structurally equal, rewriting all `$ref`s and deleting the duplicate.
 * @param {Object} spec - The OpenAPI spec object (mutated in place).
 * @returns {void}
 */
function collapseDuplicateComponents(spec) {
  const schemas = spec.components?.schemas;
  if (!schemas) return;
  for (const name of Object.keys(schemas)) {
    const base = name.replace(/\d+$/, "");
    if (base === name || !schemas[base]) continue;
    if (stableSchema(schemas[name], schemas) !== stableSchema(schemas[base], schemas)) continue;
    rewriteRefs(spec, name, base);
    delete schemas[name];
  }
}
/**
 * Rename dotted component names to PascalCase type names, merging into an existing target when structurally
 * equal or renaming otherwise, and rewriting all `$ref`s accordingly.
 * @param {Object} spec - The OpenAPI spec object (mutated in place).
 * @returns {void}
 */
function normalizeComponentNames(spec) {
  const schemas = spec.components?.schemas;
  if (!schemas) return;
  for (const name of Object.keys(schemas)) {
    const next = componentTypeName(name);
    if (next === name) continue;
    if (schemas[next]) {
      if (stableSchema(schemas[name], schemas) === stableSchema(schemas[next], schemas)) {
        rewriteRefs(spec, name, next);
        delete schemas[name];
      }
      continue;
    }
    schemas[next] = schemas[name];
    rewriteRefs(spec, name, next);
    delete schemas[name];
  }
}
/**
 * Convert a dotted component name into a PascalCase type name, dropping purely numeric path segments.
 * @param {string} name - The component name (possibly dotted, e.g. `foo.bar.2`).
 * @returns {string} The PascalCase type name (unchanged when the name contains no dot).
 */
function componentTypeName(name) {
  if (!name.includes(".")) return name;
  return name.split(".").filter(part => !/^\d+$/.test(part)).map(part => part.slice(0, 1).toUpperCase() + part.slice(1)).join("");
}
/**
 * Apply hand-tuned schema overrides so specific component schemas match the legacy SDK
 * (e.g. open `additionalProperties`, string `Command.template`, and nullable Workspace/session/provider fields).
 * @param {Object} spec - The OpenAPI spec object (mutated in place).
 * @returns {void}
 */
function applyLegacySchemaOverrides(spec) {
  const schemas = spec.components?.schemas;
  if (!schemas) return;
  if (schemas.AgentConfig) schemas.AgentConfig.additionalProperties = {};
  if (schemas.Command?.properties?.template) schemas.Command.properties.template = {
    type: "string"
  };
  if (schemas.Workspace?.properties) {
    schemas.Workspace.properties.branch = nullable(schemas.Workspace.properties.branch);
    schemas.Workspace.properties.directory = nullable(schemas.Workspace.properties.directory);
    schemas.Workspace.properties.extra = nullable(schemas.Workspace.properties.extra);
  }
  if (schemas.GlobalSession?.properties?.project) schemas.GlobalSession.properties.project = nullable(schemas.GlobalSession.properties.project);
  const providerOptions = schemas.ProviderConfig?.properties?.options;
  if (providerOptions) providerOptions.additionalProperties = {};
  const model = schemas.ProviderConfig?.properties?.models?.additionalProperties;
  const variants = typeof model === "object" ? model.properties?.variants?.additionalProperties : undefined;
  if (variants && typeof variants === "object") variants.additionalProperties = {};
  const syncInfo = schemas.SyncEventSessionUpdated?.properties?.data?.properties?.info;
  if (syncInfo?.properties) makePropertiesNullable(syncInfo.properties);
}
/**
 * Replace component descriptions with the curated legacy descriptions, deleting descriptions for all others.
 * @param {Object} spec - The OpenAPI spec object (mutated in place).
 * @returns {void}
 */
function normalizeComponentDescriptions(spec) {
  for (const [name, schema] of Object.entries(spec.components?.schemas ?? {})) {
    const description = LegacyComponentDescriptions[name];
    if (description) {
      schema.description = description;
      continue;
    }
    delete schema.description;
  }
}
/**
 * Recursively wrap each property schema in a nullable union, with special handling for `share.url`
 * (only the `url` made nullable) and `time` (recursed into).
 * @param {Object} properties - The OpenAPI `properties` map to make nullable (mutated in place).
 * @returns {void}
 */
function makePropertiesNullable(properties) {
  for (const [key, value] of Object.entries(properties)) {
    if (key === "share" && value.properties?.url) {
      value.properties.url = nullable(value.properties.url);
      continue;
    }
    if (key === "time" && value.properties) {
      makePropertiesNullable(value.properties);
      continue;
    }
    properties[key] = nullable(value);
  }
}
/**
 * Wrap a schema in an `anyOf: [schema, {type:"null"}]` union, unless it is already nullable.
 * @param {Object} schema - The schema to make nullable.
 * @returns {Object} The (possibly already-nullable) schema, made nullable.
 */
function nullable(schema) {
  if (flattenOptions(schema.anyOf ?? schema.oneOf)?.some(item => item.type === "null")) return schema;
  return {
    anyOf: [schema, {
      type: "null"
    }]
  };
}
/**
 * Produce a stable, comparable string for a schema by canonicalizing it (sorted keys, descriptions dropped, refs canonicalized).
 * @param {*} input - The schema (or schema fragment) to serialize.
 * @param {Object} schemas - The component schemas map used to canonicalize `$ref`s.
 * @returns {string} A deterministic JSON string for structural comparison.
 */
function stableSchema(input, schemas) {
  return JSON.stringify(canonicalizeSchema(input, schemas));
}
/**
 * Recursively canonicalize a schema for structural comparison: sort object keys, drop `description`,
 * and rewrite `$ref`s to their canonical (base) form.
 * @param {*} input - The schema (or fragment) to canonicalize.
 * @param {Object} schemas - The component schemas map used to canonicalize `$ref`s.
 * @returns {*} The canonicalized schema value.
 */
function canonicalizeSchema(input, schemas) {
  if (Array.isArray(input)) return input.map(item => canonicalizeSchema(item, schemas));
  if (!input || typeof input !== "object") return input;
  const schema = input;
  if (schema.$ref) return {
    $ref: canonicalRef(schema.$ref, schemas)
  };
  return Object.fromEntries(Object.entries(input).filter(([key]) => key !== "description").sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, canonicalizeSchema(value, schemas)]));
}
/**
 * Resolve a `$ref` to its canonical form, mapping numeric-suffixed names to their base name when that base exists.
 * @param {string} ref - The original `$ref` string.
 * @param {Object} schemas - The component schemas map used to detect base names.
 * @returns {string} The canonical `$ref` string.
 */
function canonicalRef(ref, schemas) {
  const name = ref.replace("#components/schemas/", "");
  const base = name.replace(/\d+$/, "");
  if (base !== name && schemas[base]) return `#/components/schemas/${base}`;
  return ref;
}
/**
 * Recursively rewrite every `$ref` pointing at the `from` component to point at the `to` component.
 * @param {*} input - The spec value (object/array) to traverse (mutated in place).
 * @param {string} from - The source component name.
 * @param {string} to - The target component name.
 * @returns {void}
 */
function rewriteRefs(input, from, to) {
  if (Array.isArray(input)) {
    for (const item of input) rewriteRefs(item, from, to);
    return;
  }
  if (!input || typeof input !== "object") return;
  const schema = input;
  if (schema.$ref === `#/components/schemas/${from}`) schema.$ref = `#/components/schemas/${to}`;
  for (const value of Object.values(input)) rewriteRefs(value, from, to);
}
/**
 * Replace built-in 400/404 error responses on an operation with the legacy error response shapes.
 * @param {Object} operation - The OpenAPI operation object (mutated in place).
 * @returns {void}
 */
function normalizeLegacyErrorResponses(operation) {
  if (operation.responses?.["400"] && isBuiltInErrorResponse(operation.responses["400"], "BadRequest")) {
    operation.responses["400"] = legacyErrorResponse("Bad request", "BadRequestError");
  }
  if (operation.responses?.["404"] && isBuiltInErrorResponse(operation.responses["404"], "NotFound")) {
    operation.responses["404"] = legacyErrorResponse("Not found", "NotFoundError");
  }
}
/**
 * Apply per-route legacy operation tweaks: drop spurious error responses on specific endpoints and
 * give the message/command POST endpoints their explicit `{info, parts}` 200 response shape.
 * @param {Object} operation - The OpenAPI operation object (mutated in place).
 * @param {string} path - The route path (e.g. `/session/{sessionID}/message`).
 * @param {string} method - The lowercase HTTP method (e.g. `post`).
 * @returns {void}
 */
function normalizeLegacyOperation(operation, path, method) {
  if (path === "/experimental/console/switch" && method === "post") delete operation.responses?.["400"];
  if (path === "/pty/{ptyID}" && method === "put") delete operation.responses?.["404"];
  if (path !== "/session/{sessionID}/message" && path !== "/session/{sessionID}/command" || method !== "post") return;
  const response = operation.responses?.["200"]?.content?.["application/json"];
  if (!response) return;
  response.schema = {
    type: "object",
    required: ["info", "parts"],
    properties: {
      info: {
        $ref: "#components/schemas/AssistantMessage"
      },
      parts: {
        type: "array",
        items: {
          $ref: "#components/schemas/Part"
        }
      }
    }
  };
}
/**
 * Check whether a response's JSON schema is a `$ref` to the named component.
 * @param {Object} response - The OpenAPI response object.
 * @param {string} name - The component name to test against.
 * @returns {boolean} True when the response references `#/components/schemas/<name>`.
 */
function isRefResponse(response, name) {
  return response.content?.["application/json"]?.schema?.$ref === `#/components/schemas/${name}`;
}
/**
 * Determine whether a response is one of Effect's built-in error responses for the given error name.
 * @param {Object} response - The OpenAPI response object.
 * @param {string} name - The built-in error name (e.g. `BadRequest`, `NotFound`).
 * @returns {boolean} True when the response is the built-in error (by description or `$ref`).
 */
function isBuiltInErrorResponse(response, name) {
  return response.description === name || isRefResponse(response, `EffectHttpApiError${name}`);
}
/**
 * Build a legacy error response object that references a named error schema.
 * @param {string} description - The response description.
 * @param {string} name - The component schema name to reference.
 * @returns {Object} An OpenAPI response object with a JSON `$ref` schema.
 */
function legacyErrorResponse(description, name) {
  return {
    description,
    content: {
      "application/json": {
        schema: {
          $ref: `#/components/schemas/${name}`
        }
      }
    }
  };
}

/**
 * Fix component schemas that are self-referencing `$ref`s — an Effect OpenAPI
 * generation bug where annotated union arms that share AST nodes with other
 * endpoints produce `{"$ref":"#components/schemas/X"}` as the definition of X.
 *
 * Resolves by finding the actual schema from a parent union's `anyOf`/`oneOf`
 * that references the broken component, then inlining that schema.
 *
 * @param {Object} spec - The OpenAPI spec object (mutated in place).
 * @returns {void}
 */
function fixSelfReferencingComponents(spec) {
  const schemas = spec.components?.schemas;
  if (!schemas) return;
  const selfRefs = new Set();
  for (const [name, schema] of Object.entries(schemas)) {
    if (schema.$ref === `#/components/schemas/${name}`) selfRefs.add(name);
  }
  if (selfRefs.size === 0) return;
  // Find a parent union component whose anyOf/oneOf contains a $ref to the
  // broken component — that parent was generated correctly and holds the inline
  // schema we need.
  for (const [, schema] of Object.entries(schemas)) {
    for (const member of schema.anyOf ?? schema.oneOf ?? []) {
      const ref = member.$ref?.replace("#components/schemas/", "");
      if (!ref || !selfRefs.has(ref)) continue;
      // This member's $ref points to a self-referencing component. The member
      // itself is just {$ref:...}, so the actual schema must be resolved from
      // the union. Since the union component was generated before the
      // deduplicator broke things, the inline version lives elsewhere. Generate
      // a fresh spec without the transform to get the correct schema.
      // Simpler approach: look through all paths for an endpoint that uses this
      // schema as a payload (it would have been expanded by the ref-expansion
      // logic above if we ran after that, but we run before). Instead, just
      // delete the broken component — if it's referenced via $ref elsewhere,
      // the ref expansion in the request body loop will inline it anyway.
    }
  }
  // Simplest fix: generate the raw spec (without transform) to get correct schemas
  const raw = OpenApi.fromApi(ClosedCodeHttpApi);
  const rawSchemas = raw.components?.schemas;
  if (!rawSchemas) return;
  for (const name of selfRefs) {
    if (rawSchemas[name]) schemas[name] = rawSchemas[name];
  }
}

/**
 * Strip `{type:"null"}` arms that Effect's `Schema.optional` adds to OpenAPI unions, recursing into
 * `allOf`/`anyOf`/`oneOf`, `items`, `properties`, and `additionalProperties`, and collapsing single-arm unions.
 * @param {Object} schema - The schema to normalize (mutated and returned).
 * @returns {Object} The schema with optional-null arms removed.
 */
function stripOptionalNull(schema) {
  if (schema.allOf?.length === 1) {
    const [constraint] = schema.allOf;
    delete schema.allOf;
    return stripOptionalNull({
      ...schema,
      ...constraint
    });
  }
  if (isEmptyObjectUnion(schema)) return {
    type: "object",
    properties: {}
  };
  const options = flattenOptions(schema.anyOf ?? schema.oneOf);
  if (options) {
    const withoutNull = options.filter(item => item.type !== "null");
    if (withoutNull.length === 1) return stripOptionalNull(withoutNull[0]);
    if (schema.anyOf) schema.anyOf = withoutNull.map(stripOptionalNull);
    if (schema.oneOf) schema.oneOf = withoutNull.map(stripOptionalNull);
  }
  if (schema.allOf) {
    const allOf = schema.allOf.map(stripOptionalNull);
    if (schema.type) {
      delete schema.allOf;
      for (const item of allOf) Object.assign(schema, item);
    } else {
      schema.allOf = allOf;
    }
  }
  if (schema.prefixItems && schema.items) delete schema.prefixItems;
  if (schema.items) schema.items = stripOptionalNull(schema.items);
  if (schema.properties) {
    for (const [key, value] of Object.entries(schema.properties)) {
      schema.properties[key] = stripOptionalNull(value);
    }
  }
  if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
    schema.additionalProperties = stripOptionalNull(schema.additionalProperties);
  }
  return schema;
}
/**
 * Detect the degenerate "bare object OR bare array" union that Effect emits for an unconstrained record/array value.
 * @param {Object} schema - The schema to test.
 * @returns {boolean} True when the schema is a two-arm union of a bare object and a bare array.
 */
function isEmptyObjectUnion(schema) {
  const options = schema.anyOf ?? schema.oneOf;
  return options?.length === 2 && options.some(isBareObjectSchema) && options.some(isBareArraySchema);
}
/**
 * Check whether a schema is a bare object type (no `properties` or `additionalProperties`).
 * @param {Object} schema - The schema to test.
 * @returns {boolean} True for a bare object schema.
 */
function isBareObjectSchema(schema) {
  return schema.type === "object" && !schema.properties && !schema.additionalProperties;
}
/**
 * Check whether a schema is a bare array type (no `items` or `prefixItems`).
 * @param {Object} schema - The schema to test.
 * @returns {boolean} True for a bare array schema.
 */
function isBareArraySchema(schema) {
  return schema.type === "array" && !schema.items && !schema.prefixItems;
}
/**
 * Flatten nested `anyOf`/`oneOf` unions into a single flat list of leaf option schemas.
 * @param {Array|undefined} options - The union options to flatten.
 * @returns {Array|undefined} The flattened option list, or undefined when `options` is absent.
 */
function flattenOptions(options) {
  return options?.flatMap(item => flattenOptions(item.anyOf ?? item.oneOf) ?? [item]);
}
/**
 * Normalize an operation parameter's schema for the legacy SDK: apply path/query schema overrides,
 * coerce known number/boolean query params, and otherwise strip optional-null arms.
 * @param {Object} param - The OpenAPI parameter object (mutated in place).
 * @param {string} route - The route key (e.g. `GET /find/file`) used to look up overrides.
 * @returns {void}
 */
function normalizeParameter(param, route) {
  if (!param.schema || typeof param.schema !== "object") return;
  if (param.in === "path") {
    param.schema = pathParameterSchema(route, param.name) ?? stripOptionalNull(param.schema);
    return;
  }
  if (param.in === "query") {
    const override = QueryParameterSchemas[`${route} ${param.name}`];
    if (override) {
      param.schema = override;
      return;
    }
    if (QueryNumberParameters.has(param.name)) {
      param.schema = {
        type: "number"
      };
      return;
    }
    if (QueryBooleanParameters.has(param.name)) {
      param.schema = {
        anyOf: [{
          type: "boolean"
        }, {
          type: "string",
          enum: ["true", "false"]
        }]
      };
      return;
    }
  }
  param.schema = stripOptionalNull(param.schema);
}
/**
 * Resolve the override schema for a path parameter by name, with route-specific patterns for `id`/`requestID`
 * on workspace, permission, and question routes.
 * @param {string} route - The route key (e.g. `DELETE /experimental/workspace/...`).
 * @param {string} name - The path parameter name.
 * @returns {Object|undefined} The override schema, or undefined when there is no override.
 */
function pathParameterSchema(route, name) {
  if (name in PathParameterSchemas) return PathParameterSchemas[name];
  if (name === "id" && route.startsWith("DELETE /experimental/workspace/")) return {
    type: "string",
    pattern: "^wrk.*"
  };
  if (name === "id" && route.startsWith("POST /experimental/workspace/")) return {
    type: "string",
    pattern: "^wrk.*"
  };
  if (name === "requestID" && route.startsWith("POST /permission/")) return {
    type: "string",
    pattern: "^per.*"
  };
  if (name === "requestID" && route.startsWith("POST /question/")) return {
    type: "string",
    pattern: "^que.*"
  };
  return undefined;
}
/** The public closedcode HttpApi, annotated with OpenAPI metadata and the legacy-compatibility spec transform. */
export const PublicApi = ClosedCodeHttpApi.annotateMerge(OpenApi.annotations({
  title: "closedcode",
  version: "1.0.0",
  description: "closedcode api",
  transform: matchLegacyOpenApi
}));