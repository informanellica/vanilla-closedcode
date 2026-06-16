/** @file Build, read, format and parse user code-comment metadata and notes. */
/**
 * Validate and normalize a raw selection object into a numeric line/char range.
 * @param {Object} selection - The raw selection with startLine, startChar, endLine, endChar.
 * @returns {Object} A normalized selection object, or undefined when invalid.
 */
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
/**
 * Wrap comment fields into a closedcodeComment metadata envelope.
 * @param {Object} input - The comment fields.
 * @param {string} input.path - The file path the comment refers to.
 * @param {Object} input.selection - The selected range, if any.
 * @param {string} input.comment - The comment text.
 * @param {string} input.preview - An optional preview of the selected content.
 * @param {string} input.origin - Where the comment originated (e.g. "review" or "file").
 * @returns {Object} A metadata object with a closedcodeComment property.
 */
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
/**
 * Read and validate a closedcodeComment metadata envelope back into comment fields.
 * @param {Object} value - A metadata object that may contain a closedcodeComment property.
 * @returns {Object} The validated comment fields, or undefined when missing or malformed.
 */
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
/**
 * Render a comment into a human-readable note sentence describing its file and line range.
 * @param {Object} input - The comment fields.
 * @param {string} input.path - The file path the comment refers to.
 * @param {Object} input.selection - The selected range, if any; omitted means the whole file.
 * @param {string} input.comment - The comment text.
 * @returns {string} A formatted note sentence.
 */
export function formatCommentNote(input) {
  const start = input.selection ? Math.min(input.selection.startLine, input.selection.endLine) : undefined;
  const end = input.selection ? Math.max(input.selection.startLine, input.selection.endLine) : undefined;
  const range = start === undefined || end === undefined ? "this file" : start === end ? `line ${start}` : `lines ${start} through ${end}`;
  return `The user made the following comment regarding ${range} of ${input.path}: ${input.comment}`;
}
/**
 * Parse a formatted comment note sentence back into its path, selection and comment.
 * @param {string} text - The note text produced by formatCommentNote.
 * @returns {Object} The extracted comment fields, or undefined when the text does not match.
 */
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