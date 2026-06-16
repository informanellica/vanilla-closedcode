/**
 * @file CLI entry point. Builds the yargs command tree (run, serve, tui, models,
 * providers, etc.), initializes logging, runs the one-time JSON-to-SQLite database
 * migration on first launch, and dispatches the parsed command.
 * @module closedcode/cli
 */

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { RunCommand } from "./cli/cmd/run.js";
import { GenerateCommand } from "./cli/cmd/generate.js";
import * as Log from "core/util/log";
import { ConsoleCommand } from "./cli/cmd/account.js";
import { ProvidersCommand } from "./cli/cmd/providers.js";
import { AgentCommand } from "./cli/cmd/agent.js";
import { UpgradeCommand } from "./cli/cmd/upgrade.js";
import { ModelsCommand } from "./cli/cmd/models.js";
import { UI } from "./cli/ui.js";
import { Installation } from "./installation/index.js";
import { InstallationVersion } from "core/installation/version";
import { NamedError } from "core/util/error";
import { FormatError } from "./cli/error.js";
import { ServeCommand } from "./cli/cmd/serve.js";
import { Filesystem } from "#util/filesystem.js";
import { DebugCommand } from "./cli/cmd/debug/index.js";
import { StatsCommand } from "./cli/cmd/stats.js";
import { McpCommand } from "./cli/cmd/mcp.js";
import { ExportCommand } from "./cli/cmd/export.js";
import { ImportCommand } from "./cli/cmd/import.js";
import { AttachCommand } from "./cli/cmd/tui/attach.js";
import { TuiThreadCommand } from "./cli/cmd/tui/thread.js";
import { AcpCommand } from "./cli/cmd/acp.js";
import { EOL } from "os";
import { WebCommand } from "./cli/cmd/web.js";
import { PrCommand } from "./cli/cmd/pr.js";
import { SessionCommand } from "./cli/cmd/session.js";
import { DbCommand } from "./cli/cmd/db.js";
import path from "path";
import { Global } from "core/global";
import { JsonMigration } from "#storage/json-migration.js";
import { errorMessage } from "./util/error.js";
import { PluginCommand } from "./cli/cmd/plug.js";
import { Heap } from "./cli/heap.js";
import { ensureProcessMetadata } from "core/util/closedcode-process";
const processMetadata = ensureProcessMetadata("main");
process.on("unhandledRejection", e => {
  Log.Default.error("rejection", {
    e: errorMessage(e)
  });
});
process.on("uncaughtException", e => {
  Log.Default.error("exception", {
    e: errorMessage(e)
  });
});
const args = hideBin(process.argv);
/**
 * Write help/usage output to stderr, prefixing it with the logo unless it is
 * already a closedcode usage string.
 * @param {string} out - The text to display.
 * @returns {void}
 */
