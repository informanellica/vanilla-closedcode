/** @file CLI `serve` command: starts the headless closedcode HTTP server and keeps the process alive. */
import { Effect } from "effect";
import { Server } from "../../server/server.js";
import { effectCmd } from "../effect-cmd.js";
import { withNetworkOptions, resolveNetworkOptions } from "../network.js";
import { Flag } from "core/flag/flag";
/**
 * The `serve` CLI command: starts a headless closedcode server on the configured host/port and never returns.
 * @type {Object}
 */
export const ServeCommand = effectCmd({
  command: "serve",
  builder: yargs => withNetworkOptions(yargs),
  describe: "starts a headless closedcode server",
  // Server loads instances per-request via x-closedcode-directory header — no
  // need for an ambient project InstanceContext at startup.
  instance: false,
  handler: Effect.fn("Cli.serve")(function* (args) {
    if (!Flag.CLOSEDCODE_SERVER_PASSWORD) {
      console.log("Warning: CLOSEDCODE_SERVER_PASSWORD is not set; server is unsecured.");
    }
    const opts = yield* Effect.promise(() => resolveNetworkOptions(args));
    const server = yield* Effect.promise(() => Server.listen(opts));
    console.log(`closedcode server listening on http://${server.hostname}:${server.port}`);
    yield* Effect.never;
  })
});