/** @file Example plugin that registers a single custom tool ("mytool") demonstrating the tool API. */
import { tool } from "./tool.js";
/**
 * Example plugin exposing one custom tool ("mytool") that greets the provided argument.
 * @param {Object} _ctx - Plugin context (unused in this example).
 * @returns {Promise<Object>} A promise resolving to the plugin's hooks, including a tool map.
 */
export const ExamplePlugin = async _ctx => {
  return {
    tool: {
      mytool: tool({
        description: "This is a custom tool",
        args: {
          foo: tool.schema.string().describe("foo")
        },
        async execute(args) {
          return `Hello ${args.foo}!`;
        }
      })
    }
  };
};