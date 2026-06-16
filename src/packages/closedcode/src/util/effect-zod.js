/** @file Derives Zod schemas (and JSON Schema) from Effect Schema ASTs by walking and translating each node. */

import { Effect, Option, SchemaAST } from "effect";
import z from "zod";

/**
 * Annotation key for providing a hand-crafted Zod schema that the walker
 * should use instead of re-deriving from the AST.  Attach it via
 * `Schema.String.annotate({ [ZodOverride]: z.string().startsWith("per") })`.
 */
export const ZodOverride = Symbol.for("effect-zod/override");

// AST nodes are immutable and frequently shared across schemas (e.g. a single
// Schema.Class embedded in multiple parents). Memoizing by node identity
// avoids rebuilding equivalent Zod subtrees and keeps derived children stable
// by reference across callers.
const walkCache = new WeakMap();

// Shared empty ParseOptions for the rare callers that need one — avoids
// allocating a fresh object per parse inside refinements and transforms.
const EMPTY_PARSE_OPTIONS = {};

/**
 * Derive a Zod type from an Effect Schema by walking its AST.
 *
 * @param {Object} schema - An Effect Schema (anything exposing an `.ast`).
 * @returns {Object} The equivalent Zod type.
 */
export function zod(schema) {
  return walk(schema.ast);
}

/**
 * Derive a Zod value from an Effect Schema (or a Schema-backed export with a
 * `.zod` static) and narrow the result to `z.ZodObject<any>` so `.shape`,
 * `.omit`, `.extend`, and friends are accessible.
 *
 * The `zod()` walker returns `z.ZodType<T>` because not every AST node decodes
 * to an object; this helper keeps the "I started from a `Schema.Struct`" cast
 * in one place instead of sprinkling `as unknown as z.ZodObject<any>` across
 * call sites.
 *
 * The return is intentionally loose — carrying Schema field types through the
 * mapped `.omit()` / `.extend()` surface triggers brand-intersection
 * explosions for branded primitives (`string & Brand<"SessionID">` extends
 * `object` via the brand and gets walked into the prototype by `DeepPartial`,
 * `updateSchema`, etc.), and zod's inference through `z.ZodType<T | undefined>`
 * wrappers also can't reconstruct `T` cleanly. Consumers that care about the
 * post-`.omit()` shape should cast `c.req.valid(...)` to the expected type.
 *
 * @param {Object} schema - An Effect Schema; if it carries a `.zod` static that
 *   is already a Zod type, that is used directly, otherwise the AST is walked.
 * @returns {Object} The derived Zod object type.
 */
export function zodObject(schema) {
  const derived = "zod" in schema && isZodType(schema.zod) ? schema.zod : walk(schema.ast);
  return derived;
}

/**
 * Test whether a value is a Zod type instance (detected by its internal `_zod`).
 *
 * @param {*} value - The candidate value.
 * @returns {boolean} `true` when `value` looks like a Zod type.
 */
function isZodType(value) {
  return typeof value === "object" && value !== null && "_zod" in value;
}

/**
 * Emit a JSON Schema for a tool/route parameter schema — derives the zod form
 * via the walker so Effect Schema inputs flow through the same zod-openapi
 * pipeline the LLM/SDK layer already depends on.  `io: "input"` mirrors what
 * `session/prompt.ts` has always passed to `ai`'s `jsonSchema()` helper.
 *
 * @param {Object} schema - An Effect Schema to convert.
 * @returns {Object} The JSON Schema (input variant) for `schema`.
 */
export function toJsonSchema(schema) {
  return z.toJSONSchema(zod(schema), {
    io: "input"
  });
}
/**
 * Convert an AST node into a Zod type, memoized by node identity.
 *
 * @param {Object} ast - The Effect Schema AST node.
 * @returns {Object} The corresponding Zod type (cached across calls).
 */
function walk(ast) {
  const cached = walkCache.get(ast);
  if (cached) return cached;
  const result = walkUncached(ast);
  walkCache.set(ast, result);
  return result;
}

