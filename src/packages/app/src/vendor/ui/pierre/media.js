/** @file Utilities for detecting and converting media (image, SVG, audio) file content into data URLs for preview rendering. */
const imageExtensions = new Set(["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "ico", "tif", "tiff", "heic"]);
const audioExtensions = new Set(["mp3", "wav", "ogg", "m4a", "aac", "flac", "opus"]);
/**
 * Narrow a value to a media record object, rejecting null and non-objects.
 * @param {*} value - The candidate value.
 * @returns {Object} The value when it is a non-null object, otherwise undefined.
 */
function mediaRecord(value) {
  if (!value || typeof value !== "object") return;
  return value;
}
/**
 * Normalize a MIME type string: strip parameters, lowercase, and canonicalize known audio aliases.
 * @param {string} type - The raw MIME type (may include parameters like "; charset=...").
 * @returns {string} The normalized MIME type, or undefined when the input is empty/blank.
 */
export function normalizeMimeType(type) {
  if (!type) return;
  const mime = type.split(";", 1)[0]?.trim().toLowerCase();
  if (!mime) return;
  if (mime === "audio/x-aac") return "audio/aac";
  if (mime === "audio/x-m4a") return "audio/mp4";
  return mime;
}
/**
 * Extract the lowercased file extension from a path.
 * @param {string} path - The file path or name.
 * @returns {string} The extension without the dot, or an empty string when there is none.
 */
export function fileExtension(path) {
  if (!path) return "";
  const idx = path.lastIndexOf(".");
  if (idx === -1) return "";
  return path.slice(idx + 1).toLowerCase();
}
/**
 * Classify a file path into a media kind based on its extension.
 * @param {string} path - The file path or name.
 * @returns {string} "svg", "image", or "audio", or undefined when the extension is not a recognized media type.
 */
export function mediaKindFromPath(path) {
  const ext = fileExtension(path);
  if (ext === "svg") return "svg";
  if (imageExtensions.has(ext)) return "image";
  if (audioExtensions.has(ext)) return "audio";
}
/**
 * Check whether a media value represents binary content.
 * @param {*} value - The media value or record.
 * @returns {boolean} True when the record's type is "binary".
 */
export function isBinaryContent(value) {
  return mediaRecord(value)?.type === "binary";
}
/**
 * Validate a raw data URL string against an expected media kind, canonicalizing known audio MIME aliases.
 * @param {string} value - A data: URL string.
 * @param {string} kind - The expected kind ("svg", "image", or audio when omitted/other).
 * @returns {string} The (possibly rewritten) data URL when it matches the kind, otherwise undefined.
 */
function validDataUrl(value, kind) {
  if (kind === "svg") return value.startsWith("data:image/svg+xml") ? value : undefined;
  if (kind === "image") return value.startsWith("data:image/") ? value : undefined;
  if (value.startsWith("data:audio/x-aac;")) return value.replace("data:audio/x-aac;", "data:audio/aac;");
  if (value.startsWith("data:audio/x-m4a;")) return value.replace("data:audio/x-m4a;", "data:audio/mp4;");
  if (value.startsWith("data:audio/")) return value;
}
/**
 * Build a data URL from a media value, accepting either a ready-made data URL string or a record with content/mimeType/encoding.
 * Enforces that the record's MIME type matches the requested kind and (except SVG) requires base64 encoding.
 * @param {string|Object} value - A data URL string, or a media record with `content`, `mimeType`, and `encoding` fields.
 * @param {string} kind - The expected media kind ("svg", "image", or "audio").
 * @returns {string} A usable data URL, or undefined when the value is missing or does not match the kind/encoding requirements.
 */
export function dataUrlFromMediaValue(value, kind) {
  if (!value) return;
  if (typeof value === "string") {
    return validDataUrl(value, kind);
  }
  const record = mediaRecord(value);
  if (!record) return;
  if (typeof record.content !== "string") return;
  const mime = normalizeMimeType(typeof record.mimeType === "string" ? record.mimeType : undefined);
  if (!mime) return;
  if (kind === "svg") {
    if (mime !== "image/svg+xml") return;
    if (record.encoding === "base64") return `data:image/svg+xml;base64,${record.content}`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(record.content)}`;
  }
  if (kind === "image" && !mime.startsWith("image/")) return;
  if (kind === "audio" && !mime.startsWith("audio/")) return;
  if (record.encoding !== "base64") return;
  return `data:${mime};base64,${record.content}`;
}
/**
 * Decode a base64 string into a UTF-8 text string, using TextDecoder when available.
 * @param {string} value - The base64-encoded payload.
 * @returns {string} The decoded text, or undefined when atob is unavailable or decoding fails.
 */
function decodeBase64Utf8(value) {
  if (typeof atob !== "function") return;
  try {
    const raw = atob(value);
    const bytes = Uint8Array.from(raw, x => x.charCodeAt(0));
    if (typeof TextDecoder === "function") return new TextDecoder().decode(bytes);
    return raw;
  } catch {}
}
/**
 * Extract raw SVG markup from a media record, decoding base64 content when needed.
 * @param {Object} value - A media record with `content`, `mimeType`, and optional `encoding`.
 * @returns {string} The SVG text, or undefined when the record is not an SVG or has no string content.
 */
export function svgTextFromValue(value) {
  const record = mediaRecord(value);
  if (!record) return;
  if (typeof record.content !== "string") return;
  const mime = normalizeMimeType(typeof record.mimeType === "string" ? record.mimeType : undefined);
  if (mime !== "image/svg+xml") return;
  if (record.encoding === "base64") return decodeBase64Utf8(record.content);
  return record.content;
}
/**
 * Determine whether a media value carries any non-empty content.
 * @param {string|Object} value - A string payload or a media record with a `content` field.
 * @returns {boolean} True when the string is non-empty or the record holds non-empty string content.
 */
export function hasMediaValue(value) {
  if (typeof value === "string") return value.length > 0;
  const record = mediaRecord(value);
  if (!record) return false;
  return typeof record.content === "string" && record.content.length > 0;
}