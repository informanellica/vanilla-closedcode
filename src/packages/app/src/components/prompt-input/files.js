/** @file Detects the attachment MIME type for files dropped/pasted into the prompt input, mapping recognized images, PDFs, and text-like content to a canonical type. */
import { ACCEPTED_FILE_TYPES, ACCEPTED_IMAGE_TYPES } from "@/constants/file-picker.js";
export { ACCEPTED_FILE_TYPES };
const IMAGE_MIMES = new Set(ACCEPTED_IMAGE_TYPES);
const IMAGE_EXTS = new Map([["gif", "image/gif"], ["jpeg", "image/jpeg"], ["jpg", "image/jpeg"], ["png", "image/png"], ["webp", "image/webp"]]);
const TEXT_MIMES = new Set(["application/json", "application/ld+json", "application/toml", "application/x-toml", "application/x-yaml", "application/xml", "application/yaml"]);
const SAMPLE = 4096;
/**
 * Extract the bare MIME essence from a content type, stripping any parameters (e.g. charset).
 * @param {string} type - A MIME type string, possibly with parameters after ";".
 * @returns {string} The lowercased, trimmed MIME type without parameters, or "" if absent.
 */
function kind(type) {
  return type.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}
/**
 * Extract the lowercased file extension (without the dot) from a filename.
 * @param {string} name - The filename to inspect.
 * @returns {string} The extension without the leading dot, or "" if there is none.
 */
function ext(name) {
  const idx = name.lastIndexOf(".");
  if (idx === -1) return "";
  return name.slice(idx + 1).toLowerCase();
}
/**
 * Decide whether a MIME type denotes textual content (text/*, known text MIMEs, or +json/+xml suffixes).
 * @param {string} type - The bare MIME type to classify.
 * @returns {boolean} True if the type represents text-like content.
 */
function textMime(type) {
  if (!type) return false;
  if (type.startsWith("text/")) return true;
  if (TEXT_MIMES.has(type)) return true;
  if (type.endsWith("+json")) return true;
  return type.endsWith("+xml");
}
/**
 * Heuristically decide whether a byte sample looks like text (no NUL bytes and few control characters).
 * @param {Uint8Array} bytes - A sample of the file's leading bytes.
 * @returns {boolean} True if the sample appears to be text rather than binary.
 */
function textBytes(bytes) {
  if (bytes.length === 0) return true;
  let count = 0;
  for (const byte of bytes) {
    if (byte === 0) return false;
    if (byte < 9 || byte > 13 && byte < 32) count += 1;
  }
  return count / bytes.length <= 0.3;
}
/**
 * Determine the canonical attachment MIME type for a file, using its declared type,
 * extension fallback, and (for ambiguous cases) a sniff of its leading bytes.
 * @param {File} file - The file to classify.
 * @returns {Promise<string>} Resolves to the canonical MIME type (image/*, application/pdf, or "text/plain"), or undefined if the file is treated as unsupported binary.
 */
export async function attachmentMime(file) {
  const type = kind(file.type);
  if (IMAGE_MIMES.has(type)) return type;
  if (type === "application/pdf") return type;
  const suffix = ext(file.name);
  const fallback = IMAGE_EXTS.get(suffix) ?? (suffix === "pdf" ? "application/pdf" : undefined);
  if ((!type || type === "application/octet-stream") && fallback) return fallback;
  if (textMime(type)) return "text/plain";
  const bytes = new Uint8Array(await file.slice(0, SAMPLE).arrayBuffer());
  if (!textBytes(bytes)) return;
  return "text/plain";
}