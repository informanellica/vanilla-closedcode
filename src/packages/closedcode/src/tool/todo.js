/** @file Defines the "todowrite" tool, which replaces the current session's structured todo list. */
import { assetText } from "#util/asset.js";
import { Effect, Schema } from "effect";
import * as Tool from "./tool.js";
const DESCRIPTION_WRITE = assetText("tool/todowrite.txt");
import { Todo } from "../session/todo.js";

// Todo.Info is still a zod schema (session/todo.ts). Inline the field shape
// here rather than referencing its `.shape` — the LLM-visible JSON Schema is
// identical, and it removes the last zod dependency from this tool.
/** Schema for a single todo item: content (description), status, and priority. */
const TodoItem = Schema.Struct({
  content: Schema.String.annotate({
    description: "Brief description of the task"
  }),
  status: Schema.String.annotate({
    description: "Current status of the task: pending, in_progress, completed, cancelled"
  }),
  priority: Schema.String.annotate({
    description: "Priority level of the task: high, medium, low"
  })
});
/** Schema for the todowrite tool parameters: the full updated array of todo items. */
export const Parameters = Schema.Struct({
  todos: Schema.mutable(Schema.Array(TodoItem)).annotate({
    description: "The updated todo list"
  })
});
/**
 * The "todowrite" tool. After requesting permission, replaces the current
 * session's todo list with the supplied array and returns a summary of the
 * remaining (non-completed) count plus the serialized list.
 */
export const TodoWriteTool = Tool.define("todowrite", Effect.gen(function* () {
  const todo = yield* Todo.Service;
  return {
    description: DESCRIPTION_WRITE,
    parameters: Parameters,
    execute: (params, ctx) => Effect.gen(function* () {
      yield* ctx.ask({
        permission: "todowrite",
        patterns: ["*"],
        always: ["*"],
        metadata: {}
      });
      yield* todo.update({
        sessionID: ctx.sessionID,
        todos: params.todos
      });
      return {
        title: `${params.todos.filter(x => x.status !== "completed").length} todos`,
        output: JSON.stringify(params.todos, null, 2),
        metadata: {
          todos: params.todos
        }
      };
    })
  };
}));