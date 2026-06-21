/** @file Shared SVG->PNG helper for the capture scripts. Resolves a `sharp` build (CC_SHARP_PATH, an installed dependency, or one discovered by walking up the tree scanning node_modules/sharp — handles monorepo / sibling-app layouts) and writes PNG by default, falling back to SVG only when sharp is unavailable. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolve a usable `sharp` module, or null. Order: CC_SHARP_PATH, an installed
 * `sharp` dependency, then a bounded upward walk scanning each parent's and its
 * immediate children's node_modules/sharp (so a sibling app's sharp is found).
 * @returns {Object|null} the sharp module, or null when none is available.
 */
export function loadSharp() {
  const tries = [];
  if (process.env.CC_SHARP_PATH) tries.push(process.env.CC_SHARP_PATH);
  tries.push("sharp");
  let dir = here;
  for (let i = 0; i < 8; i++) {
    tries.push(path.join(dir, "node_modules", "sharp"));
    if (path.basename(dir) !== "node_modules") {
      try { for (const sub of fs.readdirSync(dir)) tries.push(path.join(dir, sub, "node_modules", "sharp")); } catch { /* ignore */ }
    }
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  for (const t of tries) { try { return require(t); } catch { /* next */ } }
  return null;
}

let _sharp;
/**
 * Write `svg` as `<base>.png` (default). When sharp is unavailable, write
 * `<base>.svg` instead. With keepSvg=true, also write the SVG alongside the PNG.
 * @param {string} base - Output path without extension.
 * @param {string} svg - The SVG document.
 * @param {Object} [opts] - { keepSvg }.
 * @returns {Promise<string[]>} the basenames written.
 */
export async function emitImage(base, svg, { keepSvg = false } = {}) {
  if (_sharp === undefined) _sharp = loadSharp();
  const made = [];
  if (keepSvg || !_sharp) { fs.writeFileSync(base + ".svg", svg); made.push(path.basename(base) + ".svg"); }
  if (_sharp) {
    try { await _sharp(Buffer.from(svg)).png().toFile(base + ".png"); made.push(path.basename(base) + ".png"); }
    catch (e) {
      console.error("png:", e.message);
      if (!made.length) { fs.writeFileSync(base + ".svg", svg); made.push(path.basename(base) + ".svg"); }
    }
  }
  return made;
}
