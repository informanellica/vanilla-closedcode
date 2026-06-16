/** @file Effect Context reference holding the current working directory used when loading TUI config. */
import { Context } from "effect";
/**
 * Effect Context reference for the current working directory; defaults to process.cwd().
 * @type {Object}
 */
export const CurrentWorkingDirectory = Context.Reference("CurrentWorkingDirectory", {
  defaultValue: () => process.cwd()
});