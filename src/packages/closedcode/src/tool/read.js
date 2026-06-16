/** @file The "read" tool: reads files (text, images, PDFs) and directory listings with offset/limit paging, byte/line caps, and binary detection. */
import { assetText } from "#util/asset.js";
import { Effect, Option, Schema, Scope } from "effect";
import { NonNegativeInt } from "#util/schema.js";
import { createReadStream } from "fs";
import * as path from "path";
import { createInterface } from "readline";
import * as Tool from "./tool.js";
import { AppFileSystem } from "core/filesystem";
import { LSP } from "#lsp/lsp.js";
const DESCRIPTION = assetText("tool/read.txt");
import { InstanceState } from "#effect/instance-state.js";
import { assertExternalDirectoryEffect } from "./external-directory.js";
import { Instruction } from "../session/instruction.js";
import { isPdfAttachment, sniffAttachmentMime } from "#util/media.js";
const DEFAULT_READ_LIMIT = 2000;
const MAX_LINE_LENGTH = 2000;
const MAX_LINE_SUFFIX = `... (line truncated to ${MAX_LINE_LENGTH} chars)`;
const MAX_BYTES = 50 * 1024;
const MAX_BYTES_LABEL = `${MAX_BYTES / 1024} KB`;
const SAMPLE_BYTES = 4096;
const SUPPORTED_IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

// `offset` and `limit` were originally `z.coerce.number()` — the runtime
// coercion was useful when the tool was called from a shell but serves no
// purpose in the LLM tool-call path (the model emits typed JSON). The JSON
// Schema output is identical (`type: "number"`), so the LLM view is
// unchanged; purely CLI-facing uses must now send numbers rather than strings.
/**
 * Parameter schema for the read tool: an absolute file or directory path with
 * optional 1-indexed `offset` and `limit` line/entry counts.
 * @type {Object}
 */
export const Parameters = Schema.Struct({
  filePath: Schema.String.annotate({
    description: "The absolute path to the file or directory to read"
  }),
  offset: Schema.optional(NonNegativeInt).annotate({
    description: "The line number to start reading from (1-indexed)"
  }),
  limit: Schema.optional(NonNegativeInt).annotate({
    description: "The maximum number of lines to read (defaults to 2000)"
  })
});
/**
 * The "read" tool. Resolves the requested path, checks permissions and external
 * directory access, then renders a directory listing, an image/PDF attachment,
 * or a paged, byte/line-capped text view; binary files are rejected. Also warms
 * the LSP and appends any resolved instruction files as a system reminder.
 * @type {Object}
 */
