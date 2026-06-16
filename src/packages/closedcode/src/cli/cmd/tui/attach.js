/** @file CLI `attach` command: connects the vanilla terminal-kit TUI to a running closedcode server over HTTP. */
import { cmd } from "../cmd.js";
import { UI } from "#cli/ui.js";
import { win32DisableProcessedInput, win32InstallCtrlCGuard } from "./win32.js";
import { TuiConfig } from "#cli/cmd/tui/config/tui.js";
import { errorMessage } from "#util/error.js";
import { validateSession } from "./validate-session.js";
/**
 * The `attach <url>` CLI command: validates the target session/server, then launches the lazily-imported
 * vanilla TUI against the running closedcode server (with optional continue/fork and basic auth).
 * @type {Object}
 */
export const AttachCommand = cmd({
  command: "attach <url>",
  describe: "attach to a running closedcode server",
  builder: yargs => yargs.positional("url", {
    type: "string",
    describe: "http://localhost:4096",
    demandOption: true
  }).option("dir", {
    type: "string",
    description: "directory to run in"
  }).option("continue", {
    alias: ["c"],
    describe: "continue the last session",
    type: "boolean"
  }).option("session", {
    alias: ["s"],
    type: "string",
    describe: "session id to continue"
  }).option("fork", {
    type: "boolean",
    describe: "fork the session when continuing (use with --continue or --session)"
  }).option("password", {
    alias: ["p"],
    type: "string",
    describe: "basic auth password (defaults to CLOSEDCODE_SERVER_PASSWORD)"
  }),
  handler: async args => {
    const unguard = win32InstallCtrlCGuard();
    let restoreInput;
    try {
      restoreInput = win32DisableProcessedInput();
      if (args.fork && !args.continue && !args.session) {
        UI.error("--fork requires --continue or --session");
        process.exitCode = 1;
        return;
      }
      const directory = (() => {
        if (!args.dir) return undefined;
        try {
          process.chdir(args.dir);
          return process.cwd();
        } catch {
          // If the directory doesn't exist locally (remote attach), pass it through.
          return args.dir;
        }
      })();
      const headers = (() => {
        const password = args.password ?? process.env.CLOSEDCODE_SERVER_PASSWORD;
        if (!password) return undefined;
        const username = process.env.CLOSEDCODE_SERVER_USERNAME ?? "closedcode";
        const auth = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
        return {
          Authorization: auth
        };
      })();
      const config = await TuiConfig.get();
      try {
        await validateSession({
          url: args.url,
          sessionID: args.session,
          directory,
          headers
        });
      } catch (error) {
        UI.error(errorMessage(error));
        process.exitCode = 1;
        return;
      }
      // The TUI is the native-free terminal-kit vanilla shell (no @opentui /
      // solid-js / yoga). Loaded lazily so its graph is only built when the TUI runs.
      const { tui } = await import("./vanilla/main.js");
      await tui({
        url: args.url,
        config,
        args: {
          continue: args.continue,
          sessionID: args.session,
          fork: args.fork
        },
        directory,
        headers
      });
    } finally {
      restoreInput?.(); // restore ENABLE_PROCESSED_INPUT for the parent shell
      unguard?.();
    }
  }
});