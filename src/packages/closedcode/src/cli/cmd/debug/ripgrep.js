/** @file `debug rg` CLI command group: ripgrep-backed debugging utilities (directory tree, file listing, content search). */
import { EOL } from "os";
import { Effect, Stream } from "effect";
import { Ripgrep } from "../../../file/ripgrep.js";
import { effectCmd } from "../../effect-cmd.js";
import { cmd } from "../cmd.js";
import { InstanceRef } from "#effect/instance-ref.js";
/** Parent CLI command `rg` that groups the ripgrep debugging subcommands (tree, files, search). */
export const RipgrepCommand = cmd({
  command: "rg",
  describe: "ripgrep debugging utilities",
  builder: yargs => yargs.command(TreeCommand).command(FilesCommand).command(SearchCommand).demandCommand(),
  async handler() {}
});
/** Subcommand `tree` that prints a ripgrep-based file tree of the instance directory, honoring an optional `--limit`. */
const TreeCommand = effectCmd({
  command: "tree",
  describe: "show file tree using ripgrep",
  builder: yargs => yargs.option("limit", {
    type: "number"
  }),
  handler: Effect.fn("Cli.debug.rg.tree")(function* (args) {
    const ctx = yield* InstanceRef;
    if (!ctx) return;
    const tree = yield* Effect.orDie(Ripgrep.Service.use(svc => svc.tree({
      cwd: ctx.directory,
      limit: args.limit
    })));
    process.stdout.write(tree + EOL);
  })
});
/** Subcommand `files` that lists files in the instance directory via ripgrep, optionally filtered by `--glob` and capped by `--limit`, one path per line. */
const FilesCommand = effectCmd({
  command: "files",
  describe: "list files using ripgrep",
  builder: yargs => yargs.option("query", {
    type: "string",
    description: "Filter files by query"
  }).option("glob", {
    type: "string",
    description: "Glob pattern to match files"
  }).option("limit", {
    type: "number",
    description: "Limit number of results"
  }),
  handler: Effect.fn("Cli.debug.rg.files")(function* (args) {
    const ctx = yield* InstanceRef;
    if (!ctx) return;
    const rg = yield* Ripgrep.Service;
    const files = yield* rg.files({
      cwd: ctx.directory,
      glob: args.glob ? [args.glob] : undefined
    }).pipe(Stream.take(args.limit ?? Infinity), Stream.runCollect, Effect.map(c => [...c]), Effect.orDie);
    process.stdout.write(files.join(EOL) + EOL);
  })
});
/** Subcommand `search <pattern>` that searches file contents via ripgrep (optional `--glob` and `--limit`) and prints the matched items as JSON. */
const SearchCommand = effectCmd({
  command: "search <pattern>",
  describe: "search file contents using ripgrep",
  builder: yargs => yargs.positional("pattern", {
    type: "string",
    demandOption: true,
    description: "Search pattern"
  }).option("glob", {
    type: "array",
    description: "File glob patterns"
  }).option("limit", {
    type: "number",
    description: "Limit number of results"
  }),
  handler: Effect.fn("Cli.debug.rg.search")(function* (args) {
    const ctx = yield* InstanceRef;
    if (!ctx) return;
    const results = yield* Effect.orDie(Ripgrep.Service.use(svc => svc.search({
      cwd: ctx.directory,
      pattern: args.pattern,
      glob: args.glob,
      limit: args.limit
    })));
    process.stdout.write(JSON.stringify(results.items, null, 2) + EOL);
  })
});