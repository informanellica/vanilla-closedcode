/** @file Helpers for attaching OpenAPI descriptions to HttpApi schemas and endpoint responses. */
import { OpenApi } from "effect/unstable/httpapi";
/**
 * Annotate a schema with a human-readable description for OpenAPI documentation.
 * @param {Object} schema - The Effect schema to annotate.
 * @param {string} description - The description to attach to the schema.
 * @returns {Object} A new schema carrying the description annotation.
 */
export function described(schema, description) {
  return schema.annotate({
    description
  });
}
/**
 * Build an OpenAPI annotation that overrides the description of an endpoint's 200 response.
 * @param {string} description - The description to set on the operation's "200" response.
 * @returns {Object} An OpenApi annotations object with a transform that rewrites the 200 response description.
 */
export function responseDescription(description) {
  return OpenApi.annotations({
    transform: operation => {
      const response = operation.responses?.["200"];
      if (response && typeof response === "object" && "description" in response) {
        response.description = description;
      }
      return operation;
    }
  });
}