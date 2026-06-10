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

export function errors(...codes) {
  return Object.fromEntries(codes.map(code => [code, ERRORS[code]]));
}