function show(out) {
  const text = out.trimStart();
  if (!text.startsWith("closedcode ")) {
    process.stderr.write(UI.logo() + EOL + EOL);
    process.stderr.write(text);
    return;
  }
  process.stderr.write(out);
}
const cli = yargs(args).parserConfiguration({
  "populate--": true
}).scriptName("closedcode").wrap(100).help("help", "show help").alias("help", "h").version("version", "show version number", InstallationVersion).alias("version", "v").option("print-logs", {
  describe: "print logs to stderr",
  type: "boolean"
}).option("log-level", {
  describe: "log level",
  type: "string",
  choices: ["DEBUG", "INFO", "WARN", "ERROR"]
}).option("pure", {
  describe: "run without external plugins",
  type: "boolean"
}).middleware(async opts => {
  if (opts.pure) {
    process.env.CLOSEDCODE_PURE = "1";
  }
  await Log.init({
    print: process.argv.includes("--print-logs"),
    dev: Installation.isLocal(),
    level: (() => {
      if (opts.logLevel) return opts.logLevel;
      if (Installation.isLocal()) return "DEBUG";
      return "INFO";
    })()
  });
  Heap.start();
  process.env.AGENT = "1";
  process.env.CLOSEDCODE = "1";
  process.env.OPENCODE = "1"; // legacy compat: external tools may check this
  process.env.CLOSEDCODE_PID = String(process.pid);
  Log.Default.info("closedcode", {
    version: InstallationVersion,
    args: process.argv.slice(2),
    process_role: processMetadata.processRole,
    run_id: processMetadata.runID
  });
  const marker = path.join(Global.Path.data, "closedcode.db");
  const legacyMarker = path.join(Global.Path.data, "opencode.db");
  if (!(await Filesystem.exists(marker)) && !(await Filesystem.exists(legacyMarker))) {
    const tty = process.stderr.isTTY;
    process.stderr.write("Performing one time database migration, may take a few minutes..." + EOL);
    const width = 36;
    const orange = "\x1b[38;5;214m";
    const muted = "\x1b[0;2m";
    const reset = "\x1b[0m";
    let last = -1;
    if (tty) process.stderr.write("\x1b[?25l");
    try {
      // ORM migration S3: JsonMigration opens the shared Sequelize layer
      // itself (ormInit applies the same SQL migration journal first).
      await JsonMigration.run({
        progress: event => {
          const percent = Math.floor(event.current / event.total * 100);
          if (percent === last && event.current !== event.total) return;
          last = percent;
          if (tty) {
            const fill = Math.round(percent / 100 * width);
            const bar = `${"■".repeat(fill)}${"･".repeat(width - fill)}`;
            process.stderr.write(`\r${orange}${bar} ${percent.toString().padStart(3)}%${reset} ${muted}${event.label.padEnd(12)} ${event.current}/${event.total}${reset}`);
            if (event.current === event.total) process.stderr.write("\n");
          } else {
            process.stderr.write(`sqlite-migration:${percent}${EOL}`);
          }
        }
      });
    } finally {
      if (tty) process.stderr.write("\x1b[?25h");else {
        process.stderr.write(`sqlite-migration:done${EOL}`);
      }
    }
    process.stderr.write("Database migration complete." + EOL);
  }
}).usage("").completion("completion", "generate shell completion script").command(AcpCommand).command(McpCommand).command(TuiThreadCommand).command(AttachCommand).command(RunCommand).command(GenerateCommand).command(DebugCommand).command(ConsoleCommand).command(ProvidersCommand).command(AgentCommand).command(UpgradeCommand).command(ServeCommand).command(WebCommand).command(ModelsCommand).command(StatsCommand).command(ExportCommand).command(ImportCommand).command(PrCommand).command(SessionCommand).command(PluginCommand).command(DbCommand).fail((msg, err) => {
  if (msg?.startsWith("Unknown argument") || msg?.startsWith("Not enough non-option arguments") || msg?.startsWith("Invalid values:")) {
    if (err) throw err;
    cli.showHelp(show);
  }
  if (err) throw err;
  process.exit(1);
}).strict();
// Wrapped in an async IIFE (not top-level await) so the bundle can be emitted as
// CommonJS for the Node SEA build — SEA runs the embedded main as CJS, which
// forbids top-level await. Harmless for the ESM build.
void (async () => {
try {
  if (args.includes("-h") || args.includes("--help")) {
    await cli.parseAsync(args, (err, _argv, out) => {
      if (err) throw err;
      if (!out) return;
      show(out);
    });
  } else {
    await cli.parseAsync();
  }
} catch (e) {
  let data = {};
  if (e instanceof NamedError) {
    const obj = e.toObject();
    Object.assign(data, {
      ...obj.data
    });
  }
  if (e instanceof Error) {
    Object.assign(data, {
      name: e.name,
      message: e.message,
      cause: e.cause?.toString(),
      stack: e.stack
    });
  }
  if (e instanceof ResolveMessage) {
    Object.assign(data, {
      name: e.name,
      message: e.message,
      code: e.code,
      specifier: e.specifier,
      referrer: e.referrer,
      position: e.position,
      importKind: e.importKind
    });
  }
  Log.Default.error("fatal", data);
  const formatted = FormatError(e);
  if (formatted) UI.error(formatted);
  if (formatted === undefined) {
    UI.error("Unexpected error, check log file at " + Log.file() + " for more details" + EOL);
    process.stderr.write(errorMessage(e) + EOL);
  }
  process.exitCode = 1;
} finally {
  // Some subprocesses don't react properly to SIGTERM and similar signals.
  // Most notably, some docker-container-based MCP servers don't handle such signals unless
  // run using `docker run --init`.
  // Explicitly exit to avoid any hanging subprocesses.
  process.exit();
}
})();