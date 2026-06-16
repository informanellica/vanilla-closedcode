/** @file File-path normalization helpers: strip file:// URLs, query/hash, git-quoting, and encode/decode paths (Windows-aware). */
/**
 * Remove a leading `file://` protocol prefix from a path string.
 * @param {string} input - Path or file URL.
 * @returns {string} The path with any `file://` prefix removed.
 */
export function stripFileProtocol(input) {
  if (!input.startsWith("file://")) return input;
  return input.slice("file://".length);
}
/**
 * Truncate a string at the first `#` or `?`, removing any URL query string and fragment.
 * @param {string} input - Path or URL string.
 * @returns {string} The substring before the earliest query/hash delimiter.
 */
export function stripQueryAndHash(input) {
  const hashIndex = input.indexOf("#");
  const queryIndex = input.indexOf("?");
  if (hashIndex !== -1 && queryIndex !== -1) {
    return input.slice(0, Math.min(hashIndex, queryIndex));
  }
  if (hashIndex !== -1) return input.slice(0, hashIndex);
  if (queryIndex !== -1) return input.slice(0, queryIndex);
  return input;
}
/**
 * Decode a git-quoted path (double-quoted with C-style and octal escapes) back to a UTF-8 string.
 * Returns the input unchanged when it is not a quoted git path.
 * @param {string} input - Possibly git-quoted path string.
 * @returns {string} The decoded path.
 */
export function unquoteGitPath(input) {
  if (!input.startsWith('"')) return input;
  if (!input.endsWith('"')) return input;
  const body = input.slice(1, -1);
  const bytes = [];
  for (let i = 0; i < body.length; i++) {
    const char = body[i];
    if (char !== "\\") {
      bytes.push(char.charCodeAt(0));
      continue;
    }
    const next = body[i + 1];
    if (!next) {
      bytes.push("\\".charCodeAt(0));
      continue;
    }
    if (next >= "0" && next <= "7") {
      const chunk = body.slice(i + 1, i + 4);
      const match = chunk.match(/^[0-7]{1,3}/);
      if (!match) {
        bytes.push(next.charCodeAt(0));
        i++;
        continue;
      }
      bytes.push(parseInt(match[0], 8));
      i += match[0].length;
      continue;
    }
    const escaped = next === "n" ? "\n" : next === "r" ? "\r" : next === "t" ? "\t" : next === "b" ? "\b" : next === "f" ? "\f" : next === "v" ? "\v" : next === "\\" || next === '"' ? next : undefined;
    bytes.push((escaped ?? next).charCodeAt(0));
    i++;
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}
/**
 * URI-decode a file path, returning the original string if decoding throws.
 * @param {string} input - Percent-encoded path string.
 * @returns {string} The decoded path, or the input unchanged on malformed encoding.
 */
export function decodeFilePath(input) {
  try {
    return decodeURIComponent(input);
  } catch {
    return input;
  }
}
/**
 * Encode a filesystem path into a URI-safe path for use in a `file://` URL.
 * Normalizes Windows backslashes and drive letters and percent-encodes each segment
 * while preserving forward slashes and the drive-letter colon.
 * @param {string} filepath - Native filesystem path.
 * @returns {string} Encoded path suitable for embedding in a file URL.
 */
export function encodeFilePath(filepath) {
  // Normalize Windows paths: convert backslashes to forward slashes
  let normalized = filepath.replace(/\\/g, "/");

  // Handle Windows absolute paths (D:/path -> /D:/path for proper file:// URLs)
  if (/^[A-Za-z]:/.test(normalized)) {
    normalized = "/" + normalized;
  }

  // Encode each path segment (preserving forward slashes as path separators)
  // Keep the colon in Windows drive letters (`/C:/...`) so downstream file URL parsers
  // can reliably detect drives.
  return normalized.split("/").map((segment, index) => {
    if (index === 1 && /^[A-Za-z]:$/.test(segment)) return segment;
    return encodeURIComponent(segment);
  }).join("/");
}
/**
 * Build a set of path helpers bound to a workspace root scope.
 * @param {Function} scope - Getter returning the current workspace root directory string.
 * @returns {Object} Helpers `{normalize, tab, pathFromTab, normalizeDir}` for converting paths relative to the root.
 */
export function createPathHelpers(scope) {
  /**
   * Normalize an input path to a root-relative path, stripping file://, query/hash, git-quoting,
   * the workspace-root prefix (separator-agnostic; case-insensitive on Windows), and leading `./` or separators.
   * @param {string} input - Raw path or file URL.
   * @returns {string} Root-relative normalized path.
   */
  const normalize = input => {
    const root = scope();
    let path = unquoteGitPath(decodeFilePath(stripQueryAndHash(stripFileProtocol(input))));

    // Separator-agnostic prefix stripping for Cygwin/native Windows compatibility
    // Only case-insensitive on Windows (drive letter or UNC paths)
    const windows = /^[A-Za-z]:/.test(root) || root.startsWith("\\\\");
    const canonRoot = windows ? root.replace(/\\/g, "/").toLowerCase() : root.replace(/\\/g, "/");
    const canonPath = windows ? path.replace(/\\/g, "/").toLowerCase() : path.replace(/\\/g, "/");
    if (canonPath.startsWith(canonRoot) && (canonRoot.endsWith("/") || canonPath === canonRoot || canonPath[canonRoot.length] === "/")) {
      // Slice from original path to preserve native separators
      path = path.slice(root.length);
    }
    if (path.startsWith("./") || path.startsWith(".\\")) {
      path = path.slice(2);
    }
    if (path.startsWith("/") || path.startsWith("\\")) {
      path = path.slice(1);
    }
    return path;
  };
  /**
   * Convert an input path into a normalized `file://` tab identifier.
   * @param {string} input - Raw path or file URL.
   * @returns {string} A `file://`-prefixed, encoded tab value.
   */
  const tab = input => {
    const path = normalize(input);
    return `file://${encodeFilePath(path)}`;
  };
  /**
   * Convert a `file://` tab identifier back to a normalized root-relative path.
   * @param {string} tabValue - Tab identifier.
   * @returns {string} The normalized path, or undefined if the value is not a file tab.
   */
  const pathFromTab = tabValue => {
    if (!tabValue.startsWith("file://")) return;
    return normalize(tabValue);
  };
  /**
   * Normalize a directory path, also stripping trailing slashes.
   * @param {string} input - Raw directory path or file URL.
   * @returns {string} Root-relative directory path without a trailing separator.
   */
  const normalizeDir = input => normalize(input).replace(/\/+$/, "");
  return {
    normalize,
    tab,
    pathFromTab,
    normalizeDir
  };
}