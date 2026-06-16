/** @file `debug config` CLI command: prints the fully resolved configuration as JSON. */
import { EOL } from "os";
import { Effect } from "effect";
import { Config } from "#config/config.js";
import { effectCmd } from "../../effect-cmd.js";
/** CLI command `config` that fetches the resolved configuration and writes it to stdout as pretty JSON. */
export const ConfigCommand = effectCmd({
  command: "config",
  describe: "show resolved configuration",
  builder: yargs => yargs,
  handler: Effect.fn("Cli.debug.config")(function* () {
    const config = yield* Config.Service.use(cfg => cfg.get());
    process.stdout.write(JSON.stringify(config, null, 2) + EOL);
  })
});