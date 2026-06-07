export * as ConfigParse from "./parse.js";
import { parse as parseJsoncImpl, printParseErrorCode } from "jsonc-parser";
import { Cause, Exit, Schema as EffectSchema, SchemaIssue } from "effect";
import { InvalidError, JsonError } from "./error.js";
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
export function schema(schema, data, source) {
  const parsed = schema.safeParse(data);
  if (parsed.success) return parsed.data;
  throw new InvalidError({
    path: source,
    issues: parsed.error.issues
  });
}
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
function topLevelExtraKeys(schema, data) {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return [];
  if (schema.ast._tag !== "Objects" || schema.ast.indexSignatures.length > 0) return [];
  const known = new Set(schema.ast.propertySignatures.map(item => String(item.name)));
  return Object.keys(data).filter(key => !known.has(key));
}