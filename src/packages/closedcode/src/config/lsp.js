/** @file Config schema for LSP servers (enable/disable, command, extensions, env). */
export * as ConfigLSP from "./lsp.js";
import { Schema } from "effect";
import { zod } from "#util/effect-zod.js";
import { withStatics } from "#util/schema.js";
import * as LSPServer from "../lsp/server.js";
/**
 * Schema for an explicitly disabled LSP server entry (`{ disabled: true }`).
 * Exposes a derived `.zod` compatibility schema.
 */
export const Disabled = Schema.Struct({
  disabled: Schema.Literal(true)
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
/**
 * Schema for a single LSP server entry: either {@link Disabled} or an object with
 * `command`, optional `extensions`, `disabled`, `env`, and `initialization` options.
 * Exposes a derived `.zod` compatibility schema.
 */
export const Entry = Schema.Union([Disabled, Schema.Struct({
  command: Schema.mutable(Schema.Array(Schema.String)),
  extensions: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
  disabled: Schema.optional(Schema.Boolean),
  env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  initialization: Schema.optional(Schema.Record(Schema.String, Schema.Unknown))
})]).pipe(withStatics(s => ({
  zod: zod(s)
})));

/**
 * For custom (non-builtin) LSP server entries, `extensions` is required so the
 * client knows which files the server should attach to. Builtin server IDs and
 * explicitly disabled entries are exempt.
 */
export const requiresExtensionsForCustomServers = Schema.makeFilter(data => {
  if (typeof data === "boolean") return undefined;
  const serverIds = new Set(Object.values(LSPServer).map(server => server.id));
  const ok = Object.entries(data).every(([id, config]) => {
    if ("disabled" in config && config.disabled) return true;
    if (serverIds.has(id)) return true;
    return "extensions" in config && Boolean(config.extensions);
  });
  return ok ? undefined : "For custom LSP servers, 'extensions' array is required.";
});
/**
 * Schema for the `lsp` config value: either a boolean toggle for built-ins or a
 * record of server id to {@link Entry}, checked by {@link requiresExtensionsForCustomServers}.
 * Exposes a derived `.zod` compatibility schema.
 */
export const Info = Schema.Union([Schema.Boolean, Schema.Record(Schema.String, Entry)]).check(requiresExtensionsForCustomServers).pipe(withStatics(s => ({
  zod: zod(s)
})));