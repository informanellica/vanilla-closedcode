import { Context, Effect, Layer } from "effect";
import { InstanceState } from "@/effect/instance-state.js";
import PROMPT_DEFAULT from "./prompt/default.txt";
import PROMPT_KIMI from "./prompt/kimi.txt";
import PROMPT_TRINITY from "./prompt/trinity.txt";
import { Permission } from "@/permission/index.js";
import { Skill } from "@/skill/index.js";
export function provider(model) {
  if (model.api.id.toLowerCase().includes("trinity")) return [PROMPT_TRINITY];
  if (model.api.id.toLowerCase().includes("kimi")) return [PROMPT_KIMI];
  return [PROMPT_DEFAULT];
}
export class Service extends Context.Service()("@closedcode/SystemPrompt") {}
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const skill = yield* Skill.Service;
  return Service.of({
    environment: Effect.fn("SystemPrompt.environment")(function* (model) {
      const ctx = yield* InstanceState.context;
      return [[`You are powered by the model named ${model.api.id}. The exact model ID is ${model.providerID}/${model.api.id}`, `Here is some useful information about the environment you are running in:`, `<env>`, `  Working directory: ${ctx.directory}`, `  Workspace root folder: ${ctx.worktree}`, `  Is directory a git repo: ${ctx.project.vcs === "git" ? "yes" : "no"}`, `  Platform: ${process.platform}`, `  Today's date: ${new Date().toDateString()}`, `</env>`].join("\n")];
    }),
    skills: Effect.fn("SystemPrompt.skills")(function* (agent) {
      if (Permission.disabled(["skill"], agent.permission).has("skill")) return;
      const list = yield* skill.available(agent);
      return ["Skills provide specialized instructions and workflows for specific tasks.", "Use the skill tool to load a skill when a task matches its description.",
      // the agents seem to ingest the information about skills a bit better if we present a more verbose
      // version of them here and a less verbose version in tool description, rather than vice versa.
      Skill.fmt(list, {
        verbose: true
      })].join("\n");
    })
  });
}));
export const defaultLayer = layer.pipe(Layer.provide(Skill.defaultLayer));
export * as SystemPrompt from "./system.js";