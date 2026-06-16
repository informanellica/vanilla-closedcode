/**
 * @file Config parsing helpers: JSONC parsing with rich error reporting, plus
 * validation of parsed data against both zod and Effect schemas.
 * @module closedcode/config/parse
 */

export * as ConfigParse from "./parse.js";
import { parse as parseJsoncImpl, printParseErrorCode } from "jsonc-parser";
import { Cause, Exit, Schema as EffectSchema, SchemaIssue } from "effect";
import { InvalidError, JsonError } from "./error.js";

/**
 * Parse JSONC (JSON with comments and trailing commas) text into a value.
 * On parse failure, throws a {@link JsonError} whose message includes the input
 * and a per-error report with line/column and a caret pointing at the problem.
 * @param {string} text - The JSONC source text.
 * @param {string} filepath - Path used to label errors (the source of the text).
 * @returns {*} The parsed value.
 * @throws {JsonError} When the text contains JSONC syntax errors.
 */
export function jsonc(text, filepath) {
  const errors = [];
  const data = parseJsoncImpl(text, errors, {
    allowTrailingComma: true
  });
  if (errors.length) {
    const lines = text.split("\n");
    const issues = errors.map(e => {
      const beforeOffset = text.substring(0, e.offset).split("\n");
      const line = beforeOffset.length;
      const column = beforeOffset[beforeOffset.length - 1].length + 1;
      const problemLine = lines[line - 1];
      const error = `${printParseErrorCode(e.error)} at line ${line}, column ${column}`;
      if (!problemLine) return error;
      return `${error}\n   Line ${line}: ${problemLine}\n${"".padStart(column + 9)}^`;
    }).join("\n");
    throw new JsonError({
      path: filepath,
      message: `\n--- JSONC Input ---\n${text}\n--- Errors ---\n${issues}\n--- End ---`
    });
  }
  return data;
}
/**
 * Validate and parse data against a zod schema.
 * @param {Object} schema - A zod schema exposing `safeParse`.
 * @param {*} data - The data to validate.
 * @param {string} source - Path/source label attached to validation errors.
 * @returns {*} The parsed (validated) data.
 * @throws {InvalidError} When validation fails, carrying the zod issues.
 */
export function schema(schema, data, source) {
  const parsed = schema.safeParse(data);
  if (parsed.success) return parsed.data;
  throw new InvalidError({
    path: source,
    issues: parsed.error.issues
  });
}

/**
 * Validate and decode data against an Effect schema, preserving the user's
 * original property order and rejecting unrecognized top-level keys.
 * @param {Object} schema - An Effect schema to decode against.
 * @param {*} data - The data to validate and decode.
 * @param {string} source - Path/source label attached to validation errors.
 * @returns {*} The decoded value.
 * @throws {InvalidError} When unknown top-level keys are present or decoding fails.
 */
export function effectSchema(schema, data, source) {
  const extra = topLevelExtraKeys(schema, data);
  if (extra.length) {
    throw new InvalidError({
      path: source,
      issues: [{
        code: "unrecognized_keys",
        keys: extra,
        path: [],
        message: `Unrecognized key${extra.length === 1 ? "" : "s"}: ${extra.join(", ")}`
      }]
    });
  }
  const decoded = EffectSchema.decodeUnknownExit(schema)(data, {
    errors: "all",
    propertyOrder: "original"
  });
  if (Exit.isSuccess(decoded)) return decoded.value;
  const error = Cause.squash(decoded.cause);
  throw new InvalidError({
    path: source,
    issues: EffectSchema.isSchemaError(error) ? SchemaIssue.makeFormatterStandardSchemaV1()(error.issue).issues : [{
      code: "custom",
      message: String(error),
      path: []
    }]
  }, {
    cause: error
  });
}
/**
 * List top-level keys present in `data` that are not declared by the schema.
 * Returns an empty array unless `data` is a plain object and the schema is a
 * closed object type (no index signatures), since only then are extra keys
 * meaningful.
 * @param {Object} schema - An Effect schema whose AST is inspected.
 * @param {*} data - The data whose keys are checked.
 * @returns {string[]} The unrecognized top-level key names.
 */
function topLevelExtraKeys(schema, data) {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return [];
  if (schema.ast._tag !== "Objects" || schema.ast.indexSignatures.length > 0) return [];
  const known = new Set(schema.ast.propertySignatures.map(item => String(item.name)));
  return Object.keys(data).filter(key => !known.has(key));
}