/** @file "edit" tool: performs a single find-and-replace edit on a file, using a cascade of fuzzy "replacer" strategies to locate the target text, then writes/formats the result and reports a diff plus LSP diagnostics. */
import { assetText } from "#util/asset.js";
// the approaches in this edit tool are sourced from
// https://github.com/cline/cline/blob/main/evals/diff-edits/diff-apply/diff-06-23-25.ts
// https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/utils/editCorrector.ts
// https://github.com/cline/cline/blob/main/evals/diff-edits/diff-apply/diff-06-26-25.ts

import * as path from "path";
import { Effect, Schema, Semaphore } from "effect";
import * as Tool from "./tool.js";
import { LSP } from "#lsp/lsp.js";
import { createTwoFilesPatch, diffLines } from "diff";
const DESCRIPTION = assetText("tool/edit.txt");
import { File } from "../file/index.js";
import { FileWatcher } from "../file/watcher.js";
import { Bus } from "../bus/index.js";
import { Format } from "../format/index.js";
import { InstanceState } from "#effect/instance-state.js";
import { assertExternalDirectoryEffect } from "./external-directory.js";
import { AppFileSystem } from "core/filesystem";
import * as Bom from "#util/bom.js";
/**
 * Converts all CRLF line endings in the text to LF.
 * @param {string} text - The text to normalize.
 * @returns {string} The text with `\r\n` replaced by `\n`.
 */
function normalizeLineEndings(text) {
  return text.replaceAll("\r\n", "\n");
}
/**
 * Detects the dominant line ending of a text.
 * @param {string} text - The text to inspect.
 * @returns {string} "\r\n" if any CRLF is present, otherwise "\n".
 */
function detectLineEnding(text) {
  return text.includes("\r\n") ? "\r\n" : "\n";
}
/**
 * Converts LF line endings in the text to the requested ending.
 * @param {string} text - LF-normalized text.
 * @param {string} ending - The target line ending ("\n" leaves the text unchanged, otherwise CRLF is used).
 * @returns {string} The text with line endings converted to `ending`.
 */
function convertToLineEnding(text, ending) {
  if (ending === "\n") return text;
  return text.replaceAll("\n", "\r\n");
}
/** Per-file semaphores keyed by resolved path, used to serialize concurrent edits to the same file. */
const locks = new Map();
/**
 * Returns (creating if needed) the single-permit semaphore guarding edits to a given file.
 * @param {string} filePath - The file path to lock; resolved to a canonical key.
 * @returns {Object} An Effect Semaphore with one permit for that file.
 */
function lock(filePath) {
  const resolvedFilePath = AppFileSystem.resolve(filePath);
  const hit = locks.get(resolvedFilePath);
  if (hit) return hit;
  const next = Semaphore.makeUnsafe(1);
  locks.set(resolvedFilePath, next);
  return next;
}
/**
 * Parameter schema for the edit tool: the `filePath` to modify, the `oldString` to find, the
 * `newString` to substitute, and an optional `replaceAll` flag.
 */
export const Parameters = Schema.Struct({
  filePath: Schema.String.annotate({
    description: "The absolute path to the file to modify"
  }),
  oldString: Schema.String.annotate({
    description: "The text to replace"
  }),
  newString: Schema.String.annotate({
    description: "The text to replace it with (must be different from oldString)"
  }),
  replaceAll: Schema.optional(Schema.Boolean).annotate({
    description: "Replace all occurrences of oldString (default false)"
  })
});
/**
 * The "edit" tool definition. Validates the arguments, resolves the path, and under a per-file lock
 * either creates the file (when `oldString` is empty) or applies a find-and-replace (preserving the
 * file's existing line endings and BOM). It asks for "edit" permission, writes and optionally formats
 * the file, publishes edit/update events, computes a trimmed diff plus addition/deletion counts, and
 * appends any LSP diagnostics to the output.
 */
