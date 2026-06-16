/** @file `debug lsp` CLI command group: Language Server Protocol debugging utilities (diagnostics, workspace symbols, document symbols). */
import { LSP } from "#lsp/lsp.js";
import { Effect } from "effect";
import { effectCmd } from "../../effect-cmd.js";
import { cmd } from "../cmd.js";
import * as Log from "core/util/log";
import { EOL } from "os";
/** Parent CLI command `lsp` that groups the LSP debugging subcommands (diagnostics, symbols, document-symbols). */
export const LSPCommand = cmd({
  command: "lsp",
  describe: "LSP debugging utilities",
  builder: yargs => yargs.command(DiagnosticsCommand).command(SymbolsCommand).command(DocumentSymbolsCommand).demandCommand(),
  async handler() {}
});
/** Subcommand `diagnostics <file>` that opens the file in the LSP and prints its diagnostics as JSON. */
const DiagnosticsCommand = effectCmd({
  command: "diagnostics <file>",
  describe: "get diagnostics for a file",
  builder: yargs => yargs.positional("file", {
    type: "string",
    demandOption: true
  }),
  handler: Effect.fn("Cli.debug.lsp.diagnostics")(function* (args) {
    const out = yield* LSP.Service.use(lsp => Effect.gen(function* () {
      yield* lsp.touchFile(args.file, "full");
      return yield* lsp.diagnostics();
    }));
    process.stdout.write(JSON.stringify(out, null, 2) + EOL);
  })
});
/** Subcommand `symbols <query>` that searches workspace symbols via the LSP and prints results as JSON (timed). */
export const SymbolsCommand = effectCmd({
  command: "symbols <query>",
  describe: "search workspace symbols",
  builder: yargs => yargs.positional("query", {
    type: "string",
    demandOption: true
  }),
  handler: Effect.fn("Cli.debug.lsp.symbols")(function* (args) {
    using _ = Log.Default.time("symbols");
    const results = yield* LSP.Service.use(lsp => lsp.workspaceSymbol(args.query));
    process.stdout.write(JSON.stringify(results, null, 2) + EOL);
  })
});
/** Subcommand `document-symbols <uri>` that retrieves the symbols of a single document via the LSP and prints them as JSON (timed). */
export const DocumentSymbolsCommand = effectCmd({
  command: "document-symbols <uri>",
  describe: "get symbols from a document",
  builder: yargs => yargs.positional("uri", {
    type: "string",
    demandOption: true
  }),
  handler: Effect.fn("Cli.debug.lsp.documentSymbols")(function* (args) {
    using _ = Log.Default.time("document-symbols");
    const results = yield* LSP.Service.use(lsp => lsp.documentSymbol(args.uri));
    process.stdout.write(JSON.stringify(results, null, 2) + EOL);
  })
});