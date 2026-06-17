/** @file Build-script metadata module: derives the release channel, version, preview flag, and team-member attribution list from environment variables, git, and the repo's package.json, then exposes them via the `Script` export. */
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
// Resolve the release channel: explicit CLOSEDCODE_CHANNEL wins; an explicit
// bump or a concrete (non-preview) version implies "latest"; otherwise fall
// back to the current git branch name.
/** @returns {Promise<string>} The resolved release channel name (e.g. "latest" or a branch name). */
const CHANNEL = await (async () => {
  if (env.CHANNEL) return env.CHANNEL;
  if (env.BUMP) return "latest";
  if (env.VERSION && !env.VERSION.startsWith("0.0.0-")) return "latest";
  return await $`git branch --show-current`.text().then(x => x.trim());
})();
const IS_PREVIEW = CHANNEL !== "latest";
// Resolve the version string: explicit CLOSEDCODE_VERSION wins; preview
// channels get a synthetic timestamped 0.0.0-<channel>-<stamp> version;
// otherwise derive from this repo's package.json, optionally bumping
// major/minor/patch per CLOSEDCODE_BUMP.
/** @returns {Promise<string>} The resolved semantic version string for the build. */
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
/**
 * Resolved build metadata for the current invocation, exposed as read-only getters.
 * @property {string} channel - The release channel (e.g. "latest" or a branch name).
 * @property {string} version - The resolved semantic version string.
 * @property {boolean} preview - True when building a non-"latest" preview channel.
 * @property {boolean} release - True when CLOSEDCODE_RELEASE is set (a real release run).
 * @property {Array} team - Team member logins plus bot accounts used for release attribution.
 */
export const Script = {
  /** @returns {string} The release channel name. */
  get channel() {
    return CHANNEL;
  },
  /** @returns {string} The resolved semantic version string. */
  get version() {
    return VERSION;
  },
  /** @returns {boolean} True when building a preview (non-"latest") channel. */
  get preview() {
    return IS_PREVIEW;
  },
  /** @returns {boolean} True when this is a release run (CLOSEDCODE_RELEASE set). */
  get release() {
    return !!env.RELEASE;
  },
  /** @returns {Array} The list of team member logins and bot accounts. */
  get team() {
    return team;
  }
};
console.log(`closedcode script`, JSON.stringify(Script, null, 2));