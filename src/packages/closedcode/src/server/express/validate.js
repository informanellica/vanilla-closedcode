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
export function reportValidation(req, res, next) {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    return res.status(400).json({ data: { ...req.body, ...req.params, ...req.query }, errors: result.array(), success: false });
  }
  next();
}
