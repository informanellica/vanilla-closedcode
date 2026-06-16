/** @file CLI presentation helpers: ANSI styles, stderr printing, the rendered logo, and prompts. */
import z from "zod";
import { EOL } from "os";
import { NamedError } from "core/util/error";
import { logo as glyphs } from "./logo.js";
// Plain (non-TTY) wordmark, derived from the same glyphs as the colored TTY logo
// so both stay in sync and follow the closedcode rebrand. Shadow markers collapse:
// `_`/`~`/`,` -> blank, `^` -> a top half-block.
/** Map of shadow markers to their plain-text replacement for the non-TTY wordmark. */
const __FLATTEN = { _: " ", "^": "▀", "~": " ", ",": " " };
/**
 * Flatten a glyph row by replacing shadow markers with their plain-text equivalents.
 * @param {string} s - A single glyph row.
 * @returns {string} The flattened row.
 */
const __flat = s => [...s].map(c => __FLATTEN[c] ?? c).join("");
/** Pre-rendered plain (non-TTY) wordmark rows for "closedcode". */
const wordmark = glyphs.left.map((row, i) => __flat(row) + " " + __flat(glyphs.right[i] ?? ""));
/** Error thrown when an interactive UI prompt is cancelled by the user. */
export const CancelledError = NamedError.create("UICancelledError", z.void());
/**
 * Named ANSI escape sequences for foreground colors and bold weights used across the CLI.
 * @type {Object}
 */
export const Style = {
  TEXT_HIGHLIGHT: "\x1b[96m",
  TEXT_HIGHLIGHT_BOLD: "\x1b[96m\x1b[1m",
  TEXT_DIM: "\x1b[90m",
  TEXT_DIM_BOLD: "\x1b[90m\x1b[1m",
  TEXT_NORMAL: "\x1b[0m",
  TEXT_NORMAL_BOLD: "\x1b[1m",
  TEXT_WARNING: "\x1b[93m",
  TEXT_WARNING_BOLD: "\x1b[93m\x1b[1m",
  TEXT_DANGER: "\x1b[91m",
  TEXT_DANGER_BOLD: "\x1b[91m\x1b[1m",
  TEXT_SUCCESS: "\x1b[92m",
  TEXT_SUCCESS_BOLD: "\x1b[92m\x1b[1m",
  TEXT_INFO: "\x1b[94m",
  TEXT_INFO_BOLD: "\x1b[94m\x1b[1m"
};
/**
 * Print the space-joined message parts to stderr followed by a line terminator.
 * @param {...*} message - Message parts to join with spaces and write.
 * @returns {void}
 */
export function println(...message) {
  print(...message);
  process.stderr.write(EOL);
}
/**
 * Print the space-joined message parts to stderr without a trailing newline.
 * @param {...*} message - Message parts to join with spaces and write.
 * @returns {void}
 */
export function print(...message) {
  blank = false;
  process.stderr.write(message.join(" "));
}
/** Tracks whether the last output was a blank line, to avoid emitting consecutive blanks. */
let blank = false;
/**
 * Print a single blank line, collapsing repeated calls so no more than one blank line is emitted.
 * @returns {void}
 */
export function empty() {
  if (blank) return;
  println("" + Style.TEXT_NORMAL);
  blank = true;
}
/**
 * Render the "closedcode" logo as a string: a colored block-glyph version on a TTY, or a plain
 * flattened wordmark when neither stdout nor stderr is a TTY.
 * @param {string} pad - Optional left-padding prepended to each rendered row.
 * @returns {string} The rendered logo with trailing whitespace trimmed.
 */
export function logo(pad) {
  if (!process.stdout.isTTY && !process.stderr.isTTY) {
    const result = [];
    for (const row of wordmark) {
      if (pad) result.push(pad);
      result.push(row);
      result.push(EOL);
    }
    return result.join("").trimEnd();
  }
  const result = [];
  const reset = "\x1b[0m";
  const left = {
    fg: "\x1b[90m",
    shadow: "\x1b[38;5;235m",
    bg: "\x1b[48;5;235m"
  };
  const right = {
    fg: reset,
    shadow: "\x1b[38;5;238m",
    bg: "\x1b[48;5;238m"
  };
  const gap = " ";
  /**
   * Render one glyph row into an ANSI-colored string, expanding shadow markers into the
   * appropriate background/foreground half-block escapes.
   * @param {string} line - A single glyph row (with shadow markers).
   * @param {string} fg - Foreground color escape for solid glyph cells.
   * @param {string} shadow - Color escape for `~` shadow cells.
   * @param {string} bg - Background color escape for `_`/`^` cells.
   * @returns {string} The colored row.
   */
  const draw = (line, fg, shadow, bg) => {
    const parts = [];
    for (const char of line) {
      if (char === "_") {
        parts.push(bg, " ", reset);
        continue;
      }
      if (char === "^") {
        parts.push(fg, bg, "▀", reset);
        continue;
      }
      if (char === "~") {
        parts.push(shadow, "▀", reset);
        continue;
      }
      if (char === " ") {
        parts.push(" ");
        continue;
      }
      parts.push(fg, char, reset);
    }
    return parts.join("");
  };
  glyphs.left.forEach((row, index) => {
    if (pad) result.push(pad);
    result.push(draw(row, left.fg, left.shadow, left.bg));
    result.push(gap);
    const other = glyphs.right[index] ?? "";
    result.push(draw(other, right.fg, right.shadow, right.bg));
    result.push(EOL);
  });
  return result.join("").trimEnd();
}
/**
 * Prompt the user on stdout and resolve with their trimmed line of input from stdin.
 * @param {string} prompt - The prompt text to display.
 * @returns {Promise<string>} The user's answer, trimmed of surrounding whitespace.
 */
export async function input(prompt) {
  const readline = require("readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(resolve => {
    rl.question(prompt, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}
/**
 * Print an error message to stderr with a bold red "Error:" prefix, stripping any redundant
 * leading "Error: " already present in the message.
 * @param {string} message - The error message to display.
 * @returns {void}
 */
export function error(message) {
  if (message.startsWith("Error: ")) {
    message = message.slice("Error: ".length);
  }
  println(Style.TEXT_DANGER_BOLD + "Error: " + Style.TEXT_NORMAL + message);
}
/**
 * Render markdown for terminal display. Currently a passthrough that returns the text unchanged.
 * @param {string} text - The markdown source text.
 * @returns {string} The text, returned as-is.
 */
export function markdown(text) {
  return text;
}
export * as UI from "./ui.js";