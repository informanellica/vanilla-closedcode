/** @file Plugin tool helper: an identity wrapper for defining tools, exposing zod as `tool.schema` for declaring input schemas. */
import { z } from "zod";
/**
 * Identity helper for declaring a plugin tool definition.
 * Returns the given input unchanged; it exists to provide typed authoring
 * ergonomics and to attach the zod schema namespace via `tool.schema`.
 * @param {*} input - The tool definition object to pass through.
 * @returns {*} The same `input` value, unchanged.
 */
export function tool(input) {
  return input;
}
tool.schema = z;