// First-party port of the subset of @solid-primitives/i18n the app uses
// (flatten / resolveTemplate / translator). Stage R3 of the solid-free
// reactivity milestone — internalized so the dependency leaves node_modules.
// The upstream module is pure (no solid-js imports); this is a faithful copy of
// the used exports. Unused upstream exports (prefix / template / scopedTranslator
// / chainedTranslator / proxyTranslator) are omitted.
//
// Port/derivative of @solid-primitives/i18n (MIT License,
// Copyright (c) 2021 Solid Primitives Working Group). See THIRD-PARTY-NOTICES.md.

const isDict = value =>
  value != null &&
  ((value = Object.getPrototypeOf(value)),
  value === Array.prototype || value === Object.prototype);

function visitDict(flatDict, dict, path) {
  for (const [key, value] of Object.entries(dict)) {
    const keyPath = `${path}.${key}`;
    flatDict[keyPath] = value;
    isDict(value) && visitDict(flatDict, value, keyPath);
  }
}

// Flatten a nested dictionary so each nested property is also reachable by its
// dotted key path (the original nested values are kept too).
export function flatten(dict) {
  const flatDict = { ...dict };
  for (const [key, value] of Object.entries(dict)) {
    isDict(value) && visitDict(flatDict, value, key);
  }
  return flatDict;
}

// Replace `{{ key }}` placeholders with args.key. No args -> returned as-is.
export const resolveTemplate = (string, args) => {
  if (args)
    for (const [key, value] of Object.entries(args))
      string = string.replace(new RegExp(`{{\\s*${key}\\s*}}`, "g"), value);
  return string;
};

// Default resolver used when none is provided: identity.
export const identityResolveTemplate = v => v;

// Build a translate function over a reactive flat dictionary accessor.
// value typeof: function -> called with args; string -> run through the
// template resolver; otherwise returned verbatim.
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
