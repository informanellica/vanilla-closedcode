/** @file Shared error response schemas (400/404) for OpenAPI-documented routes, plus a helper to spread them into a route's responses. */
// Shared error response schemas for OpenAPI-documented routes. Response schemas
// are raw Zod schemas; ./openapi.js resolve()/registerOperation converts them to
// JSON Schema via z.toJSONSchema.
//
//   400 -> { data, errors: [...], success: false } (ref "BadRequestError")
//   404 -> NotFoundError.Schema
//
// Route groups spread these into their describeRoute responses, e.g.
//   responses: { 200: {...}, ...errors(400) }  /  ...errors(404)  /  ...errors(400, 404)
import z from "zod";
import { NotFoundError } from "#storage/storage.js";

export const ERRORS = {
  400: {
    description: "Bad request",
    content: {
      "application/json": {
        // Raw Zod schema; ./openapi.js resolve() registers it under
        // components/schemas via the .meta({ ref }) marker.
        schema: z.object({
          data: z.any(),
          errors: z.array(z.record(z.string(), z.any())),
          success: z.literal(false)
        }).meta({
          ref: "BadRequestError"
        })
      }
    }
  },
  404: {
    description: "Not found",
    content: {
      "application/json": {
        schema: NotFoundError.Schema
      }
    }
  }
};

/**
 * Build a responses fragment for the given HTTP error status codes, for spreading
 * into a route's describeRoute responses (e.g. ...errors(400, 404)).
 * @param {...number} codes - One or more status codes present in ERRORS (400, 404).
 * @returns {Object} A map of status code to its shared error response definition.
 */
export function errors(...codes) {
  return Object.fromEntries(codes.map(code => [code, ERRORS[code]]));
}
