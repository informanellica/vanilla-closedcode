function selection(selection) {
  if (!selection || typeof selection !== "object") return undefined;
  const startLine = Number(selection.startLine);
  const startChar = Number(selection.startChar);
  const endLine = Number(selection.endLine);
  const endChar = Number(selection.endChar);
  if (![startLine, startChar, endLine, endChar].every(Number.isFinite)) return undefined;
  return {
    startLine,
    startChar,
    endLine,
    endChar
  };
}
export function createCommentMetadata(input) {
  return {
    closedcodeComment: {
      path: input.path,
      selection: input.selection,
      comment: input.comment,
      preview: input.preview,
      origin: input.origin
    }
  };
}
export function readCommentMetadata(value) {
  if (!value || typeof value !== "object") return;
  const meta = value.closedcodeComment;
  if (!meta || typeof meta !== "object") return;
  const path = meta.path;
  const comment = meta.comment;
  if (typeof path !== "string" || typeof comment !== "string") return;
  const preview = meta.preview;
  const origin = meta.origin;
  return {
    path,
    selection: selection(meta.selection),
    comment,
    preview: typeof preview === "string" ? preview : undefined,
    origin: origin === "review" || origin === "file" ? origin : undefined
  };
}
export function formatCommentNote(input) {
  const start = input.selection ? Math.min(input.selection.startLine, input.selection.endLine) : undefined;
  const end = input.selection ? Math.max(input.selection.startLine, input.selection.endLine) : undefined;
  const range = start === undefined || end === undefined ? "this file" : start === end ? `line ${start}` : `lines ${start} through ${end}`;
  return `The user made the following comment regarding ${range} of ${input.path}: ${input.comment}`;
}
export function parseCommentNote(text) {
  const match = text.match(/^The user made the following comment regarding (this file|line (\d+)|lines (\d+) through (\d+)) of (.+?): ([\s\S]+)$/);
  if (!match) return;
  const start = match[2] ? Number(match[2]) : match[3] ? Number(match[3]) : undefined;
  const end = match[2] ? Number(match[2]) : match[4] ? Number(match[4]) : undefined;
  return {
    path: match[5],
    selection: start !== undefined && end !== undefined ? {
      startLine: start,
      startChar: 0,
      endLine: end,
      endChar: 0
    } : undefined,
    comment: match[6]
  };
}