/**
 * Build the Zod type for an AST node without consulting the cache.
 *
 * Honors a `ZodOverride` annotation as the base type (otherwise derives via
 * `bodyWithChecks`), then layers on any resolved description (`.describe`) and
 * identifier reference (`.meta({ ref })`).
 *
 * @param {Object} ast - The Effect Schema AST node.
 * @returns {Object} The derived Zod type.
 */
function walkUncached(ast) {
  const override = ast.annotations?.[ZodOverride];
  // `description` annotations layer on top of an override so callers can
  // reuse a shared override schema (e.g. `SessionID`) and still add a
  // per-field description on the outer wrapper.
  const base = override ?? bodyWithChecks(ast);
  const desc = SchemaAST.resolveDescription(ast);
  const ref = SchemaAST.resolveIdentifier(ast);
  const described = desc ? base.describe(desc) : base;
  return ref ? described.meta({
    ref
  }) : described;
}
/**
 * Build the base Zod type for a node, choosing between the decoded body and the
 * encoded/transformed view, then applying any filter checks.
 *
 * @param {Object} ast - The Effect Schema AST node.
 * @returns {Object} The Zod type with checks applied.
 */
function bodyWithChecks(ast) {
  // Schema.Class wraps its fields in a Declaration AST plus an encoding that
  // constructs the class instance. For the Zod derivation we want the plain
  // field shape (the decoded/consumer view), not the class instance — so
  // Declarations fall through to body(), not encoded(). User-level
  // Schema.decodeTo / Schema.transform attach encoding to non-Declaration
  // nodes, where we do apply the transform.
  //
  // Schema.withDecodingDefault also attaches encoding, but we want `.default(v)`
  // on the inner Zod rather than a transform wrapper — so optional ASTs whose
  // encoding resolves a default from Option.none() route through body()/opt().
  const hasEncoding = ast.encoding?.length && (ast._tag !== "Declaration" || ast.typeParameters.length === 0);
  const hasTransform = hasEncoding && !(SchemaAST.isOptional(ast) && extractDefault(ast) !== undefined);
  const base = hasTransform ? encoded(ast) : body(ast);
  return ast.checks?.length ? applyChecks(base, ast.checks, ast) : base;
}

/**
 * Build a Zod type from a node's encoded side, applying each link's decode as a
 * `.transform` to recover the decoded shape.
 *
 * @param {Object} ast - The AST node carrying a non-empty `encoding` array.
 * @returns {Object} A Zod type that decodes through the encoding links.
 */
// Walk the encoded side and apply each link's decode to produce the decoded
// shape. A node `Target` produced by `from.decodeTo(Target)` carries
// `Target.encoding = [Link(from, transformation)]`. Chained decodeTo calls
// nest the encoding via `Link.to` so walking it recursively threads all
// prior transforms — typical encoding.length is 1.
function encoded(ast) {
  const encoding = ast.encoding;
  return encoding.reduce((acc, link) => acc.transform(v => decode(link.transformation, v)), walk(encoding[0].to));
}

/**
 * Synchronously run an Effect Schema transformation's decode on a value.
 *
 * @param {Object} transformation - The link transformation to run.
 * @param {*} value - The input value to decode.
 * @returns {*} The decoded value, or the original `value` when the decode
 *   yields `Option.none`.
 * @throws {Error} When the transformation fails (e.g. effectful transforms).
 */
// Transformations built via pure `SchemaGetter.transform(fn)` (the common
// decodeTo case) resolve synchronously, so running with no services is safe.
// Effectful / middleware-based transforms will surface as Effect defects.
function decode(transformation, value) {
  const exit = Effect.runSyncExit(transformation.decode.run(Option.some(value), EMPTY_PARSE_OPTIONS));
  if (exit._tag === "Failure") throw new Error(`effect-zod: transform failed: ${String(exit.cause)}`);
  return Option.getOrElse(exit.value, () => value);
}

