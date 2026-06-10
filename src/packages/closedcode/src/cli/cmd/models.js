import { EOL } from "os";
import { Effect } from "effect";
import { Provider } from "#provider/provider.js";
import { ProviderID } from "../../provider/schema.js";
import { ModelsDev } from "#provider/models.js";
import { effectCmd, fail } from "../effect-cmd.js";
import { UI } from "../ui.js";
export const ModelsCommand = effectCmd({
  command: "models [provider]",
  describe: "list all available models",
  builder: yargs => yargs.positional("provider", {
    describe: "provider ID to filter models by",
    type: "string",
    array: false
  }).option("verbose", {
    describe: "use more verbose model output (includes metadata like costs)",
    type: "boolean"
  }).option("refresh", {
    describe: "reload the local models snapshot",
    type: "boolean"
  }),
  handler: Effect.fn("Cli.models")(function* (args) {
    if (args.refresh) {
      yield* ModelsDev.Service.use(s => s.refresh(true));
      UI.println(UI.Style.TEXT_SUCCESS_BOLD + "Models cache refreshed" + UI.Style.TEXT_NORMAL);
    }
    const provider = yield* Provider.Service;
    const providers = yield* provider.list();
    const print = (providerID, verbose) => {
      const p = providers[providerID];
      const sorted = Object.entries(p.models).sort(([a], [b]) => a.localeCompare(b));
      for (const [modelID, model] of sorted) {
        process.stdout.write(`${providerID}/${modelID}`);
        process.stdout.write(EOL);
        if (verbose) {
          process.stdout.write(JSON.stringify(model, null, 2));
          process.stdout.write(EOL);
        }
      }
    };
    if (args.provider) {
      const providerID = ProviderID.make(args.provider);
      if (!providers[providerID]) return yield* fail(`Provider not found: ${args.provider}`);
      print(providerID, args.verbose);
      return;
    }
    const ids = Object.keys(providers).sort((a, b) => {
      const aIsLocalDefault = a === "lmstudio" || a === "ollama";
      const bIsLocalDefault = b === "lmstudio" || b === "ollama";
      if (aIsLocalDefault && !bIsLocalDefault) return -1;
      if (!aIsLocalDefault && bIsLocalDefault) return 1;
      return a.localeCompare(b);
    });
    for (const providerID of ids) print(ProviderID.make(providerID), args.verbose);
  })
});