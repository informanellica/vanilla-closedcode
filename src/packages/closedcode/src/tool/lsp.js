/** @file "lsp" tool: exposes Language Server Protocol queries (definition, references, hover, symbols, call hierarchy, etc.) for a file/position to the model. */
import { assetText } from "#util/asset.js";
import { Effect, Schema } from "effect";
import * as Tool from "./tool.js";
import path from "path";
import { LSP } from "#lsp/lsp.js";
const DESCRIPTION = assetText("tool/lsp.txt");
import { InstanceState } from "#effect/instance-state.js";
import { pathToFileURL } from "url";
import { assertExternalDirectoryEffect } from "./external-directory.js";
import { AppFileSystem } from "core/filesystem";
/** Supported LSP operation names accepted by the tool's `operation` parameter. */
const operations = ["goToDefinition", "findReferences", "hover", "documentSymbol", "workspaceSymbol", "goToImplementation", "prepareCallHierarchy", "incomingCalls", "outgoingCalls"];
/**
 * Parameter schema for the lsp tool: the `operation` to run, the `filePath`, the 1-based `line` and
 * `character` position, and an optional `query` (used by workspaceSymbol).
 */
export const Parameters = Schema.Struct({
  operation: Schema.Literals(operations).annotate({
    description: "The LSP operation to perform"
  }),
  filePath: Schema.String.annotate({
    description: "The absolute or relative path to the file"
  }),
  line: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)).annotate({
    description: "The line number (1-based, as shown in editors)"
  }),
  character: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)).annotate({
    description: "The character offset (1-based, as shown in editors)"
  }),
  query: Schema.optional(Schema.String).annotate({
    description: "Search query for workspaceSymbol. Empty string requests all symbols."
  })
});
/**
 * The "lsp" tool definition. Resolves the file path, asks for lsp/external-directory permission,
 * converts the 1-based line/character into a 0-based LSP position, verifies the file exists and an
 * LSP client is available, then dispatches the requested operation and serializes the result as JSON.
 */
export const LspTool = Tool.define("lsp", Effect.gen(function* () {
  const lsp = yield* LSP.Service;
  const fs = yield* AppFileSystem.Service;
  return {
    description: DESCRIPTION,
    parameters: Parameters,
    execute: (args, ctx) => Effect.gen(function* () {
      const instance = yield* InstanceState.context;
      const file = path.isAbsolute(args.filePath) ? args.filePath : path.join(instance.directory, args.filePath);
      yield* assertExternalDirectoryEffect(ctx, file);
      const meta = args.operation === "workspaceSymbol" ? {
        operation: args.operation
      } : args.operation === "documentSymbol" ? {
        operation: args.operation,
        filePath: file
      } : {
        operation: args.operation,
        filePath: file,
        line: args.line,
        character: args.character
      };
      yield* ctx.ask({
        permission: "lsp",
        patterns: ["*"],
        always: ["*"],
        metadata: meta
      });
      const uri = pathToFileURL(file).href;
      const position = {
        file,
        line: args.line - 1,
        character: args.character - 1
      };
      const relPath = path.relative(instance.worktree, file);
      const detail = args.operation === "workspaceSymbol" ? "" : args.operation === "documentSymbol" ? relPath : `${relPath}:${args.line}:${args.character}`;
      const title = detail ? `${args.operation} ${detail}` : args.operation;
      const exists = yield* fs.existsSafe(file);
      if (!exists) throw new Error(`File not found: ${file}`);
      const available = yield* lsp.hasClients(file);
      if (!available) throw new Error("No LSP server available for this file type.");
      yield* lsp.touchFile(file, "document");
      const result = yield* (() => {
        switch (args.operation) {
          case "goToDefinition":
            return lsp.definition(position);
          case "findReferences":
            return lsp.references(position);
          case "hover":
            return lsp.hover(position);
          case "documentSymbol":
            return lsp.documentSymbol(uri);
          case "workspaceSymbol":
            return lsp.workspaceSymbol(args.query ?? "");
          case "goToImplementation":
            return lsp.implementation(position);
          case "prepareCallHierarchy":
            return lsp.prepareCallHierarchy(position);
          case "incomingCalls":
            return lsp.incomingCalls(position);
          case "outgoingCalls":
            return lsp.outgoingCalls(position);
        }
      })();
      return {
        title,
        metadata: {
          result
        },
        output: result.length === 0 ? `No results found for ${args.operation}` : JSON.stringify(result, null, 2)
      };
    }).pipe(Effect.orDie)
  };
}));