export const EditTool = Tool.define("edit", Effect.gen(function* () {
  const lsp = yield* LSP.Service;
  const afs = yield* AppFileSystem.Service;
  const format = yield* Format.Service;
  const bus = yield* Bus.Service;
  return {
    description: DESCRIPTION,
    parameters: Parameters,
    execute: (params, ctx) => Effect.gen(function* () {
      if (!params.filePath) {
        throw new Error("filePath is required");
      }
      if (params.oldString === params.newString) {
        throw new Error("No changes to apply: oldString and newString are identical.");
      }
      const instance = yield* InstanceState.context;
      const filePath = path.isAbsolute(params.filePath) ? params.filePath : path.join(instance.directory, params.filePath);
      yield* assertExternalDirectoryEffect(ctx, filePath);
      let diff = "";
      let contentOld = "";
      let contentNew = "";
      yield* lock(filePath).withPermits(1)(Effect.gen(function* () {
        if (params.oldString === "") {
          const existed = yield* afs.existsSafe(filePath);
          const source = existed ? yield* Bom.readFile(afs, filePath) : {
            bom: false,
            text: ""
          };
          const next = Bom.split(params.newString);
          const desiredBom = source.bom || next.bom;
          contentOld = source.text;
          contentNew = next.text;
          diff = trimDiff(createTwoFilesPatch(filePath, filePath, contentOld, contentNew));
          yield* ctx.ask({
            permission: "edit",
            patterns: [path.relative(instance.worktree, filePath)],
            always: ["*"],
            metadata: {
              filepath: filePath,
              diff
            }
          });
          yield* afs.writeWithDirs(filePath, Bom.join(contentNew, desiredBom));
          if (yield* format.file(filePath)) {
            contentNew = yield* Bom.syncFile(afs, filePath, desiredBom);
          }
          yield* bus.publish(File.Event.Edited, {
            file: filePath
          });
          yield* bus.publish(FileWatcher.Event.Updated, {
            file: filePath,
            event: existed ? "change" : "add"
          });
          return;
        }
        const info = yield* afs.stat(filePath).pipe(Effect.catch(() => Effect.succeed(undefined)));
        if (!info) throw new Error(`File ${filePath} not found`);
        if (info.type === "Directory") throw new Error(`Path is a directory, not a file: ${filePath}`);
        const source = yield* Bom.readFile(afs, filePath);
        contentOld = source.text;
        const ending = detectLineEnding(contentOld);
        const old = convertToLineEnding(normalizeLineEndings(params.oldString), ending);
        const replacement = convertToLineEnding(normalizeLineEndings(params.newString), ending);
        const next = Bom.split(replace(contentOld, old, replacement, params.replaceAll));
        const desiredBom = source.bom || next.bom;
        contentNew = next.text;
        diff = trimDiff(createTwoFilesPatch(filePath, filePath, normalizeLineEndings(contentOld), normalizeLineEndings(contentNew)));
        yield* ctx.ask({
          permission: "edit",
          patterns: [path.relative(instance.worktree, filePath)],
          always: ["*"],
          metadata: {
            filepath: filePath,
            diff
          }
        });
        yield* afs.writeWithDirs(filePath, Bom.join(contentNew, desiredBom));
        if (yield* format.file(filePath)) {
          contentNew = yield* Bom.syncFile(afs, filePath, desiredBom);
        }
        yield* bus.publish(File.Event.Edited, {
          file: filePath
        });
        yield* bus.publish(FileWatcher.Event.Updated, {
          file: filePath,
          event: "change"
        });
        diff = trimDiff(createTwoFilesPatch(filePath, filePath, normalizeLineEndings(contentOld), normalizeLineEndings(contentNew)));
      }).pipe(Effect.orDie));
      let additions = 0;
      let deletions = 0;
      for (const change of diffLines(contentOld, contentNew)) {
        if (change.added) additions += change.count || 0;
        if (change.removed) deletions += change.count || 0;
      }
      const filediff = {
        file: filePath,
        patch: diff,
        additions,
        deletions
      };
      yield* ctx.metadata({
        metadata: {
          diff,
          filediff,
          diagnostics: {}
        }
      });
      let output = "Edit applied successfully.";
      yield* lsp.touchFile(filePath, "document");
      const diagnostics = yield* lsp.diagnostics();
      const normalizedFilePath = AppFileSystem.normalizePath(filePath);
      const block = LSP.Diagnostic.report(filePath, diagnostics[normalizedFilePath] ?? []);
      if (block) output += `\n\nLSP errors detected in this file, please fix:\n${block}`;
      return {
        metadata: {
          diagnostics,
          diff,
          filediff
        },
        title: `${path.relative(instance.worktree, filePath)}`,
        output
      };
    })
  };
}));
// Similarity thresholds for block anchor fallback matching
/** Minimum middle-line similarity to accept a block-anchor match when there is exactly one candidate (anchors alone suffice). */
const SINGLE_CANDIDATE_SIMILARITY_THRESHOLD = 0.0;
/** Minimum middle-line similarity required to accept the best candidate when multiple block-anchor candidates exist. */
const MULTIPLE_CANDIDATES_SIMILARITY_THRESHOLD = 0.3;

