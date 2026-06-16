/**
 * @file Parsing helpers for markdown instruction files: extracts `@file`
 * references and `` !`shell` `` directives from templates and parses YAML
 * frontmatter (with a permissive fallback for malformed YAML).
 * @module closedcode/config/markdown
 */

import { NamedError } from "core/util/error";
import matter from "gray-matter";
import { z } from "zod";
import { Filesystem } from "#util/filesystem.js";

/** Matches `@path` file references in a template (not preceded by a word char or backtick). */
export const FILE_REGEX = /(?<![\w`])@(\.?[^\s`,.]*(?:\.[^\s`,.]+)*)/g;

/** Matches `` !`command` `` shell directives in a template. */
export const SHELL_REGEX = /!`([^`]+)`/g;

/**
 * Find all `@path` file references in a template.
 * @param {string} template - The template text to scan.
 * @returns {Array} An array of RegExp match objects, one per file reference.
 */
export function files(template) {
  return Array.from(template.matchAll(FILE_REGEX));
}

/**
 * Find all `` !`command` `` shell directives in a template.
 * @param {string} template - The template text to scan.
 * @returns {Array} An array of RegExp match objects, one per shell directive.
 */
export function shell(template) {
  return Array.from(template.matchAll(SHELL_REGEX));
}

// Some instruction files use invalid YAML in their frontmatter, so we need to
// fallback to a more permissive parser for those cases.
/**
 * Sanitize a document's YAML frontmatter so a stricter parser can read it.
 * Leaves comments, blank lines, indented continuations, empty/quoted/block-scalar
 * values untouched, and converts `key: value` pairs whose value contains a colon
 * into a block scalar (`key: |-`) so the inner colon does not break YAML parsing.
 * @param {string} content - The full document text (frontmatter plus body).
 * @returns {string} The document with its frontmatter sanitized, or the original
 *   content unchanged when no frontmatter block is present.
 */
export function fallbackSanitization(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return content;
  const frontmatter = match[1];
  const lines = frontmatter.split(/\r?\n/);
  const result = [];
  for (const line of lines) {
    // skip comments and empty lines
    if (line.trim().startsWith("#") || line.trim() === "") {
      result.push(line);
      continue;
    }

    // skip lines that are continuations (indented)
    if (line.match(/^\s+/)) {
      result.push(line);
      continue;
    }

    // match key: value pattern
    const kvMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/);
    if (!kvMatch) {
      result.push(line);
      continue;
    }
    const key = kvMatch[1];
    const value = kvMatch[2].trim();

    // skip if value is empty, already quoted, or uses block scalar
    if (value === "" || value === ">" || value === "|" || value.startsWith('"') || value.startsWith("'")) {
      result.push(line);
      continue;
    }

    // if value contains a colon, convert to block scalar
    if (value.includes(":")) {
      result.push(`${key}: |-`);
      result.push(`  ${value}`);
      continue;
    }
    result.push(line);
  }
  const processed = result.join("\n");
  return content.replace(frontmatter, () => processed);
}
/**
 * Read and parse a markdown instruction file, returning its frontmatter and body.
 * Attempts a strict parse first, then retries through {@link fallbackSanitization}
 * for files with malformed YAML frontmatter.
 * @param {string} filePath - Absolute path to the markdown file.
 * @returns {Promise<Object>} The parsed gray-matter result (`{ data, content, ... }`).
 * @throws {FrontmatterError} When the frontmatter cannot be parsed even after sanitization.
 */
export async function parse(filePath) {
  const template = await Filesystem.readText(filePath);
  try {
    const md = matter(template);
    return md;
  } catch {
    try {
      return matter(fallbackSanitization(template));
    } catch (err) {
      throw new FrontmatterError({
        path: filePath,
        message: `${filePath}: Failed to parse YAML frontmatter: ${err instanceof Error ? err.message : String(err)}`
      }, {
        cause: err
      });
    }
  }
}
/** Error thrown when a markdown file's YAML frontmatter cannot be parsed. */
export const FrontmatterError = NamedError.create("ConfigFrontmatterError", z.object({
  path: z.string(),
  message: z.string()
}));
export * as ConfigMarkdown from "./markdown.js";