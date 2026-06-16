/** @file `debug agent` CLI command: shows an agent's resolved configuration and tool set, and optionally executes a single tool with given params. */
import { EOL } from "os";
import { basename } from "path";
import { Effect } from "effect";
import { Agent } from "../../../agent/agent.js";
import { Provider } from "#provider/provider.js";
import { Session } from "#session/session.js";
import { MessageID, PartID } from "../../../session/schema.js";
import { ToolRegistry } from "#tool/registry.js";
import { Permission } from "../../../permission/index.js";
import { iife } from "../../../util/iife.js";
import { effectCmd, fail } from "../../effect-cmd.js";
import { InstanceRef } from "#effect/instance-ref.js";
/**
 * CLI command `agent <name>` that prints an agent's configuration (including its
 * resolved tool enablement) or, when `--tool` is given, executes that tool with
 * `--params` and prints the result.
 */
export const AgentCommand = effectCmd({
  command: "agent <name>",
  describe: "show agent configuration details",
  builder: yargs => yargs.positional("name", {
    type: "string",
    demandOption: true,
    description: "Agent name"
  }).option("tool", {
    type: "string",
    description: "Tool id to execute"
  }).option("params", {
    type: "string",
    description: "Tool params as JSON or a JS object literal"
  }),
  handler: Effect.fn("Cli.debug.agent")(function* (args) {
    const ctx = yield* InstanceRef;
    if (!ctx) return;
    return yield* run(args, ctx);
  })
});
/**
 * Resolves the named agent and either prints its config + resolved tools, or
 * runs a single tool against a debug session when `args.tool` is set.
 * @param {Object} args - Parsed CLI args (name, tool, params).
 * @param {Object} ctx - Instance context providing directory and worktree paths.
 * @returns {Effect} An Effect that writes output to stdout/stderr; fails with exit code 1 on missing/disabled agent or tool.
 */
const run = Effect.fn("Cli.debug.agent.body")(function* (args, ctx) {
  const agentName = args.name;
  const agent = yield* Agent.Service.use(svc => svc.get(agentName));
  if (!agent) {
    process.stderr.write(`Agent ${agentName} not found, run '${basename(process.execPath)} agent list' to get an agent list` + EOL);
    return yield* fail("", 1);
  }
  const availableTools = yield* getAvailableTools(agent);
  const resolvedTools = resolveTools(agent, availableTools);
  const toolID = args.tool;
  if (toolID) {
    const tool = availableTools.find(item => item.id === toolID);
    if (!tool) {
      process.stderr.write(`Tool ${toolID} not found for agent ${agentName}` + EOL);
      return yield* fail("", 1);
    }
    if (resolvedTools[toolID] === false) {
      process.stderr.write(`Tool ${toolID} is disabled for agent ${agentName}` + EOL);
      return yield* fail("", 1);
    }
    const params = parseToolParams(args.params);
    const toolCtx = yield* createToolContext(agent, ctx);
    const result = yield* tool.execute(params, toolCtx);
    process.stdout.write(JSON.stringify({
      tool: toolID,
      input: params,
      result
    }, null, 2) + EOL);
    return;
  }
  const output = {
    ...agent,
    tools: resolvedTools
  };
  process.stdout.write(JSON.stringify(output, null, 2) + EOL);
});
/**
 * Returns the list of tools available to the given agent, using the agent's
 * model (or the provider's default model) to query the tool registry.
 * @param {Agent} agent - The agent whose available tools are requested.
 * @returns {Effect} An Effect resolving to an array of tool definitions.
 */
const getAvailableTools = Effect.fn("Cli.debug.agent.getAvailableTools")(function* (agent) {
  const provider = yield* Provider.Service;
  const registry = yield* ToolRegistry.Service;
  const model = agent.model ?? (yield* provider.defaultModel());
  return yield* registry.tools({
    ...model,
    agent
  });
});
/**
 * Maps each available tool id to whether it is enabled for the agent, based on
 * the agent's permission ruleset.
 * @param {Agent} agent - The agent whose permissions decide tool enablement.
 * @param {Array} availableTools - The tools available to the agent.
 * @returns {Object} A record mapping tool id to a boolean (true = enabled).
 */
function resolveTools(agent, availableTools) {
  const disabled = Permission.disabled(availableTools.map(tool => tool.id), agent.permission);
  const resolved = {};
  for (const tool of availableTools) {
    resolved[tool.id] = !disabled.has(tool.id);
  }
  return resolved;
}
/**
 * Parses the `--params` CLI value into a plain object, accepting either JSON or
 * a JavaScript object literal. Returns an empty object for empty input.
 * @param {string} input - The raw params string from the CLI.
 * @returns {Object} The parsed params object.
 * @throws {Error} If the input cannot be parsed as JSON or a JS object literal, or does not evaluate to a plain object.
 */
function parseToolParams(input) {
  if (!input) return {};
  const trimmed = input.trim();
  if (trimmed.length === 0) return {};
  const parsed = iife(() => {
    try {
      return JSON.parse(trimmed);
    } catch (jsonError) {
      try {
        return new Function(`return (${trimmed})`)();
      } catch (evalError) {
        throw new Error(`Failed to parse --params. Use JSON or a JS object literal. JSON error: ${jsonError}. Eval error: ${evalError}.`, {
          cause: evalError
        });
      }
    }
  });
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Tool params must be an object.");
  }
  return parsed;
}
/**
 * Builds a tool execution context for a one-off debug tool run: creates a debug
 * session and assistant message, resolves the model, merges permission rules,
 * and returns the context object passed to `tool.execute`.
 * @param {Agent} agent - The agent on whose behalf the tool runs.
 * @param {Object} ctx - Instance context providing directory and worktree paths.
 * @returns {Effect} An Effect resolving to a tool context with sessionID, messageID, callID, agent, abort signal, and an `ask` permission gate.
 */
const createToolContext = Effect.fn("Cli.debug.agent.createToolContext")(function* (agent, ctx) {
  const sessionSvc = yield* Session.Service;
  const session = yield* sessionSvc.create({
    title: `Debug tool run (${agent.name})`
  });
  const messageID = MessageID.ascending();
  const model = agent.model ? agent.model : yield* Effect.gen(function* () {
    const provider = yield* Provider.Service;
    return yield* provider.defaultModel();
  });
  const now = Date.now();
  const message = {
    id: messageID,
    sessionID: session.id,
    role: "assistant",
    time: {
      created: now
    },
    parentID: messageID,
    modelID: model.modelID,
    providerID: model.providerID,
    mode: "debug",
    agent: agent.name,
    path: {
      cwd: ctx.directory,
      root: ctx.worktree
    },
    cost: 0,
    tokens: {
      input: 0,
      output: 0,
      reasoning: 0,
      cache: {
        read: 0,
        write: 0
      }
    }
  };
  yield* sessionSvc.updateMessage(message);
  const ruleset = Permission.merge(agent.permission, session.permission ?? []);
  return {
    sessionID: session.id,
    messageID,
    callID: PartID.ascending(),
    agent: agent.name,
    abort: new AbortController().signal,
    messages: [],
    metadata: () => Effect.void,
    ask(req) {
      return Effect.sync(() => {
        for (const pattern of req.patterns) {
          const rule = Permission.evaluate(req.permission, pattern, ruleset);
          if (rule.action === "deny") {
            throw new Permission.DeniedError({
              ruleset
            });
          }
        }
      });
    }
  };
});