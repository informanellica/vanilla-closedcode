/** @file Request validation middleware: validates a request segment (param/json/query) against a Zod schema, with a 400 error envelope, plus express-validator field-chain reporting helpers. */
// Request validation middleware: validates param/json/query segments against a
// Zod schema. Reuses the existing Zod schemas (including the `.zod` statics
// derived from Effect schemas via util/effect-zod.js). express-validator is
// used for its standard error reporting shape; the actual structural check is
// the Zod schema's safeParse so we do not have to re-declare every field.
import { validationResult } from "express-validator";

const TARGETS = {
  json: "body",
  param: "params",
  query: "query",
};

// Returns Express middleware that validates the chosen request segment against
// `zodSchema`. On success the parsed value is stored on
// `req.valid[target]`. On failure it responds 400 with:
//   { data, errors: [...], success: false }
/**
 * Build middleware that validates the chosen request segment against a Zod schema.
 * On success the parsed value is stored on req.valid[target]; on failure it responds
 * 400 with { data, errors, success: false }.
 * @param {string} target - Which segment to validate: "json", "param", or "query".
 * @param {*} zodSchema - The Zod schema whose safeParse performs the validation.
 * @returns {Function} An Express middleware (req, res, next).
 */
export function validator(target, zodSchema) {
  const key = TARGETS[target];
  if (!key) throw new Error(`Unknown validator target: ${target}`);
  return (req, res, next) => {
    const input = req[key];
    const result = zodSchema.safeParse(input);
    if (!result.success) {
      return res.status(400).json({
        data: input,
        errors: result.error?.issues ?? [],
        success: false,
      });
    }
    req.valid ??= {};
    req.valid[target] = result.data;
    next();
  };
}

// Re-export express-validator's result helper for routes that prefer the
// native field-chain style (check("x").isString() ...). Express groups can
// pick either approach.
export { validationResult };

// Middleware reporting express-validator field-chain failures in the same 400
// envelope as the Zod path above.
/**
 * Middleware that reports express-validator field-chain failures using the same
 * 400 envelope as the Zod validator; passes through when there are no errors.
 * @param {Object} req - The Express request.
 * @param {Object} res - The Express response.
 * @param {Function} next - Passes control on when validation passed.
 * @returns {*} The 400 JSON response on failure, otherwise the result of next().
 */
export function reportValidation(req, res, next) {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    return res.status(400).json({ data: { ...req.body, ...req.params, ...req.query }, errors: result.array(), success: false });
  }
  next();
}
