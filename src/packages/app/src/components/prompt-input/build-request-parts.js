import { getFilename } from "core/util/path";
import { encodeFilePath } from "@/context/file/path.js";
import { Identifier } from "@/utils/id.js";
import { createCommentMetadata, formatCommentNote } from "@/utils/comment-note.js";
const absolute = (directory, path) => {
  if (path.startsWith("/")) return path;
  if (/^[A-Za-z]:[\\/]/.test(path) || /^[A-Za-z]:$/.test(path)) return path;
  if (path.startsWith("\\\\") || path.startsWith("//")) return path;
  return `${directory.replace(/[\\/]+$/, "")}/${path}`;
};
const fileQuery = selection => selection ? `?start=${selection.startLine}&end=${selection.endLine}` : "";
const mention = /(^|[\s([{"'])@(\S+)/g;
const parseCommentMentions = comment => {
  return Array.from(comment.matchAll(mention)).flatMap(match => {
    const path = (match[2] ?? "").replace(/[.,!?;:)}\]"']+$/, "");
    if (!path) return [];
    return [path];
  });
};
const isFileAttachment = part => part.type === "file";
const isAgentAttachment = part => part.type === "agent";
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