/** @file Helpers for classifying attachment MIME types and sniffing media file signatures. */

/**
 * Test whether a byte sequence begins with the given prefix bytes.
 * @param {Uint8Array|Array<number>} bytes - The byte sequence to inspect.
 * @param {Array<number>} prefix - The expected leading byte values.
 * @returns {boolean} True if every prefix byte matches the start of `bytes`.
 */
const startsWith = (bytes, prefix) => prefix.every((value, index) => bytes[index] === value);
/**
 * Test whether a MIME type denotes a PDF attachment.
 * @param {string} mime - The MIME type.
 * @returns {boolean} True if the MIME type is "application/pdf".
 */
export function isPdfAttachment(mime) {
  return mime === "application/pdf";
}
/**
 * Test whether a MIME type denotes media (an image or a PDF).
 * @param {string} mime - The MIME type.
 * @returns {boolean} True for image/* types or PDFs.
 */
export function isMedia(mime) {
  return mime.startsWith("image/") || isPdfAttachment(mime);
}
/**
 * Test whether a MIME type denotes a raster/displayable image attachment,
 * excluding SVG and FastBidSheet which are not treated as image attachments.
 * @param {string} mime - The MIME type.
 * @returns {boolean} True for image/* types other than svg+xml and vnd.fastbidsheet.
 */
export function isImageAttachment(mime) {
  return mime.startsWith("image/") && mime !== "image/svg+xml" && mime !== "image/vnd.fastbidsheet";
}
/**
 * Detect an attachment's MIME type from its leading magic bytes.
 * Recognizes PNG, JPEG, GIF, BMP, PDF, and WEBP; otherwise returns the fallback.
 * @param {Uint8Array} bytes - The raw bytes of the file.
 * @param {string} fallback - The MIME type to return when no signature matches.
 * @returns {string} The detected MIME type, or `fallback`.
 */
export function sniffAttachmentMime(bytes, fallback) {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (startsWith(bytes, [0x42, 0x4d])) return "image/bmp";
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes.subarray(8), [0x57, 0x45, 0x42, 0x50])) {
    return "image/webp";
  }
  return fallback;
}