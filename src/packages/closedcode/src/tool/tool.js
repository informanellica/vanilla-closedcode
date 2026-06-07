import { Effect, Schema } from "effect";
import * as Truncate from "./truncate.js";
import { Agent } from "@/agent/agent.js";

// TODO: remove this hack

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