/**
 * Apply Effect Schema filter checks to a Zod type.
 *
 * Well-known filters are translated to native Zod constraints (so they appear
 * in JSON Schema); any unrecognized filters are collected into a single
 * runtime-only `.superRefine` layer.
 *
 * @param {Object} out - The base Zod type to constrain.
 * @param {Array} checks - The AST's checks (Filters and/or FilterGroups).
 * @param {Object} ast - The owning AST node (passed to filters' `run`).
 * @returns {Object} The Zod type with all checks applied.
 */
// Flatten FilterGroups and any nested variants into a linear list of Filters.
// Well-known filters (Schema.isInt, isGreaterThan, isPattern, …) are
// translated into native Zod methods so their JSON Schema output includes
// the corresponding constraint (type: integer, exclusiveMinimum, pattern, …).
// Anything else falls back to a single .superRefine layer — runtime-only,
// emits no JSON Schema constraint.
function applyChecks(out, checks, ast) {
  const filters = [];
  const collect = c => {
    if (c._tag === "FilterGroup") c.checks.forEach(collect);else filters.push(c);
  };
  checks.forEach(collect);
  const unhandled = [];
  const translated = filters.reduce((acc, filter) => {
    const next = translateFilter(acc, filter);
    if (next) return next;
    unhandled.push(filter);
    return acc;
  }, out);
  if (unhandled.length === 0) return translated;
  return translated.superRefine((value, ctx) => {
    for (const filter of unhandled) {
      const issue = filter.run(value, ast, EMPTY_PARSE_OPTIONS);
      if (!issue) continue;
      const message = issueMessage(issue) ?? filter.annotations?.message ?? "Validation failed";
      ctx.addIssue({
        code: "custom",
        message
      });
    }
  });
}

/**
 * Translate a single well-known Effect Schema filter into a native Zod call.
 *
 * @param {Object} out - The Zod type to apply the constraint to.
 * @param {Object} filter - The filter whose `annotations.meta._tag` selects the
 *   Zod method to invoke.
 * @returns {Object} The constrained Zod type, or `undefined` when the filter is
 *   not recognized (so the caller falls back to `.superRefine`).
 */
// Translate a well-known Effect Schema filter into a native Zod method call on
// `out`. Dispatch is keyed on `filter.annotations.meta._tag`, which every
// built-in check factory (isInt, isGreaterThan, isPattern, …) attaches at
// construction time. Returns `undefined` for unrecognised filters so the
// caller can fall back to the generic .superRefine path.
function translateFilter(out, filter) {
  const meta = filter.annotations?.meta;
  if (!meta || typeof meta._tag !== "string") return undefined;
  switch (meta._tag) {
    case "isInt":
      return call(out, "int");
    case "isFinite":
      return call(out, "finite");
    case "isGreaterThan":
      return call(out, "gt", meta.exclusiveMinimum);
    case "isGreaterThanOrEqualTo":
      return call(out, "gte", meta.minimum);
    case "isLessThan":
      return call(out, "lt", meta.exclusiveMaximum);
    case "isLessThanOrEqualTo":
      return call(out, "lte", meta.maximum);
    case "isBetween":
      {
        const lo = meta.exclusiveMinimum ? call(out, "gt", meta.minimum) : call(out, "gte", meta.minimum);
        if (!lo) return undefined;
        return meta.exclusiveMaximum ? call(lo, "lt", meta.maximum) : call(lo, "lte", meta.maximum);
      }
    case "isMultipleOf":
      return call(out, "multipleOf", meta.divisor);
    case "isMinLength":
      return call(out, "min", meta.minLength);
    case "isMaxLength":
      return call(out, "max", meta.maxLength);
    case "isLengthBetween":
      {
        const lo = call(out, "min", meta.minimum);
        if (!lo) return undefined;
        return call(lo, "max", meta.maximum);
      }
    case "isPattern":
      return call(out, "regex", meta.regExp);
    case "isStartsWith":
      return call(out, "startsWith", meta.startsWith);
    case "isEndsWith":
      return call(out, "endsWith", meta.endsWith);
    case "isIncludes":
      return call(out, "includes", meta.includes);
    case "isUUID":
      return call(out, "uuid");
    case "isULID":
      return call(out, "ulid");
    case "isBase64":
      return call(out, "base64");
    case "isBase64Url":
      return call(out, "base64url");
  }
  return undefined;
}

