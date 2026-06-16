// First-party port of the subset of @solid-primitives/i18n the app uses
// (flatten / resolveTemplate / translator). Stage R3 of the solid-free
// reactivity milestone — internalized so the dependency leaves node_modules.
// The upstream module is pure (no solid-js imports); this is a faithful copy of
// the used exports. Unused upstream exports (prefix / template / scopedTranslator
// / chainedTranslator / proxyTranslator) are omitted.
//
// Port/derivative of @solid-primitives/i18n (MIT License,
// Copyright (c) 2021 Solid Primitives Working Group). See THIRD-PARTY-NOTICES.md.

/** @file First-party port of the @solid-primitives/i18n subset used by the app (flatten / resolveTemplate / translator). */

/**
 * Test whether a value is a plain dictionary (a plain object or array) worth
 * recursing into when flattening.
 *
 * @param {*} value - Candidate value to inspect.
 * @returns {boolean} True when `value` is an array or plain object.
 */
const isDict = value =>
  value != null &&
  ((value = Object.getPrototypeOf(value)),
  value === Array.prototype || value === Object.prototype);

/**
 * Recursively copy each nested key of `dict` into `flatDict` under its dotted
 * key path (mutates `flatDict` in place).
 *
 * @param {Object} flatDict - Accumulator receiving the dotted-path entries.
 * @param {Object} dict - Nested dictionary being visited.
 * @param {string} path - Dotted key path prefix for the current `dict`.
 * @returns {void}
 */
function visitDict(flatDict, dict, path) {
  for (const [key, value] of Object.entries(dict)) {
    const keyPath = `${path}.${key}`;
    flatDict[keyPath] = value;
    isDict(value) && visitDict(flatDict, value, keyPath);
  }
}

// Flatten a nested dictionary so each nested property is also reachable by its
// dotted key path (the original nested values are kept too).
/**
 * Flatten a nested dictionary so each nested property is also reachable by its
 * dotted key path. Original nested values are preserved alongside the flat keys.
 *
 * @param {Object} dict - Source (possibly nested) dictionary.
 * @returns {Object} A new dictionary containing both nested and dotted-path keys.
 */
export function flatten(dict) {
  const flatDict = { ...dict };
  for (const [key, value] of Object.entries(dict)) {
    isDict(value) && visitDict(flatDict, value, key);
  }
  return flatDict;
}

// Replace `{{ key }}` placeholders with args.key. No args -> returned as-is.
/**
 * Replace `{{ key }}` placeholders in a template string with values from `args`.
 *
 * @param {string} string - Template string containing `{{ key }}` placeholders.
 * @param {Object} args - Map of placeholder names to replacement values.
 * @returns {string} The string with placeholders substituted (or returned as-is if no args).
 */
export const resolveTemplate = (string, args) => {
  if (args)
    for (const [key, value] of Object.entries(args))
      string = string.replace(new RegExp(`{{\\s*${key}\\s*}}`, "g"), value);
  return string;
};

// Default resolver used when none is provided: identity.
/**
 * Default template resolver: returns the value unchanged.
 *
 * @param {*} v - Value to return verbatim.
 * @returns {*} The same value passed in.
 */
export const identityResolveTemplate = v => v;

// Build a translate function over a reactive flat dictionary accessor.
// value typeof: function -> called with args; string -> run through the
// template resolver; otherwise returned verbatim.
/**
 * Build a translate function over a reactive flat dictionary accessor. The
 * returned function looks up a dotted key path; function values are called with
 * the args, string values run through the template resolver, others are returned
 * verbatim.
 *
 * @param {Function} dict - Accessor returning the (flattened) dictionary.
 * @param {Function} resolveTemplateFn - Resolver applied to string values; defaults to identity.
 * @returns {Function} A translate function `(path, ...args)` returning the resolved value.
 */
export function translator(dict, resolveTemplateFn = identityResolveTemplate) {
  return (path, ...args) => {
    if (path[0] === ".") path = path.slice(1);
    const value = dict()?.[path];
    switch (typeof value) {
      case "function":
        return value(...args);
      case "string":
        return resolveTemplateFn(value, args[0]);
      default:
        return value;
    }
  };
}
