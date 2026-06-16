/** @file `debug scrap` CLI command: lists all known projects as JSON. */
import { EOL } from "os";
import { Project } from "#project/project.js";
import * as Log from "core/util/log";
import { cmd } from "../cmd.js";
/** CLI command `scrap` that lists all known projects and writes them to stdout as pretty JSON (timed). */
export const ScrapCommand = cmd({
  command: "scrap",
  describe: "list all known projects",
  builder: yargs => yargs,
  async handler() {
    const timer = Log.Default.time("scrap");
    const list = await Project.list();
    process.stdout.write(JSON.stringify(list, null, 2) + EOL);
    timer.stop();
  }
});