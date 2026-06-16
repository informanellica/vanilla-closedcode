/** @file Placeholder "invalid" tool: surfaces a validation error back to the model when it calls a tool with arguments that failed schema validation. */
import { Effect, Schema } from "effect";
import * as Tool from "./tool.js";
/**
 * Parameter schema for the invalid tool: the offending tool name and the validation error message.
 */
export const Parameters = Schema.Struct({
  tool: Schema.String,
  error: Schema.String
});
/**
 * The "invalid" tool. It is never meant to be invoked deliberately ("Do not use"); it merely
 * echoes back the validation error describing why a previous tool call's arguments were rejected.
 */
export const InvalidTool = Tool.define("invalid", Effect.succeed({
  description: "Do not use",
  parameters: Parameters,
  execute: params => Effect.succeed({
    title: "Invalid Tool",
    output: `The arguments provided to the tool are invalid: ${params.error}`,
    metadata: {}
  })
}));