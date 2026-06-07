import { Effect, Schema } from "effect";
import * as Tool from "./tool.js";
export const Parameters = Schema.Struct({
  tool: Schema.String,
  error: Schema.String
});
export const InvalidTool = Tool.define("invalid", Effect.succeed({
  description: "Do not use",
  parameters: Parameters,
  execute: params => Effect.succeed({
    title: "Invalid Tool",
    output: `The arguments provided to the tool are invalid: ${params.error}`,
    metadata: {}
  })
}));