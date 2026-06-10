import { assetText } from "#util/asset.js";
import { BusEvent } from "#bus/bus-event.js";
import { InstanceState } from "#effect/instance-state.js";
import { EffectBridge } from "#effect/bridge.js";
import { SessionID, MessageID } from "#session/schema.js";
import { Effect, Layer, Context, Schema } from "effect";
import z from "zod";
import { zod, ZodOverride } from "#util/effect-zod.js";
import { withStatics } from "#util/schema.js";
import { Config } from "#config/config.js";
import { MCP } from "../mcp/index.js";
import { Skill } from "../skill/index.js";
const PROMPT_INITIALIZE = assetText("command/template/initialize.txt");
const PROMPT_REVIEW = assetText("command/template/review.txt");
export const Event = {
  Executed: BusEvent.define("command.executed", Schema.Struct({
    name: Schema.String,
    sessionID: SessionID,
    arguments: Schema.String,
    messageID: MessageID
  }))
};
export const Info = Schema.Struct({
  name: Schema.String,
  description: Schema.optional(Schema.String),
  agent: Schema.optional(Schema.String),
  model: Schema.optional(Schema.String),
  source: Schema.optional(Schema.Literals(["command", "mcp", "skill"])),
  // Some command templates are lazy promises from MCP prompt resolution.
  template: Schema.Unknown.annotate({
    [ZodOverride]: z.promise(z.string()).or(z.string())
  }),
  subtask: Schema.optional(Schema.Boolean),
  hints: Schema.Array(Schema.String)
}).annotate({
  identifier: "Command"
}).pipe(withStatics(s => ({
  zod: zod(s)
})));

// for some reason zod is inferring `string` for z.promise(z.string()).or(z.string()) so we have to manually override it

export function hints(template) {
  const result = [];
  const numbered = template.match(/\$\d+/g);
  if (numbered) {
    for (const match of [...new Set(numbered)].sort()) result.push(match);
  }
  if (template.includes("$ARGUMENTS")) result.push("$ARGUMENTS");
  return result;
}
export const Default = {
  INIT: "init",
  REVIEW: "review"
};
export class Service extends Context.Service()("@closedcode/Command") {}
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const config = yield* Config.Service;
  const mcp = yield* MCP.Service;
  const skill = yield* Skill.Service;
  const init = Effect.fn("Command.state")(function* (ctx) {
    const cfg = yield* config.get();
    const bridge = yield* EffectBridge.make();
    const commands = {};
    commands[Default.INIT] = {
      name: Default.INIT,
      description: "guided AGENTS.md setup",
      source: "command",
      get template() {
        return PROMPT_INITIALIZE.replace("${path}", ctx.worktree);
      },
      hints: hints(PROMPT_INITIALIZE)
    };
    commands[Default.REVIEW] = {
      name: Default.REVIEW,
      description: "review changes [commit|branch|pr], defaults to uncommitted",
      source: "command",
      get template() {
        return PROMPT_REVIEW.replace("${path}", ctx.worktree);
      },
      subtask: true,
      hints: hints(PROMPT_REVIEW)
    };
    for (const [name, command] of Object.entries(cfg.command ?? {})) {
      commands[name] = {
        name,
        agent: command.agent,
        model: command.model,
        description: command.description,
        source: "command",
        get template() {
          return command.template;
        },
        subtask: command.subtask,
        hints: hints(command.template)
      };
    }
    for (const [name, prompt] of Object.entries(yield* mcp.prompts())) {
      commands[name] = {
        name,
        source: "mcp",
        description: prompt.description,
        get template() {
          return bridge.promise(mcp.getPrompt(prompt.client, prompt.name, prompt.arguments ? Object.fromEntries(prompt.arguments.map((argument, i) => [argument.name, `$${i + 1}`])) : {}).pipe(Effect.map(template => template?.messages.map(message => message.content.type === "text" ? message.content.text : "").join("\n") || "")));
        },
        hints: prompt.arguments?.map((_, i) => `$${i + 1}`) ?? []
      };
    }
    for (const item of yield* skill.all()) {
      if (commands[item.name]) continue;
      commands[item.name] = {
        name: item.name,
        description: item.description,
        source: "skill",
        get template() {
          return item.content;
        },
        hints: []
      };
    }
    return {
      commands
    };
  });
  const state = yield* InstanceState.make(ctx => init(ctx));
  const get = Effect.fn("Command.get")(function* (name) {
    const s = yield* InstanceState.get(state);
    return s.commands[name];
  });
  const list = Effect.fn("Command.list")(function* () {
    const s = yield* InstanceState.get(state);
    return Object.values(s.commands);
  });
  return Service.of({
    get,
    list
  });
}));
export const defaultLayer = layer.pipe(Layer.provide(Config.defaultLayer), Layer.provide(MCP.defaultLayer), Layer.provide(Skill.defaultLayer));
export * as Command from "./index.js";