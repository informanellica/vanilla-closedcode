export * as ConfigError from "./error.js";
import z from "zod";
import { NamedError } from "core/util/error";
export const JsonError = NamedError.create("ConfigJsonError", z.object({
  path: z.string(),
  message: z.string().optional()
}));
export const InvalidError = NamedError.create("ConfigInvalidError", z.object({
  path: z.string(),
  issues: z.custom().optional(),
  message: z.string().optional()
}));