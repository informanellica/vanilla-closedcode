/** @file `debug skill` CLI command: lists all available skills as JSON. */
import { EOL } from "os";
import { Effect } from "effect";
import { Skill } from "../../../skill/index.js";
import { effectCmd } from "../../effect-cmd.js";
/** CLI command `skill` that fetches all available skills and writes them to stdout as pretty JSON. */
export const SkillCommand = effectCmd({
  command: "skill",
  describe: "list all available skills",
  builder: yargs => yargs,
  handler: Effect.fn("Cli.debug.skill")(function* () {
    const skill = yield* Skill.Service;
    const skills = yield* skill.all();
    process.stdout.write(JSON.stringify(skills, null, 2) + EOL);
  })
});