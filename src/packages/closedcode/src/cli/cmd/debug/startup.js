/** @file CLI `debug startup` command: prints the current high-resolution startup timestamp. */
import { EOL } from "os";
import { cmd } from "../cmd.js";
/** `debug startup` command definition: writes `performance.now()` to stdout for startup timing measurement. */
export const StartupCommand = cmd({
  command: "startup",
  describe: "print startup timing",
  builder: yargs => yargs,
  handler() {
    process.stdout.write(performance.now().toString() + EOL);
  }
});