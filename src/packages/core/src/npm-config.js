export * as NpmConfig from "./npm-config.js";
import { fileURLToPath } from "url";
// npm does not publish types for this internal config API.
import Config from "@npmcli/config";
// npm does not publish types for this internal config API.
import definitionsIndex from "@npmcli/config/lib/definitions/index.js";
import { Effect } from "effect";
const npmPath = fileURLToPath(new URL("..", import.meta.url));
const { definitions, flatten, nerfDarts, shorthands } = definitionsIndex;
export const load = dir => Effect.tryPromise({
  try: async () => {
    const config = new Config({
      npmPath,
      cwd: dir,
      env: {
        ...process.env
      },
      argv: [process.execPath, process.execPath],
      execPath: process.execPath,
      platform: process.platform,
      definitions,
      flatten,
      nerfDarts,
      shorthands,
      warn: false
    });
    await config.load();
    return config.flat;
  },
  catch: cause => cause
}).pipe(Effect.orElseSucceed(() => ({})));
export const registry = dir => load(dir).pipe(Effect.map(config => {
  const registry = typeof config.registry === "string" ? config.registry : "https://registry.npmjs.org";
  return registry.endsWith("/") ? registry.slice(0, -1) : registry;
}));
