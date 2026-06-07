import { UI } from "../ui.js";
import * as prompts from "@clack/prompts";
import { Installation } from "../../installation/index.js";
import { InstallationVersion } from "core/installation/version";
export const UpgradeCommand = {
  command: "upgrade [target]",
  describe: "upgrade closedcode to the latest or a specific version",
  builder: yargs => {
    return yargs.positional("target", {
      describe: "version to upgrade to, for ex '0.1.48' or 'v0.1.48'",
      type: "string"
    }).option("method", {
      alias: "m",
      describe: "installation method to use",
      type: "string",
      choices: ["curl", "npm", "pnpm", "brew", "choco", "scoop"]
    });
  },
  handler: async args => {
    UI.empty();
    UI.println(UI.logo("  "));
    UI.empty();
    prompts.intro("Upgrade");
    // Self-update is not available for this build: it is distributed as a signed
    // installer, not via a package manager. The legacy paths would hit a dead
    // remote endpoint or install the upstream package.
    prompts.log.warn("Self-update is disabled for this build. Install the latest release manually.");
    prompts.outro("Done");
    return;
    // eslint-disable-next-line no-unreachable
    const detectedMethod = await Installation.method();
    const method = args.method ?? detectedMethod;
    if (method === "unknown") {
      prompts.log.error(`closedcode is installed to ${process.execPath} and may be managed by a package manager`);
      const install = await prompts.select({
        message: "Install anyways?",
        options: [{
          label: "Yes",
          value: true
        }, {
          label: "No",
          value: false
        }],
        initialValue: false
      });
      if (!install) {
        prompts.outro("Done");
        return;
      }
    }
    prompts.log.info("Using method: " + method);
    const target = args.target ? args.target.replace(/^v/, "") : await Installation.latest();
    if (InstallationVersion === target) {
      prompts.log.warn(`closedcode upgrade skipped: ${target} is already installed`);
      prompts.outro("Done");
      return;
    }
    prompts.log.info(`From ${InstallationVersion} → ${target}`);
    const spinner = prompts.spinner();
    spinner.start("Upgrading...");
    const err = await Installation.upgrade(method, target).catch(err => err);
    if (err) {
      spinner.stop("Upgrade failed", 1);
      if (err instanceof Installation.UpgradeFailedError) {
        // necessary because choco only allows install/upgrade in elevated terminals
        if (method === "choco" && err.stderr.includes("not running from an elevated command shell")) {
          prompts.log.error("Please run the terminal as Administrator and try again");
        } else {
          prompts.log.error(err.stderr);
        }
      } else if (err instanceof Error) prompts.log.error(err.message);
      prompts.outro("Done");
      return;
    }
    spinner.stop("Upgrade complete");
    prompts.outro("Done");
  }
};