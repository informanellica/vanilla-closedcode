/** @file Assembles a prompt (text, file/agent mentions, context items, images) into the message parts sent to the session, plus optimistic parts for the UI. */
import { getFilename } from "core/util/path";
import { encodeFilePath } from "@/context/file/path.js";
import { Identifier } from "@/utils/id.js";
import { createCommentMetadata, formatCommentNote } from "@/utils/comment-note.js";

/**
 * Resolve a possibly-relative path against the session directory, leaving absolute/UNC/Windows-drive paths untouched.
 * @param {string} directory - The session base directory.
 * @param {string} path - A relative or absolute file path.
 * @returns {string} The absolute path.
 */
const absolute = (directory, path) => {
  if (path.startsWith("/")) return path;
  if (/^[A-Za-z]:[\\/]/.test(path) || /^[A-Za-z]:$/.test(path)) return path;
  if (path.startsWith("\\\\") || path.startsWith("//")) return path;
  return `${directory.replace(/[\\/]+$/, "")}/${path}`;
};
/**
 * Build the query string that encodes a line-range selection on a file URL.
 * @param {Object} selection - A selection with `startLine` and `endLine`, or null/undefined for none.
 * @returns {string} The query string (e.g. "?start=1&end=5"), or an empty string when no selection.
 */
const fileQuery = selection => selection ? `?start=${selection.startLine}&end=${selection.endLine}` : "";

/**
 * Matches @path mentions, allowing a leading boundary character.
 * @type {RegExp}
 */
const mention = /(^|[\s([{"'])@(\S+)/g;

/**
 * Extract @-mentioned file paths from a comment string, trimming trailing punctuation.
 * @param {string} comment - The comment text to scan.
 * @returns {Array} The mentioned paths (strings).
 */
const parseCommentMentions = comment => {
  return Array.from(comment.matchAll(mention)).flatMap(match => {
    const path = (match[2] ?? "").replace(/[.,!?;:)}\]"']+$/, "");
    if (!path) return [];
    return [path];
  });
};
/**
 * Predicate: whether a prompt part is a file attachment.
 * @param {Object} part - A prompt part.
 * @returns {boolean} True when the part is of type "file".
 */
const isFileAttachment = part => part.type === "file";

/**
 * Predicate: whether a prompt part is an agent mention.
 * @param {Object} part - A prompt part.
 * @returns {boolean} True when the part is of type "agent".
 */
const isAgentAttachment = part => part.type === "agent";

/**
 * Convert a built request part into its optimistic equivalent, stamped with session and message IDs for immediate rendering.
 * @param {Object} part - A request part (text, file or agent).
 * @param {string} sessionID - The owning session id.
 * @param {string} messageID - The owning message id.
 * @returns {Object} The optimistic part.
 */
const toOptimisticPart = (part, sessionID, messageID) => {
  if (part.type === "text") {
    return {
      id: part.id,
      type: "text",
      text: part.text,
      synthetic: part.synthetic,
      ignored: part.ignored,
      time: part.time,
      metadata: part.metadata,
      sessionID,
      messageID
    };
  }
  if (part.type === "file") {
    return {
      id: part.id,
      type: "file",
      mime: part.mime,
      filename: part.filename,
      url: part.url,
      source: part.source,
      sessionID,
      messageID
    };
  }
  return {
    id: part.id,
    type: "agent",
    name: part.name,
    source: part.source,
    sessionID,
    messageID
  };
};
/**
 * Build the request parts for a prompt submission (leading text, file/agent mentions, comment context with their mentioned files, and image attachments), de-duplicating file URLs.
 * @param {Object} input - Submission inputs: `text` (string), `prompt` (Array of prompt parts), `context` (Array of context items), `images` (Array of image attachments), `sessionDirectory` (string), `sessionID` (string) and `messageID` (string).
 * @returns {Object} An object with `requestParts` (parts to send) and `optimisticParts` (parts for immediate UI rendering).
 */
export function buildRequestParts(input) {
  const requestParts = [{
    id: Identifier.ascending("part"),
    type: "text",
    text: input.text
  }];
  const files = input.prompt.filter(isFileAttachment).map(attachment => {
    const path = absolute(input.sessionDirectory, attachment.path);
    return {
      id: Identifier.ascending("part"),
      type: "file",
      mime: "text/plain",
      url: `file://${encodeFilePath(path)}${fileQuery(attachment.selection)}`,
      filename: getFilename(attachment.path),
      source: {
        type: "file",
        text: {
          value: attachment.content,
          start: attachment.start,
          end: attachment.end
        },
        path
      }
    };
  });
  const agents = input.prompt.filter(isAgentAttachment).map(attachment => {
    return {
      id: Identifier.ascending("part"),
      type: "agent",
      name: attachment.name,
      source: {
        value: attachment.content,
        start: attachment.start,
        end: attachment.end
      }
    };
  });
  const used = new Set(files.map(part => part.url));
  const context = input.context.flatMap(item => {
    const path = absolute(input.sessionDirectory, item.path);
    const url = `file://${encodeFilePath(path)}${fileQuery(item.selection)}`;
    const comment = item.comment?.trim();
    if (!comment && used.has(url)) return [];
    used.add(url);
    const filePart = {
      id: Identifier.ascending("part"),
      type: "file",
      mime: "text/plain",
      url,
      filename: getFilename(item.path)
    };
    if (!comment) return [filePart];
    const mentions = parseCommentMentions(comment).flatMap(path => {
      const url = `file://${encodeFilePath(absolute(input.sessionDirectory, path))}`;
      if (used.has(url)) return [];
      used.add(url);
      return [{
        id: Identifier.ascending("part"),
        type: "file",
        mime: "text/plain",
        url,
        filename: getFilename(path)
      }];
    });
    return [{
      id: Identifier.ascending("part"),
      type: "text",
      text: formatCommentNote({
        path: item.path,
        selection: item.selection,
        comment
      }),
      synthetic: true,
      metadata: createCommentMetadata({
        path: item.path,
        selection: item.selection,
        comment,
        preview: item.preview,
        origin: item.commentOrigin
      })
    }, filePart, ...mentions];
  });
  const images = input.images.map(attachment => {
    return {
      id: Identifier.ascending("part"),
      type: "file",
      mime: attachment.mime,
      url: attachment.dataUrl,
      filename: attachment.filename
    };
  });
  requestParts.push(...files, ...context, ...agents, ...images);
  return {
    requestParts,
    optimisticParts: requestParts.map(part => toOptimisticPart(part, input.sessionID, input.messageID))
  };
}