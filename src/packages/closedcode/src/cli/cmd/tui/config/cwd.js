import { Context } from "effect";
export const CurrentWorkingDirectory = Context.Reference("CurrentWorkingDirectory", {
  defaultValue: () => process.cwd()
});