/**
 * Levenshtein distance algorithm implementation: the minimum number of single-character edits
 * (insertions, deletions, substitutions) needed to turn `a` into `b`.
 * @param {string} a - First string.
 * @param {string} b - Second string.
 * @returns {number} The edit distance between `a` and `b`.
 */
function levenshtein(a, b) {
  // Handle empty strings
  if (a === "" || b === "") {
    return Math.max(a.length, b.length);
  }
  const matrix = Array.from({
    length: a.length + 1
  }, (_, i) => Array.from({
    length: b.length + 1
  }, (_, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
    }
  }
  return matrix[a.length][b.length];
}
/**
 * Replacer that yields the search string verbatim (exact match candidate).
 * @param {string} _content - The full file content (unused).
 * @param {string} find - The text to locate.
 * @returns {Generator<string>} Yields `find` once.
 */
export const SimpleReplacer = function* (_content, find) {
  yield find;
};
/**
 * Replacer that matches a block of lines ignoring leading/trailing whitespace on each line, yielding
 * the corresponding raw substring of the original content.
 * @param {string} content - The full file content to search.
 * @param {string} find - The text to locate (compared line-by-line after trimming).
 * @returns {Generator<string>} Yields each matching original-content substring.
 */
export const LineTrimmedReplacer = function* (content, find) {
  const originalLines = content.split("\n");
  const searchLines = find.split("\n");
  if (searchLines[searchLines.length - 1] === "") {
    searchLines.pop();
  }
  for (let i = 0; i <= originalLines.length - searchLines.length; i++) {
    let matches = true;
    for (let j = 0; j < searchLines.length; j++) {
      const originalTrimmed = originalLines[i + j].trim();
      const searchTrimmed = searchLines[j].trim();
      if (originalTrimmed !== searchTrimmed) {
        matches = false;
        break;
      }
    }
    if (matches) {
      let matchStartIndex = 0;
      for (let k = 0; k < i; k++) {
        matchStartIndex += originalLines[k].length + 1;
      }
      let matchEndIndex = matchStartIndex;
      for (let k = 0; k < searchLines.length; k++) {
        matchEndIndex += originalLines[i + k].length;
        if (k < searchLines.length - 1) {
          matchEndIndex += 1; // Add newline character except for the last line
        }
      }
      yield content.substring(matchStartIndex, matchEndIndex);
    }
  }
};
/**
 * Replacer for blocks of 3+ lines that anchors on the trimmed first and last lines, then scores
 * candidate blocks by middle-line similarity (Levenshtein-based) and yields the best/only acceptable
 * match's raw substring. Tolerates differences in the interior lines.
 * @param {string} content - The full file content to search.
 * @param {string} find - The multi-line text to locate (its first/last lines act as anchors).
 * @returns {Generator<string>} Yields at most one matching original-content substring.
 */
export const BlockAnchorReplacer = function* (content, find) {
  const originalLines = content.split("\n");
  const searchLines = find.split("\n");
  if (searchLines.length < 3) {
    return;
  }
  if (searchLines[searchLines.length - 1] === "") {
    searchLines.pop();
  }
  const firstLineSearch = searchLines[0].trim();
  const lastLineSearch = searchLines[searchLines.length - 1].trim();
  const searchBlockSize = searchLines.length;

  // Collect all candidate positions where both anchors match
  const candidates = [];
  for (let i = 0; i < originalLines.length; i++) {
    if (originalLines[i].trim() !== firstLineSearch) {
      continue;
    }

    // Look for the matching last line after this first line
    for (let j = i + 2; j < originalLines.length; j++) {
      if (originalLines[j].trim() === lastLineSearch) {
        candidates.push({
          startLine: i,
          endLine: j
        });
        break; // Only match the first occurrence of the last line
      }
    }
  }

  // Return immediately if no candidates
  if (candidates.length === 0) {
    return;
  }

  // Handle single candidate scenario (using relaxed threshold)
  if (candidates.length === 1) {
    const {
      startLine,
      endLine
    } = candidates[0];
    const actualBlockSize = endLine - startLine + 1;
    let similarity = 0;
    let linesToCheck = Math.min(searchBlockSize - 2, actualBlockSize - 2); // Middle lines only

    if (linesToCheck > 0) {
      for (let j = 1; j < searchBlockSize - 1 && j < actualBlockSize - 1; j++) {
        const originalLine = originalLines[startLine + j].trim();
        const searchLine = searchLines[j].trim();
        const maxLen = Math.max(originalLine.length, searchLine.length);
        if (maxLen === 0) {
          continue;
        }
        const distance = levenshtein(originalLine, searchLine);
        similarity += (1 - distance / maxLen) / linesToCheck;

        // Exit early when threshold is reached
        if (similarity >= SINGLE_CANDIDATE_SIMILARITY_THRESHOLD) {
          break;
        }
      }
    } else {
      // No middle lines to compare, just accept based on anchors
      similarity = 1.0;
    }
    if (similarity >= SINGLE_CANDIDATE_SIMILARITY_THRESHOLD) {
      let matchStartIndex = 0;
      for (let k = 0; k < startLine; k++) {
        matchStartIndex += originalLines[k].length + 1;
      }
      let matchEndIndex = matchStartIndex;
      for (let k = startLine; k <= endLine; k++) {
        matchEndIndex += originalLines[k].length;
        if (k < endLine) {
          matchEndIndex += 1; // Add newline character except for the last line
        }
      }
      yield content.substring(matchStartIndex, matchEndIndex);
    }
    return;
  }

  // Calculate similarity for multiple candidates
  let bestMatch = null;
  let maxSimilarity = -1;
  for (const candidate of candidates) {
    const {
      startLine,
      endLine
    } = candidate;
    const actualBlockSize = endLine - startLine + 1;
    let similarity = 0;
    let linesToCheck = Math.min(searchBlockSize - 2, actualBlockSize - 2); // Middle lines only

    if (linesToCheck > 0) {
      for (let j = 1; j < searchBlockSize - 1 && j < actualBlockSize - 1; j++) {
        const originalLine = originalLines[startLine + j].trim();
        const searchLine = searchLines[j].trim();
        const maxLen = Math.max(originalLine.length, searchLine.length);
        if (maxLen === 0) {
          continue;
        }
        const distance = levenshtein(originalLine, searchLine);
        similarity += 1 - distance / maxLen;
      }
      similarity /= linesToCheck; // Average similarity
    } else {
      // No middle lines to compare, just accept based on anchors
      similarity = 1.0;
    }
    if (similarity > maxSimilarity) {
      maxSimilarity = similarity;
      bestMatch = candidate;
    }
  }

  // Threshold judgment
  if (maxSimilarity >= MULTIPLE_CANDIDATES_SIMILARITY_THRESHOLD && bestMatch) {
    const {
      startLine,
      endLine
    } = bestMatch;
    let matchStartIndex = 0;
    for (let k = 0; k < startLine; k++) {
      matchStartIndex += originalLines[k].length + 1;
    }
    let matchEndIndex = matchStartIndex;
    for (let k = startLine; k <= endLine; k++) {
      matchEndIndex += originalLines[k].length;
      if (k < endLine) {
        matchEndIndex += 1;
      }
    }
    yield content.substring(matchStartIndex, matchEndIndex);
  }
};
/**
 * Replacer that matches by collapsing all runs of whitespace to single spaces, handling both single-line
 * (full-line or substring) and multi-line matches, and yields the matching raw substring of the content.
 * @param {string} content - The full file content to search.
 * @param {string} find - The text to locate (whitespace-normalized before comparison).
 * @returns {Generator<string>} Yields each matching original-content substring.
 */
export const WhitespaceNormalizedReplacer = function* (content, find) {
  const normalizeWhitespace = text => text.replace(/\s+/g, " ").trim();
  const normalizedFind = normalizeWhitespace(find);

  // Handle single line matches
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (normalizeWhitespace(line) === normalizedFind) {
      yield line;
    } else {
      // Only check for substring matches if the full line doesn't match
      const normalizedLine = normalizeWhitespace(line);
      if (normalizedLine.includes(normalizedFind)) {
        // Find the actual substring in the original line that matches
        const words = find.trim().split(/\s+/);
        if (words.length > 0) {
          const pattern = words.map(word => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
          try {
            const regex = new RegExp(pattern);
            const match = line.match(regex);
            if (match) {
              yield match[0];
            }
          } catch {
            // Invalid regex pattern, skip
          }
        }
      }
    }
  }

  // Handle multi-line matches
  const findLines = find.split("\n");
  if (findLines.length > 1) {
    for (let i = 0; i <= lines.length - findLines.length; i++) {
      const block = lines.slice(i, i + findLines.length);
      if (normalizeWhitespace(block.join("\n")) === normalizedFind) {
        yield block.join("\n");
      }
    }
  }
};
/**
 * Replacer that matches blocks after stripping their common leading indentation, so the search text can
 * be matched regardless of how deeply the original block is indented; yields the matching raw substring.
 * @param {string} content - The full file content to search.
 * @param {string} find - The text to locate (compared with common indentation removed).
 * @returns {Generator<string>} Yields each matching original-content block.
 */
export const IndentationFlexibleReplacer = function* (content, find) {
  const removeIndentation = text => {
    const lines = text.split("\n");
    const nonEmptyLines = lines.filter(line => line.trim().length > 0);
    if (nonEmptyLines.length === 0) return text;
    const minIndent = Math.min(...nonEmptyLines.map(line => {
      const match = line.match(/^(\s*)/);
      return match ? match[1].length : 0;
    }));
    return lines.map(line => line.trim().length === 0 ? line : line.slice(minIndent)).join("\n");
  };
  const normalizedFind = removeIndentation(find);
  const contentLines = content.split("\n");
  const findLines = find.split("\n");
  for (let i = 0; i <= contentLines.length - findLines.length; i++) {
    const block = contentLines.slice(i, i + findLines.length).join("\n");
    if (removeIndentation(block) === normalizedFind) {
      yield block;
    }
  }
};
/**
 * Replacer that interprets backslash escape sequences (\n, \t, \r, quotes, \\, \$) in the search text,
 * then yields either the unescaped string if found directly or any content block whose own unescaping
 * matches the unescaped search text.
 * @param {string} content - The full file content to search.
 * @param {string} find - The text to locate (escape sequences are resolved before comparison).
 * @returns {Generator<string>} Yields each matching content substring/block.
 */
export const EscapeNormalizedReplacer = function* (content, find) {
  const unescapeString = str => {
    return str.replace(/\\(n|t|r|'|"|`|\\|\n|\$)/g, (match, capturedChar) => {
      switch (capturedChar) {
        case "n":
          return "\n";
        case "t":
          return "\t";
        case "r":
          return "\r";
        case "'":
          return "'";
        case '"':
          return '"';
        case "`":
          return "`";
        case "\\":
          return "\\";
        case "\n":
          return "\n";
        case "$":
          return "$";
        default:
          return match;
      }
    });
  };
  const unescapedFind = unescapeString(find);

  // Try direct match with unescaped find string
  if (content.includes(unescapedFind)) {
    yield unescapedFind;
  }

  // Also try finding escaped versions in content that match unescaped find
  const lines = content.split("\n");
  const findLines = unescapedFind.split("\n");
  for (let i = 0; i <= lines.length - findLines.length; i++) {
    const block = lines.slice(i, i + findLines.length).join("\n");
    const unescapedBlock = unescapeString(block);
    if (unescapedBlock === unescapedFind) {
      yield block;
    }
  }
};
/**
 * Replacer that yields the exact search string once for every occurrence in the content, letting the
 * caller decide how to handle multiple matches (e.g. via replaceAll).
 * @param {string} content - The full file content to search.
 * @param {string} find - The exact text to locate.
 * @returns {Generator<string>} Yields `find` once per occurrence found.
 */
export const MultiOccurrenceReplacer = function* (content, find) {
  // This replacer yields all exact matches, allowing the replace function
  // to handle multiple occurrences based on replaceAll parameter
  let startIndex = 0;
  while (true) {
    const index = content.indexOf(find, startIndex);
    if (index === -1) break;
    yield find;
    startIndex = index + find.length;
  }
};
/**
 * Replacer that retries matching after trimming the search text's leading/trailing whitespace, yielding
 * the trimmed string if found directly or any content block whose trimmed form equals it. No-ops when the
 * search text is already trimmed.
 * @param {string} content - The full file content to search.
 * @param {string} find - The text to locate (its surrounding whitespace is trimmed before comparison).
 * @returns {Generator<string>} Yields each matching content substring/block.
 */
export const TrimmedBoundaryReplacer = function* (content, find) {
  const trimmedFind = find.trim();
  if (trimmedFind === find) {
    // Already trimmed, no point in trying
    return;
  }

  // Try to find the trimmed version
  if (content.includes(trimmedFind)) {
    yield trimmedFind;
  }

  // Also try finding blocks where trimmed content matches
  const lines = content.split("\n");
  const findLines = find.split("\n");
  for (let i = 0; i <= lines.length - findLines.length; i++) {
    const block = lines.slice(i, i + findLines.length).join("\n");
    if (block.trim() === trimmedFind) {
      yield block;
    }
  }
};
/**
 * Replacer for blocks of 3+ lines that anchors on the trimmed first and last lines and accepts a block of
 * the same length only when at least half of its interior non-empty lines match (after trimming), yielding
 * the matching raw substring.
 * @param {string} content - The full file content to search.
 * @param {string} find - The multi-line text to locate (first/last lines act as context anchors).
 * @returns {Generator<string>} Yields at most one matching original-content block.
 */
export const ContextAwareReplacer = function* (content, find) {
  const findLines = find.split("\n");
  if (findLines.length < 3) {
    // Need at least 3 lines to have meaningful context
    return;
  }

  // Remove trailing empty line if present
  if (findLines[findLines.length - 1] === "") {
    findLines.pop();
  }
  const contentLines = content.split("\n");

  // Extract first and last lines as context anchors
  const firstLine = findLines[0].trim();
  const lastLine = findLines[findLines.length - 1].trim();

  // Find blocks that start and end with the context anchors
  for (let i = 0; i < contentLines.length; i++) {
    if (contentLines[i].trim() !== firstLine) continue;

    // Look for the matching last line
    for (let j = i + 2; j < contentLines.length; j++) {
      if (contentLines[j].trim() === lastLine) {
        // Found a potential context block
        const blockLines = contentLines.slice(i, j + 1);
        const block = blockLines.join("\n");

        // Check if the middle content has reasonable similarity
        // (simple heuristic: at least 50% of non-empty lines should match when trimmed)
        if (blockLines.length === findLines.length) {
          let matchingLines = 0;
          let totalNonEmptyLines = 0;
          for (let k = 1; k < blockLines.length - 1; k++) {
            const blockLine = blockLines[k].trim();
            const findLine = findLines[k].trim();
            if (blockLine.length > 0 || findLine.length > 0) {
              totalNonEmptyLines++;
              if (blockLine === findLine) {
                matchingLines++;
              }
            }
          }
          if (totalNonEmptyLines === 0 || matchingLines / totalNonEmptyLines >= 0.5) {
            yield block;
            break; // Only match the first occurrence
          }
        }
        break;
      }
    }
  }
};
/**
 * Removes the common leading indentation shared by all content lines (+/-/space) of a unified diff,
 * leaving the +/-/space prefixes and the `---`/`+++` header lines untouched, so the diff renders without
 * a large uniform indent.
 * @param {string} diff - A unified diff string.
 * @returns {string} The diff with shared content-line indentation stripped (unchanged if there is none).
 */
export function trimDiff(diff) {
  const lines = diff.split("\n");
  const contentLines = lines.filter(line => (line.startsWith("+") || line.startsWith("-") || line.startsWith(" ")) && !line.startsWith("---") && !line.startsWith("+++"));
  if (contentLines.length === 0) return diff;
  let min = Infinity;
  for (const line of contentLines) {
    const content = line.slice(1);
    if (content.trim().length > 0) {
      const match = content.match(/^(\s*)/);
      if (match) min = Math.min(min, match[1].length);
    }
  }
  if (min === Infinity || min === 0) return diff;
  const trimmedLines = lines.map(line => {
    if ((line.startsWith("+") || line.startsWith("-") || line.startsWith(" ")) && !line.startsWith("---") && !line.startsWith("+++")) {
      const prefix = line[0];
      const content = line.slice(1);
      return prefix + content.slice(min);
    }
    return line;
  });
  return trimmedLines.join("\n");
}
/**
 * Replaces an occurrence of `oldString` with `newString` in `content`, trying each replacer strategy in
 * order until one finds a match. Throws if `oldString` equals `newString`, if no replacer locates the text,
 * or (when not replacing all) if the located text is ambiguous (multiple occurrences).
 * @param {string} content - The original file content.
 * @param {string} oldString - The text to find (matched via the replacer cascade).
 * @param {string} newString - The replacement text.
 * @param {boolean} replaceAll - When true, replaces every occurrence; otherwise requires a unique match.
 * @returns {string} The content with the replacement applied.
 */
export function replace(content, oldString, newString, replaceAll = false) {
  if (oldString === newString) {
    throw new Error("No changes to apply: oldString and newString are identical.");
  }
  let notFound = true;
  for (const replacer of [SimpleReplacer, LineTrimmedReplacer, BlockAnchorReplacer, WhitespaceNormalizedReplacer, IndentationFlexibleReplacer, EscapeNormalizedReplacer, TrimmedBoundaryReplacer, ContextAwareReplacer, MultiOccurrenceReplacer]) {
    for (const search of replacer(content, oldString)) {
      const index = content.indexOf(search);
      if (index === -1) continue;
      notFound = false;
      if (replaceAll) {
        return content.replaceAll(search, newString);
      }
      const lastIndex = content.lastIndexOf(search);
      if (index !== lastIndex) continue;
      return content.substring(0, index) + newString + content.substring(index + search.length);
    }
  }
  if (notFound) {
    throw new Error("Could not find oldString in the file. It must match exactly, including whitespace, indentation, and line endings.");
  }
  throw new Error("Found multiple matches for oldString. Provide more surrounding context to make the match unique.");
}