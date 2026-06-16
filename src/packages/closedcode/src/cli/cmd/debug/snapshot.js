/** @file `debug snapshot` CLI command group: snapshot debugging utilities (track current state, show patch, show diff). */
import { Effect } from "effect";
import { Snapshot } from "../../../snapshot/index.js";
import { effectCmd } from "../../effect-cmd.js";
import { cmd } from "../cmd.js";
/** Parent CLI command `snapshot` that groups the snapshot debugging subcommands (track, patch, diff). */
export const SnapshotCommand = cmd({
  command: "snapshot",
  describe: "snapshot debugging utilities",
  builder: yargs => yargs.command(TrackCommand).command(PatchCommand).command(DiffCommand).demandCommand(),
  async handler() {}
});
/** Subcommand `track` that records the current snapshot state and logs the result. */
const TrackCommand = effectCmd({
  command: "track",
  describe: "track current snapshot state",
  handler: Effect.fn("Cli.debug.snapshot.track")(function* () {
    const out = yield* Snapshot.Service.use(svc => svc.track());
    console.log(out);
  })
});
/** Subcommand `patch <hash>` that logs the patch for the given snapshot hash. */
const PatchCommand = effectCmd({
  command: "patch <hash>",
  describe: "show patch for a snapshot hash",
  builder: yargs => yargs.positional("hash", {
    type: "string",
    description: "hash",
    demandOption: true
  }),
  handler: Effect.fn("Cli.debug.snapshot.patch")(function* (args) {
    const out = yield* Snapshot.Service.use(svc => svc.patch(args.hash));
    console.log(out);
  })
});
/** Subcommand `diff <hash>` that logs the diff for the given snapshot hash. */
const DiffCommand = effectCmd({
  command: "diff <hash>",
  describe: "show diff for a snapshot hash",
  builder: yargs => yargs.positional("hash", {
    type: "string",
    description: "hash",
    demandOption: true
  }),
  handler: Effect.fn("Cli.debug.snapshot.diff")(function* (args) {
    const out = yield* Snapshot.Service.use(svc => svc.diff(args.hash));
    console.log(out);
  })
});