/**
 * Invoke a named Zod method on a target if present.
 *
 * @param {Object} target - The Zod type to call the method on.
 * @param {string} method - The method name to invoke.
 * @param {...*} args - Arguments forwarded to the method.
 * @returns {*} The method's result, or `undefined` when no such method exists.
 */
// Invoke a named Zod method on `target` if it exists, otherwise return
// undefined so the caller can fall back. Using this helper instead of a
// typed cast keeps `translateFilter` free of per-case narrowing noise.
function call(target, method, ...args) {
  const fn = target[method];
  return typeof fn === "function" ? fn.apply(target, args) : undefined;
}

/**
 * Extract a human-readable message from an Effect Schema validation issue.
 *
 * @param {Object} issue - The issue object (may carry `annotations.message` or `message`).
 * @returns {string} The message string, or `undefined` when none is present.
 */
function issueMessage(issue) {
  if (typeof issue?.annotations?.message === "string") return issue.annotations.message;
  if (typeof issue?.message === "string") return issue.message;
  return undefined;
}
/**
 * Map a (decoded-view) AST node to its base Zod type by node tag.
 *
 * Optional nodes are delegated to `opt`; primitives, literals, unions, objects,
 * arrays, and single-parameter declarations are each translated; anything
 * unsupported routes to `fail`.
 *
 * @param {Object} ast - The Effect Schema AST node.
 * @returns {Object} The corresponding base Zod type.
 */
function body(ast) {
  if (SchemaAST.isOptional(ast)) return opt(ast);
  switch (ast._tag) {
    case "String":
      return z.string();
    case "Number":
      return z.number();
    case "Boolean":
      return z.boolean();
    case "Null":
      return z.null();
    case "Undefined":
      return z.undefined();
    case "Any":
    case "Unknown":
      return z.unknown();
    case "Never":
      return z.never();
    case "Literal":
      return z.literal(ast.literal);
    case "Union":
      return union(ast);
    case "Objects":
      return object(ast);
    case "Arrays":
      return array(ast);
    case "Declaration":
      return decl(ast);
    default:
      return fail(ast);
  }
}
/**
 * Build the Zod type for an optional node (a Union containing `Undefined`).
 *
 * Drops the `Undefined` member and emits `.default(...)` when the encoding
 * supplies a decoding default, otherwise `.optional()`.
 *
 * @param {Object} ast - The optional Union AST node.
 * @returns {Object} The optional (or defaulted) Zod type.
 */
function opt(ast) {
  if (ast._tag !== "Union") return fail(ast);
  const items = ast.types.filter(item => item._tag !== "Undefined");
  const inner = items.length === 1 ? walk(items[0]) : items.length > 1 ? z.union(items.map(walk)) : z.undefined();
  // Schema.withDecodingDefault attaches an encoding `Link` whose transformation
  // decode Getter resolves `Option.none()` to `Option.some(default)`.  Invoke
  // it to extract the default and emit `.default(...)` instead of `.optional()`.
  const fallback = extractDefault(ast);
  if (fallback !== undefined) return inner.default(fallback.value);
  return inner.optional();
}
/**
 * Probe a node's encoding for a decoding default produced from `Option.none`.
 *
 * @param {Object} ast - The AST node to inspect.
 * @returns {Object} `{ value }` wrapping the default when one is found, or
 *   `undefined` when no encoding link yields a default.
 */
function extractDefault(ast) {
  const encoding = ast.encoding;
  if (!encoding?.length) return undefined;
  // Walk the chain of encoding Links in order; the first Getter that produces
  // a value from Option.none wins.  withDecodingDefault always puts its
  // defaulting Link adjacent to the optional Union.
  for (const link of encoding) {
    const probe = Effect.runSyncExit(link.transformation.decode.run(Option.none(), {}));
    if (probe._tag !== "Success") continue;
    if (Option.isSome(probe.value)) return {
      value: probe.value.value
    };
  }
  return undefined;
}
/**
 * Build the Zod type for a Union node.
 *
 * Emits `z.enum` when every member is a string literal, collapses a single
 * member, uses `z.discriminatedUnion` when a `discriminator` annotation is
 * present, and otherwise `z.union`.
 *
 * @param {Object} ast - The Union AST node.
 * @returns {Object} The corresponding Zod type.
 */
