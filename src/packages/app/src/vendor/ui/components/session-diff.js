/** @file Session diff utilities: parse, cache, and normalize file diff entries (unified patches / before-after text) into lazily-computed structures for the review UI. */
import { parseDiffFromFile } from "@pierre/diffs";
import { formatPatch, parsePatch, structuredPatch } from "diff";
const fileDiffCache = new Map();
const patchCache = new WeakMap();
/**
 * Reconstruct before/after text and a unified patch string from a diff entry,
 * memoized against the input object reference. When the entry already carries a
 * `patch` string it is parsed to derive before/after; otherwise a patch is built
 * from the before/after strings (deferred to an empty patch when both are empty).
 * @param {Object} diff - The diff entry (with `patch` string, or `before`/`after` strings and a `file` name).
 * @returns {Object} A record { before, after, patch }.
 */
function patch(diff) {
  // patch() reconstructs before/after strings from the unified-diff text.
  // SessionReview's createMemo over the diff list re-evaluates this on every
  // bus event (streamed patch batches, status updates, file watcher); for a
  // 2885-file diff that meant 2885× parsePatch / structuredPatch per cache
  // miss, which pegged the renderer.
  //
  // Cache the result against the *input* object reference. The vcsQuery
  // cache reuses entries until the underlying file's patch text changes, so
  // a stable input means a stable output.
  const hit = patchCache.get(diff);
  if (hit) return hit;
  let value;
  if (typeof diff.patch === "string" && diff.patch.length > 0) {
    const [parsed] = parsePatch(diff.patch);
    const beforeLines = [];
    const afterLines = [];
    if (parsed) {
      for (const hunk of parsed.hunks) {
        for (const line of hunk.lines) {
          if (line.startsWith("-")) {
            beforeLines.push(line.slice(1));
          } else if (line.startsWith("+")) {
            afterLines.push(line.slice(1));
          } else {
            beforeLines.push(line.slice(1));
            afterLines.push(line.slice(1));
          }
        }
      }
    }
    value = {
      before: beforeLines.join("\n"),
      after: afterLines.join("\n"),
      patch: diff.patch
    };
  } else {
    const before = "before" in diff && typeof diff.before === "string" ? diff.before : "";
    const after = "after" in diff && typeof diff.after === "string" ? diff.after : "";
    // The MAX_SAFE_INTEGER context here forces structuredPatch to emit every
    // line of the file. For our diff-streaming path this branch is only
    // reached when the renderer received an empty placeholder before the
    // sidecar's worker thread published a patch; defer the heavy computation
    // by returning an empty patch and let the next setQueryData refresh
    // replace this object with the streamed result.
    value = {
      before,
      after,
      patch: before === "" && after === "" ? "" : formatPatch(structuredPatch(diff.file, diff.file, before, after, "", "", { context: Number.MAX_SAFE_INTEGER }))
    };
  }
  patchCache.set(diff, value);
  return value;
}
/**
 * Parse a file's before/after contents into a @pierre/diffs file-diff structure,
 * memoized by patch string. Returns an empty hunks structure when there is no
 * patch (binary/empty diffs) so downstream virtualizer code never reads `.at` of undefined.
 * @param {string} file - The file name/path.
 * @param {string} patch - The unified patch string (used as the cache key).
 * @param {string} before - The file contents before the change.
 * @param {string} after - The file contents after the change.
 * @returns {Object} The file-diff structure with additionLines, deletionLines, and hunks.
 */
function fileDiff(file, patch, before, after) {
  // Include an empty `hunks` array: @pierre/diffs' VirtualizedFileDiff /
  // iterateOverDiff does `fileDiff.hunks.at(-1)`, so a patch-less entry (binary
  // files like images, or an empty patch) without `hunks` threw
  // "undefined reading 'at'" inside the SHARED review virtualizer's size
  // computation — which aborted layout for EVERY diff in the panel, so all of
  // them rendered blank.
  if (!patch) return { additionLines: [], deletionLines: [], hunks: [] };
  const hit = fileDiffCache.get(patch);
  if (hit) return hit;
  const value = parseDiffFromFile({
    name: file,
    contents: before
  }, {
    name: file,
    contents: after
  });
  fileDiffCache.set(patch, value);
  return value;
}
/**
 * Normalize a raw diff entry into a stable shape for the review list. File-level
 * metadata (file, patch, additions, deletions, status) is computed eagerly,
 * while the heavy per-line `fileDiff` is exposed as a lazy memoized getter so it
 * is parsed only when a row's inline diff is actually rendered.
 * @param {Object} diff - The raw diff entry.
 * @returns {Object} A normalized record with metadata and a lazy `fileDiff` accessor.
 */
export function normalize(diff) {
  // Only the file-level metadata is computed eagerly here so the diff list
  // can render row headers (filename, +/- counts) without paying for the
  // per-line diff. `fileDiff` is exposed as a lazy accessor — call sites
  // (text(), the expanded SessionReview accordion content) invoke it only
  // when they actually render the inline diff. Before this change every
  // entry in the SessionReview <For> ran parseDiffFromFile + structuredPatch
  // upfront, which dominated the renderer for repos with thousands of dirty
  // files.
  const next = patch(diff);
  let cached;
  return {
    file: diff.file,
    patch: next.patch,
    additions: diff.additions,
    deletions: diff.deletions,
    status: diff.status,
    get fileDiff() {
      if (cached === undefined) cached = fileDiff(diff.file, next.patch, next.before, next.after);
      return cached;
    },
  };
}
/**
 * Get the joined raw text for one side of a normalized diff.
 * @param {Object} diff - A normalized diff entry (with a `fileDiff` accessor).
 * @param {string} side - Which side to read: "deletions" for the before side, otherwise the additions (after) side.
 * @returns {string} The concatenated line text for the requested side.
 */
export function text(diff, side) {
  if (side === "deletions") return diff.fileDiff.deletionLines.join("");
  return diff.fileDiff.additionLines.join("");
}