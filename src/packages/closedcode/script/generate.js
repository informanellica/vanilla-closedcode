import path from "path";
import { fileURLToPath } from "url";
import { readFile, writeFile, mkdir } from "node:fs/promises";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dir = path.resolve(__dirname, "..");
process.chdir(dir);
const modelsUrl = process.env.CLOSEDCODE_MODELS_URL || "https://models.dev";
// Fetch and generate models.dev snapshot
const modelsData = process.env.MODELS_DEV_API_JSON ? await readFile(process.env.MODELS_DEV_API_JSON, "utf8") : await fetch(`${modelsUrl}/api.json`).then(x => x.text());
// Strip hosted reseller/aggregator gateways that route prompts through a
// third-party middleman. This build only ever connects to providers the user
// explicitly configures, so these must never appear:
//   - opencode / opencode-go — hosted middleman gateway
//   - zenmux — third-party aggregator, removed for public release
const parsed = JSON.parse(modelsData);
for (const id of ["opencode", "opencode-go", "zenmux"]) delete parsed[id];
const outJs = path.join(dir, "src/provider/models-snapshot.js");
await mkdir(path.dirname(outJs), {
  recursive: true
});
await writeFile(outJs, `// Auto-generated - do not edit\nexport const snapshot = ${JSON.stringify(parsed)}\n`);
console.log("Generated models-snapshot.js");