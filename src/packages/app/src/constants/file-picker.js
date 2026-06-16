/** @file File-picker constants: accepted image/file MIME types and extensions, plus a Tauri-style filter builder. */

/** MIME types accepted for image attachments. */
export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
/** MIME types and file extensions accepted for any file attachment (images plus text/code formats). */
export const ACCEPTED_FILE_TYPES = [...ACCEPTED_IMAGE_TYPES, "application/pdf", "text/*", "application/json", "application/ld+json", "application/toml", "application/x-toml", "application/x-yaml", "application/xml", "application/yaml", ".c", ".cc", ".cjs", ".conf", ".cpp", ".css", ".csv", ".cts", ".env", ".go", ".gql", ".graphql", ".h", ".hh", ".hpp", ".htm", ".html", ".ini", ".java", ".js", ".json", ".jsx", ".log", ".md", ".mdx", ".mjs", ".mts", ".py", ".rb", ".rs", ".sass", ".scss", ".sh", ".sql", ".toml", ".ts", ".tsx", ".txt", ".xml", ".yaml", ".yml", ".zsh"];
const MIME_EXT = new Map([["image/png", "png"], ["image/jpeg", "jpg"], ["image/gif", "gif"], ["image/webp", "webp"], ["application/pdf", "pdf"], ["application/json", "json"], ["application/ld+json", "jsonld"], ["application/toml", "toml"], ["application/x-toml", "toml"], ["application/x-yaml", "yaml"], ["application/xml", "xml"], ["application/yaml", "yaml"]]);
const TEXT_EXT = ["txt", "text", "md", "markdown", "log", "csv"];
/** Sorted, de-duplicated list of bare file extensions derived from ACCEPTED_FILE_TYPES (MIME types and text/* expanded). */
export const ACCEPTED_FILE_EXTENSIONS = Array.from(new Set(ACCEPTED_FILE_TYPES.flatMap(item => {
  if (item.startsWith(".")) return [item.slice(1)];
  if (item === "text/*") return TEXT_EXT;
  const out = MIME_EXT.get(item);
  return out ? [out] : [];
}))).sort();
/**
 * Build a native file-dialog filter array (Tauri shape) from a list of extensions.
 * @param {Array} ext - Bare file extensions to allow.
 * @returns {Array} A single-entry filter array ([{name, extensions}]), or undefined when no extensions are given.
 */
export function filePickerFilters(ext) {
  if (!ext || ext.length === 0) return undefined;
  return [{
    name: "Files",
    extensions: ext
  }];
}