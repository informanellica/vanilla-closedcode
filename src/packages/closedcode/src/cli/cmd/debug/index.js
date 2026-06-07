import { Global } from "core/global";
import { InstallationVersion } from "core/installation/version";
import { Flag } from "core/flag/flag";
import os from "os";
import { Duration, Effect } from "effect";
import { Config } from "@/config/config.js";
import { ConfigPlugin } from "@/config/plugin.js";
import { effectCmd } from "../../effect-cmd.js";
import { cmd } from "../cmd.js";
import { ConfigCommand } from "./config.js";
import { FileCommand } from "./file.js";
import { LSPCommand } from "./lsp.js";
import { RipgrepCommand } from "./ripgrep.js";
import { ScrapCommand } from "./scrap.js";
import { SkillCommand } from "./skill.js";
import { SnapshotCommand } from "./snapshot.js";
import { AgentCommand } from "./agent.js";
import { StartupCommand } from "./startup.js";
export const DebugCommand = cmd({
  command: "debug",
  describe: "debugging and troubleshooting tools",
  builder: yargs => yargs.command(ConfigCommand).command(LSPCommand).command(RipgrepCommand).command(FileCommand).command(ScrapCommand).command(SkillCommand).command(SnapshotCommand).command(StartupCommand).command(AgentCommand).command(InfoCommand).command(PathsCommand).command(WaitCommand).demandCommand(),
  async handler() {}
});
const WaitCommand = effectCmd({
  command: "wait",
  describe: "wait indefinitely (for debugging)",
  handler: Effect.fn("Cli.debug.wait")(function* () {
    yield* Effect.sleep(Duration.days(1));
  })
});
const InfoCommand = effectCmd({
  command: "info",
  describe: "show debug information",
  handler: Effect.fn("Cli.debug.info")(function* () {
    const config = yield* Config.Service.use(cfg => cfg.get());
    const termProgram = process.env.TERM_PROGRAM ? `${process.env.TERM_PROGRAM}${process.env.TERM_PROGRAM_VERSION ? ` ${process.env.TERM_PROGRAM_VERSION}` : ""}` : undefined;
    const terminal = [termProgram, process.env.TERM].filter(item => Boolean(item)).join(" / ");
    console.log(`closedcode version: ${InstallationVersion}`);
    console.log(`os: ${os.type()} ${os.release()} ${os.arch()}`);
    console.log(`terminal: ${terminal || "unknown"}`);
    console.log("plugins:");
    if (Flag.CLOSEDCODE_PURE) {
      console.log("external plugins disabled (--pure)");
      return;
    }
    if (!config.plugin_origins?.length) {
      console.log("none");
      return;
    }
    for (const plugin of config.plugin_origins) {
      console.log(`- ${ConfigPlugin.pluginSpecifier(plugin.spec)}`);
    }
  })
});
const PathsCommand = cmd({
  command: "paths",
  describe: "show global paths (data, config, cache, state)",
  handler() {
    for (const [key, value] of Object.entries(Global.Path)) {
      console.log(key.padEnd(10), value);
    }
  }
});