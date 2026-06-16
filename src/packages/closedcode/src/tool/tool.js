/** @file Core tool plumbing: helpers to define a tool, wrap its execute() with argument decoding, output truncation, and tracing, and lazily initialize it. */
import { Effect, Schema } from "effect";
import * as Truncate from "./truncate.js";
import { Agent } from "#agent/agent.js";

// TODO: remove this hack

/**
 * Wraps a tool's resolved info so its execute() decodes/validates arguments
 * against the tool's parameter schema, applies output truncation (unless the
 * result already reports a truncation state), and records a tracing span.
 * @param {string} id - The tool identifier (used in error messages and span attributes).
 * @param {Object|Function} init - The resolved tool info, or a function returning it; either form provides parameters, execute, and optional formatValidationError.
 * @param {Object} truncate - The Truncate service used to cap oversized tool output and persist the full content to disk.
 * @param {Object} agents - The Agent service used to look up the current agent (to tailor the truncation hint).
 * @returns {Function} A zero-arg function that lazily produces the tool info with its execute() wrapped.
 */
function wrap(id, init, truncate, agents) {
  return () => Effect.gen(function* () {
    const toolInfo = typeof init === "function" ? {
      ...(yield* init())
    } : {
      ...init
    };
    // Compile the parser closure once per tool init; `decodeUnknownEffect`
    // allocates a new closure per call, so hoisting avoids re-closing it for
    // every LLM tool invocation.
    const decode = Schema.decodeUnknownEffect(toolInfo.parameters);
    const execute = toolInfo.execute;
    toolInfo.execute = (args, ctx) => {
      const attrs = {
        "tool.name": id,
        "session.id": ctx.sessionID,
        "message.id": ctx.messageID,
        ...(ctx.callID ? {
          "tool.call_id": ctx.callID
        } : {})
      };
      return Effect.gen(function* () {
        const decoded = yield* decode(args).pipe(Effect.mapError(error => toolInfo.formatValidationError ? new Error(toolInfo.formatValidationError(error), {
          cause: error
        }) : new Error(`The ${id} tool was called with invalid arguments: ${error}.\nPlease rewrite the input so it satisfies the expected schema.`, {
          cause: error
        })));
        const result = yield* execute(decoded, ctx);
        if (result.metadata.truncated !== undefined) {
          return result;
        }
        const agent = yield* agents.get(ctx.agent);
        const truncated = yield* truncate.output(result.output, {}, agent);
        return {
          ...result,
          output: truncated.content,
          metadata: {
            ...result.metadata,
            truncated: truncated.truncated,
            ...(truncated.truncated && {
              outputPath: truncated.outputPath
            })
          }
        };
      }).pipe(Effect.orDie, Effect.withSpan("Tool.execute", {
        attributes: attrs
      }));
    };
    return toolInfo;
  });
}
/**
 * Defines a tool. Returns an Effect (with an attached `id`) that resolves the
 * tool's setup, acquires the Truncate and Agent services, and yields a record
 * with the tool id plus a lazy `init` (the wrapped execute pipeline).
 * @param {string} id - The tool identifier.
 * @param {Effect} init - An Effect that resolves the tool's base info (description, parameters, execute).
 * @returns {Effect} An Effect yielding `{id, init}`, with `id` also attached to the Effect object itself.
 */
export function define(id, init) {
  return Object.assign(Effect.gen(function* () {
    const resolved = yield* init;
    const truncate = yield* Truncate.Service;
    const agents = yield* Agent.Service;
    return {
      id,
      init: wrap(id, resolved, truncate, agents)
    };
  }), {
    id
  });
}
/**
 * Initializes a defined tool, invoking its lazy `init` and merging the tool id
 * into the resulting info record.
 * @param {Object} info - A defined-tool record produced by define(), with `id` and an `init` factory.
 * @returns {Effect} An Effect yielding the fully initialized tool info including its id.
 */
export function init(info) {
  return Effect.gen(function* () {
    const init = yield* info.init();
    return {
      ...init,
      id: info.id
    };
  });
}
export * as Tool from "./tool.js";