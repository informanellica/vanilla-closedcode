import { $ } from "script/shell";
import { readFile } from "node:fs/promises";
import path from "path";
const rootPkgPath = path.resolve(import.meta.dirname, "../../../package.json");
const rootPkg = JSON.parse(await readFile(rootPkgPath, "utf8"));
const env = {
  CHANNEL: process.env["CLOSEDCODE_CHANNEL"],
  BUMP: process.env["CLOSEDCODE_BUMP"],
  VERSION: process.env["CLOSEDCODE_VERSION"],
  RELEASE: process.env["CLOSEDCODE_RELEASE"]
};
const CHANNEL = await (async () => {
  if (env.CHANNEL) return env.CHANNEL;
  if (env.BUMP) return "latest";
  if (env.VERSION && !env.VERSION.startsWith("0.0.0-")) return "latest";
  return await $`git branch --show-current`.text().then(x => x.trim());
})();
const IS_PREVIEW = CHANNEL !== "latest";
const VERSION = await (async () => {
  if (env.VERSION) return env.VERSION;
  if (IS_PREVIEW) return `0.0.0-${CHANNEL}-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}`;
  // Derive from this repo's own package.json version — never reach out to the
  // upstream opencode-ai npm registry. Set CLOSEDCODE_VERSION to override.
  const version = rootPkg.version || "0.0.0";
  const [major, minor, patch] = version.split(".").map(x => Number(x) || 0);
  const t = env.BUMP?.toLowerCase();
  if (t === "major") return `${major + 1}.0.0`;
  if (t === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
})();
const bot = ["actions-user", "github-actions[bot]"];
const teamPath = path.resolve(import.meta.dirname, "../../../.github/TEAM_MEMBERS");
// TEAM_MEMBERS is an upstream release-attribution file that this fork removed;
// treat it as optional so the build does not depend on it.
const team = [...(await readFile(teamPath, "utf8").then(x => x.split(/\r?\n/).map(x => x.trim())).then(x => x.filter(x => x && !x.startsWith("#"))).catch(() => [])), ...bot];
void rootPkg;
export const Script = {
  get channel() {
    return CHANNEL;
  },
  get version() {
    return VERSION;
  },
  get preview() {
    return IS_PREVIEW;
  },
  get release() {
    return !!env.RELEASE;
  },
  get team() {
    return team;
  }
};
console.log(`closedcode script`, JSON.stringify(Script, null, 2));