function union(ast) {
  // When every member is a string literal, emit z.enum() so that
  // JSON Schema produces { "enum": [...] } instead of { "anyOf": [{ "const": ... }] }.
  if (ast.types.length >= 2 && ast.types.every(t => t._tag === "Literal" && typeof t.literal === "string")) {
    return z.enum(ast.types.map(t => t.literal));
  }
  const items = ast.types.map(walk);
  if (items.length === 1) return items[0];
  if (items.length < 2) return fail(ast);
  const discriminator = ast.annotations?.discriminator;
  if (typeof discriminator === "string") {
    return z.discriminatedUnion(discriminator, items);
  }
  return z.union(items);
}
/**
 * Build the Zod type for an object/struct node.
 *
 * Handles three shapes: a pure string-keyed record (`z.record`), a plain object
 * with known fields (`z.object`), and a struct with a string-keyed catchall
 * (`z.object(...).catchall(...)`). Unsupported key kinds route to `fail`.
 *
 * @param {Object} ast - The object/struct AST node.
 * @returns {Object} The corresponding Zod type.
 */
function object(ast) {
  // Pure record: { [k: string]: V }
  if (ast.propertySignatures.length === 0 && ast.indexSignatures.length === 1) {
    const sig = ast.indexSignatures[0];
    if (sig.parameter._tag !== "String") return fail(ast);
    return z.record(z.string(), walk(sig.type));
  }

  // Pure object with known fields and no index signatures.
  if (ast.indexSignatures.length === 0) {
    return z.object(Object.fromEntries(ast.propertySignatures.map(sig => [String(sig.name), walk(sig.type)])));
  }

  // Struct with a catchall (StructWithRest): known fields + index signature.
  // Only supports a single string-keyed index signature; multi-signature or
  // symbol/number keys fall through to fail.
  if (ast.indexSignatures.length !== 1) return fail(ast);
  const sig = ast.indexSignatures[0];
  if (sig.parameter._tag !== "String") return fail(ast);
  return z.object(Object.fromEntries(ast.propertySignatures.map(p => [String(p.name), walk(p.type)]))).catchall(walk(sig.type));
}
/**
 * Build the Zod type for an array/tuple node.
 *
 * Emits `z.array` for a pure variadic array and `z.tuple` for a fixed-length
 * tuple. Tuples with a variadic tail are unsupported and route to `fail`.
 *
 * @param {Object} ast - The array/tuple AST node.
 * @returns {Object} The corresponding Zod type.
 */
function array(ast) {
  // Pure variadic arrays: { elements: [], rest: [item] }
  if (ast.elements.length === 0) {
    if (ast.rest.length !== 1) return fail(ast);
    return z.array(walk(ast.rest[0]));
  }
  // Fixed-length tuples: { elements: [a, b, ...], rest: [] }
  // Tuples with a variadic tail (...rest) are not yet supported.
  if (ast.rest.length > 0) return fail(ast);
  const items = ast.elements.map(walk);
  return z.tuple(items);
}
/**
 * Build the Zod type for a Declaration node by walking its single type parameter.
 *
 * @param {Object} ast - The Declaration AST node (must have exactly one type parameter).
 * @returns {Object} The Zod type for the wrapped type parameter.
 */
function decl(ast) {
  if (ast.typeParameters.length !== 1) return fail(ast);
  return walk(ast.typeParameters[0]);
}

/**
 * Throw a descriptive error for an AST node that the walker cannot translate.
 *
 * @param {Object} ast - The unsupported AST node.
 * @returns {never} Always throws.
 * @throws {Error} Always, naming the node's identifier or tag.
 */
function fail(ast) {
  const ref = SchemaAST.resolveIdentifier(ast);
  throw new Error(`unsupported effect schema: ${ref ?? ast._tag}`);
}