export const ReadTool = Tool.define("read", Effect.gen(function* () {
  const fs = yield* AppFileSystem.Service;
  const instruction = yield* Instruction.Service;
  const lsp = yield* LSP.Service;
  const scope = yield* Scope.Scope;
  /**
   * Build a "file not found" error, suggesting up to three sibling entries whose
   * names fuzzily match the missing basename.
   * @param {string} filepath - The absolute path that was not found.
   * @returns {Effect} An effect that always fails with a descriptive Error.
   */
  const miss = Effect.fn("ReadTool.miss")(function* (filepath) {
    const dir = path.dirname(filepath);
    const base = path.basename(filepath);
    const items = yield* fs.readDirectory(dir).pipe(Effect.map(items => items.filter(item => item.toLowerCase().includes(base.toLowerCase()) || base.toLowerCase().includes(item.toLowerCase())).map(item => path.join(dir, item)).slice(0, 3)), Effect.catch(() => Effect.succeed([])));
    if (items.length > 0) {
      return yield* Effect.fail(new Error(`File not found: ${filepath}\n\nDid you mean one of these?\n${items.join("\n")}`));
    }
    return yield* Effect.fail(new Error(`File not found: ${filepath}`));
  });
  /**
   * List the entries of a directory, suffixing directory names (and symlinks
   * that resolve to directories) with a trailing slash, sorted alphabetically.
   * @param {string} filepath - Absolute path of the directory to list.
   * @returns {Effect} An effect yielding a sorted Array of entry name strings.
   */
  const list = Effect.fn("ReadTool.list")(function* (filepath) {
    const items = yield* fs.readDirectoryEntries(filepath);
    return yield* Effect.forEach(items, Effect.fnUntraced(function* (item) {
      if (item.type === "directory") return item.name + "/";
      if (item.type !== "symlink") return item.name;
      const target = yield* fs.stat(path.join(filepath, item.name)).pipe(Effect.catch(() => Effect.void));
      if (target?.type === "Directory") return item.name + "/";
      return item.name;
    }), {
      concurrency: "unbounded"
    }).pipe(Effect.map(items => items.sort((a, b) => a.localeCompare(b))));
  });
  /**
   * Warm the LSP for a file by touching it in a forked, error-ignoring fiber.
   * @param {string} filepath - Absolute path of the file to warm.
   * @returns {Effect} An effect that forks the touch and returns immediately.
   */
  const warm = Effect.fn("ReadTool.warm")(function* (filepath) {
    yield* lsp.touchFile(filepath).pipe(Effect.ignore, Effect.forkIn(scope));
  });
  /**
   * Read up to `sampleSize` bytes from the start of a file (used for MIME and
   * binary detection); returns an empty array for empty files.
   * @param {string} filepath - Absolute path of the file to sample.
   * @param {number} fileSize - Known total size of the file in bytes.
   * @param {number} sampleSize - Maximum number of bytes to read.
   * @returns {Effect} An effect yielding a Uint8Array of the sampled bytes.
   */
  const readSample = Effect.fn("ReadTool.readSample")(function* (filepath, fileSize, sampleSize) {
    if (fileSize === 0) return new Uint8Array();
    return yield* Effect.scoped(Effect.gen(function* () {
      const file = yield* fs.open(filepath, {
        flag: "r"
      });
      return Option.getOrElse(yield* file.readAlloc(Math.min(sampleSize, fileSize)), () => new Uint8Array());
    }));
  });
  /**
   * Decide whether a file is binary, first by a denylist of known binary
   * extensions, then by scanning the sampled bytes for NUL or a high ratio
   * (over 30%) of non-printable control characters.
   * @param {string} filepath - Absolute path of the file (used for its extension).
   * @param {Uint8Array} bytes - Sampled leading bytes of the file.
   * @returns {boolean} True if the file is considered binary.
   */
  const isBinaryFile = (filepath, bytes) => {
    const ext = path.extname(filepath).toLowerCase();
    switch (ext) {
      case ".zip":
      case ".tar":
      case ".gz":
      case ".exe":
      case ".dll":
      case ".so":
      case ".class":
      case ".jar":
      case ".war":
      case ".7z":
      case ".doc":
      case ".docx":
      case ".xls":
      case ".xlsx":
      case ".ppt":
      case ".pptx":
      case ".odt":
      case ".ods":
      case ".odp":
      case ".bin":
      case ".dat":
      case ".obj":
      case ".o":
      case ".a":
      case ".lib":
      case ".wasm":
      case ".pyc":
      case ".pyo":
        return true;
    }
    if (bytes.length === 0) return false;
    let nonPrintableCount = 0;
    for (let i = 0; i < bytes.length; i++) {
      if (bytes[i] === 0) return true;
      if (bytes[i] < 9 || bytes[i] > 13 && bytes[i] < 32) {
        nonPrintableCount++;
      }
    }
    return nonPrintableCount / bytes.length > 0.3;
  };
  /**
   * Core execution for the read tool: resolves/normalizes the path, enforces
   * permission and external-directory checks, and dispatches to directory
   * listing, image/PDF attachment, or paged text reading. Throws for missing
   * files, binary files, or out-of-range offsets.
   * @param {Object} params - Tool parameters (filePath, optional offset/limit).
   * @param {Object} ctx - Tool execution context (sessionID, ask, messages, etc.).
   * @returns {Effect} An effect yielding the tool result (title, output, metadata, optional attachments).
   */
  const run = Effect.fn("ReadTool.execute")(function* (params, ctx) {
    const instance = yield* InstanceState.context;
    let filepath = params.filePath;
    if (!path.isAbsolute(filepath)) {
      filepath = path.resolve(instance.directory, filepath);
    }
    if (process.platform === "win32") {
      filepath = AppFileSystem.normalizePath(filepath);
    }
    const title = path.relative(instance.worktree, filepath);
    const stat = yield* fs.stat(filepath).pipe(Effect.catchIf(err => "reason" in err && err.reason._tag === "NotFound", () => Effect.succeed(undefined)));
    yield* assertExternalDirectoryEffect(ctx, filepath, {
      bypass: Boolean(ctx.extra?.["bypassCwdCheck"]),
      kind: stat?.type === "Directory" ? "directory" : "file"
    });
    yield* ctx.ask({
      permission: "read",
      patterns: [filepath],
      always: ["*"],
      metadata: {}
    });
    if (!stat) return yield* miss(filepath);
    if (stat.type === "Directory") {
      const items = yield* list(filepath);
      const limit = params.limit ?? DEFAULT_READ_LIMIT;
      const offset = params.offset || 1;
      const start = offset - 1;
      const sliced = items.slice(start, start + limit);
      const truncated = start + sliced.length < items.length;
      return {
        title,
        output: [`<path>${filepath}</path>`, `<type>directory</type>`, `<entries>`, sliced.join("\n"), truncated ? `\n(Showing ${sliced.length} of ${items.length} entries. Use 'offset' parameter to read beyond entry ${offset + sliced.length})` : `\n(${items.length} entries)`, `</entries>`].join("\n"),
        metadata: {
          preview: sliced.slice(0, 20).join("\n"),
          truncated,
          loaded: []
        }
      };
    }
    const loaded = yield* instruction.resolve(ctx.messages, filepath, ctx.messageID);
    const sample = yield* readSample(filepath, Number(stat.size), SAMPLE_BYTES);
    const mime = sniffAttachmentMime(sample, AppFileSystem.mimeType(filepath));
    const isImage = SUPPORTED_IMAGE_MIMES.has(mime);
    if (isImage || isPdfAttachment(mime)) {
      const bytes = yield* fs.readFile(filepath);
      const msg = isPdfAttachment(mime) ? "PDF read successfully" : "Image read successfully";
      return {
        title,
        output: msg,
        metadata: {
          preview: msg,
          truncated: false,
          loaded: loaded.map(item => item.filepath)
        },
        attachments: [{
          type: "file",
          mime,
          url: `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`
        }]
      };
    }
    if (isBinaryFile(filepath, sample)) {
      return yield* Effect.fail(new Error(`Cannot read binary file: ${filepath}`));
    }
    const file = yield* Effect.promise(() => lines(filepath, {
      limit: params.limit ?? DEFAULT_READ_LIMIT,
      offset: params.offset || 1
    }));
    if (file.count < file.offset && !(file.count === 0 && file.offset === 1)) {
      return yield* Effect.fail(new Error(`Offset ${file.offset} is out of range for this file (${file.count} lines)`));
    }
    let output = [`<path>${filepath}</path>`, `<type>file</type>`, "<content>\n"].join("\n");
    output += file.raw.map((line, i) => `${i + file.offset}: ${line}`).join("\n");
    const last = file.offset + file.raw.length - 1;
    const next = last + 1;
    const truncated = file.more || file.cut;
    if (file.cut) {
      output += `\n\n(Output capped at ${MAX_BYTES_LABEL}. Showing lines ${file.offset}-${last}. Use offset=${next} to continue.)`;
    } else if (file.more) {
      output += `\n\n(Showing lines ${file.offset}-${last} of ${file.count}. Use offset=${next} to continue.)`;
    } else {
      output += `\n\n(End of file - total ${file.count} lines)`;
    }
    output += "\n</content>";
    yield* warm(filepath);
    if (loaded.length > 0) {
      output += `\n\n<system-reminder>\n${loaded.map(item => item.content).join("\n\n")}\n</system-reminder>`;
    }
    return {
      title,
      output,
      metadata: {
        preview: file.raw.slice(0, 20).join("\n"),
        truncated,
        loaded: loaded.map(item => item.filepath)
      }
    };
  });
  return {
    description: DESCRIPTION,
    parameters: Parameters,
    execute: (params, ctx) => run(params, ctx).pipe(Effect.orDie)
  };
}));
/**
 * Stream a text file line by line, returning a window of lines starting at
 * `opts.offset` (1-indexed) up to `opts.limit` lines. Individual lines longer
 * than MAX_LINE_LENGTH are truncated, and the window is capped at MAX_BYTES; it
 * also reports total line count and whether more content / a byte cut occurred.
 * @param {string} filepath - Absolute path of the file to read.
 * @param {Object} opts - Paging options: {offset: number, limit: number}.
 * @returns {Promise<Object>} Resolves to {raw, count, cut, more, offset} where
 *   `raw` is the Array of selected lines, `count` is the total lines scanned,
 *   `cut` indicates a byte-budget cut, and `more` indicates additional unread lines.
 */
async function lines(filepath, opts) {
  const stream = createReadStream(filepath, {
    encoding: "utf8"
  });
  const rl = createInterface({
    input: stream,
    // Note: we use the crlfDelay option to recognize all instances of CR LF
    // ('\r\n') in file as a single line break.
    crlfDelay: Infinity
  });
  const start = opts.offset - 1;
  const raw = [];
  let bytes = 0;
  let count = 0;
  let cut = false;
  let more = false;
  try {
    for await (const text of rl) {
      count += 1;
      if (count <= start) continue;
      if (raw.length >= opts.limit) {
        more = true;
        continue;
      }
      const line = text.length > MAX_LINE_LENGTH ? text.substring(0, MAX_LINE_LENGTH) + MAX_LINE_SUFFIX : text;
      const size = Buffer.byteLength(line, "utf-8") + (raw.length > 0 ? 1 : 0);
      if (bytes + size > MAX_BYTES) {
        cut = true;
        more = true;
        break;
      }
      raw.push(line);
      bytes += size;
    }
  } finally {
    rl.close();
    stream.destroy();
  }
  return {
    raw,
    count,
    cut,
    more,
    offset: opts.offset
  };
}