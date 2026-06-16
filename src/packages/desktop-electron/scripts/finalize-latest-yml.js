#!/usr/bin/env node
/** @file Release script that merges per-platform/per-arch electron-updater latest*.yml feed files (Windows/macOS arm64+x64 merged, Linux passthrough) and uploads the combined feeds to the GitHub release. */
import { $ } from "script/shell";
import path from "path";
import { readFile, writeFile, access } from "node:fs/promises";
const dir = process.env.LATEST_YML_DIR;
if (!dir) throw new Error("LATEST_YML_DIR is required");
const repo = process.env.GH_REPO;
if (!repo) throw new Error("GH_REPO is required");
const version = process.env.CLOSEDCODE_VERSION;
if (!version) throw new Error("CLOSEDCODE_VERSION is required");
/**
 * Parse an electron-updater latest.yml feed into a structured object, extracting
 * the version, releaseDate, and the list of file entries (url/sha512/size and
 * optional blockMapSize).
 * @param {string} content - The raw YAML feed text.
 * @returns {Object} An object with `version`, `files` (Array), and `releaseDate`.
 */
function parse(content) {
  const lines = content.split("\n");
  let version = "";
  let releaseDate = "";
  const files = [];
  let current;
  const flush = () => {
    if (current?.url && current.sha512 && current.size) files.push(current);
    current = undefined;
  };
  for (const line of lines) {
    const indented = line.startsWith("    ") || line.startsWith("  -");
    if (line.startsWith("version:")) version = line.slice("version:".length).trim();else if (line.startsWith("releaseDate:")) releaseDate = line.slice("releaseDate:".length).trim().replace(/^'|'$/g, "");else if (line.trim().startsWith("- url:")) {
      flush();
      current = {
        url: line.trim().slice("- url:".length).trim()
      };
    } else if (indented && current && line.trim().startsWith("sha512:")) current.sha512 = line.trim().slice("sha512:".length).trim();else if (indented && current && line.trim().startsWith("size:")) current.size = Number(line.trim().slice("size:".length).trim());else if (indented && current && line.trim().startsWith("blockMapSize:")) current.blockMapSize = Number(line.trim().slice("blockMapSize:".length).trim());else if (!indented && current) flush();
  }
  flush();
  return {
    version,
    files,
    releaseDate
  };
}
/**
 * Serialize a parsed feed object back into electron-updater latest.yml text.
 * @param {Object} data - Feed object with `version`, `files` (Array), and `releaseDate`.
 * @returns {string} The YAML feed text (trailing newline included).
 */
function serialize(data) {
  const lines = [`version: ${data.version}`, "files:"];
  for (const file of data.files) {
    lines.push(`  - url: ${file.url}`);
    lines.push(`    sha512: ${file.sha512}`);
    lines.push(`    size: ${file.size}`);
    if (file.blockMapSize) lines.push(`    blockMapSize: ${file.blockMapSize}`);
  }
  lines.push(`releaseDate: '${data.releaseDate}'`);
  return lines.join("\n") + "\n";
}
/**
 * Read and parse a latest.yml feed file from a per-target subdirectory, returning
 * undefined if the file does not exist.
 * @param {string} subdir - Subdirectory under LATEST_YML_DIR holding the feed file.
 * @param {string} filename - The feed filename to read (e.g. "latest.yml").
 * @returns {Promise<Object>} The parsed feed object, or undefined if the file is absent.
 */
async function read(subdir, filename) {
  const p = path.join(dir, subdir, filename);
  try {
    await access(p);
  } catch {
    return undefined;
  }
  return parse(await readFile(p, "utf8"));
}
const output = {};

// Windows: merge arm64 + x64 into single file
const winX64 = await read("latest-yml-x86_64-pc-windows-msvc", "latest.yml");
const winArm64 = await read("latest-yml-aarch64-pc-windows-msvc", "latest.yml");
if (winX64 || winArm64) {
  const base = winArm64 ?? winX64;
  output["latest.yml"] = serialize({
    version: base.version,
    files: [...(winArm64?.files ?? []), ...(winX64?.files ?? [])],
    releaseDate: base.releaseDate
  });
}

// Linux x64: pass through
const linuxX64 = await read("latest-yml-x86_64-unknown-linux-gnu", "latest-linux.yml");
if (linuxX64) output["latest-linux.yml"] = serialize(linuxX64);

// Linux arm64: pass through
const linuxArm64 = await read("latest-yml-aarch64-unknown-linux-gnu", "latest-linux-arm64.yml");
if (linuxArm64) output["latest-linux-arm64.yml"] = serialize(linuxArm64);

// macOS: merge arm64 + x64 into single file
const macX64 = await read("latest-yml-x86_64-apple-darwin", "latest-mac.yml");
const macArm64 = await read("latest-yml-aarch64-apple-darwin", "latest-mac.yml");
if (macX64 || macArm64) {
  const base = macArm64 ?? macX64;
  output["latest-mac.yml"] = serialize({
    version: base.version,
    files: [...(macArm64?.files ?? []), ...(macX64?.files ?? [])],
    releaseDate: base.releaseDate
  });
}

// Upload to release
const tag = `v${version}`;
const tmp = process.env.RUNNER_TEMP ?? "/tmp";
for (const [filename, content] of Object.entries(output)) {
  const filepath = path.join(tmp, filename);
  await writeFile(filepath, content);
  await $`gh release upload ${tag} ${filepath} --clobber --repo ${repo}`;
  console.log(`uploaded ${filename}`);
}
console.log("finalized latest yml files");