/** @file Loads bundled text assets (prompts, tool descriptions) by src/-relative path, working both from source and from the esbuild bundle. */
import { existsSync, readFileSync } from "node:fs";

// Text assets (prompts, tool descriptions) are read via standard fs APIs —
// no `import x from "./x.txt"` (a bundler-only feature plain Node rejects).
//
// The src/ root is found from two candidates:
//  - running from source: this file is src/util/asset.js, so "../" is src/
//  - running from the esbuild bundle: import.meta.url is dist/node/node.js and
//    the build copies every src/**/*.txt into dist/node/assets/** (same
//    relative layout), so "./assets/" is the root
// A probe file distinguishes the two (its presence defines the layout).
const candidates = [new URL("../", import.meta.url), new URL("./assets/", import.meta.url)];
const root = candidates.find(base => existsSync(new URL("session/prompt/default.txt", base))) ?? candidates[0];

// Read a text asset by its src/-relative path, e.g. assetText("agent/generate.txt").
/**
 * Reads a text asset by its src/-relative path.
 *
 * @param {string} relativePath - Asset path relative to the src/ root, e.g. "agent/generate.txt"
 * @returns {string} The UTF-8 decoded contents of the asset
 */
export function assetText(relativePath) {
  return readFileSync(new URL(relativePath, root), "utf8");
}
