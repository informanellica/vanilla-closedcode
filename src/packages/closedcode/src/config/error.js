/** @file Named error types raised when loading or validating configuration. */
export * as ConfigError from "./error.js";
import z from "zod";
import { NamedError } from "core/util/error";
/**
 * Error raised when a config file cannot be parsed as JSON/JSONC.
 * Payload carries the file `path` and an optional parser `message`.
 */
export const JsonError = NamedError.create("ConfigJsonError", z.object({
  path: z.string(),
  message: z.string().optional()
}));
/**
 * Error raised when a parsed config fails schema validation.
 * Payload carries the file `path`, optional validation `issues`, and an optional `message`.
 */
export const InvalidError = NamedError.create("ConfigInvalidError", z.object({
  path: z.string(),
  issues: z.custom().optional(),
  message: z.string().optional()
}));