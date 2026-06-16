/** @file Builds the system prompt: selects the model-specific base prompt and assembles environment and skills context. */
import { assetText } from "#util/asset.js";
import { Context, Effect, Layer } from "effect";
import { InstanceState } from "#effect/instance-state.js";
const PROMPT_DEFAULT = assetText("session/prompt/default.txt");
const PROMPT_KIMI = assetText("session/prompt/kimi.txt");
const PROMPT_TRINITY = assetText("session/prompt/trinity.txt");
import { Permission } from "#permission/index.js";
import { Skill } from "#skill/index.js";
/**
 * Selects the base system prompt(s) appropriate for the given model, choosing a Trinity- or Kimi-specific prompt by model id and otherwise the default.
 * @param {Object} model - Model descriptor with an `api.id` string.
 * @returns {Array<string>} A single-element array containing the chosen prompt text.
 */
export function provider(model) {
  if (model.api.id.toLowerCase().includes("trinity")) return [PROMPT_TRINITY];
  if (model.api.id.toLowerCase().includes("kimi")) return [PROMPT_KIMI];
  return [PROMPT_DEFAULT];
}
export class Service extends Context.Service()("@closedcode/SystemPrompt") {}
/**
 * Effect Layer providing the SystemPrompt service, which produces the environment block and the available-skills block for a prompt.
 */
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const skill = yield* Skill.Service;
  return Service.of({
    /**
     * Builds the `<env>` system-prompt block describing the model id, working/worktree directories, VCS, platform, and date.
     * @param {Object} model - Model descriptor with `api.id` and `providerID`.
     * @returns {Array<string>} A single-element array containing the environment block text.
     */
    environment: Effect.fn("SystemPrompt.environment")(function* (model) {
      const ctx = yield* InstanceState.context;
      return [[`You are powered by the model named ${model.api.id}. The exact model ID is ${model.providerID}/${model.api.id}`, `Here is some useful information about the environment you are running in:`, `<env>`, `  Working directory: ${ctx.directory}`, `  Workspace root folder: ${ctx.worktree}`, `  Is directory a git repo: ${ctx.project.vcs === "git" ? "yes" : "no"}`, `  Platform: ${process.platform}`, `  Today's date: ${new Date().toDateString()}`, `</env>`].join("\n")];
    }),
    /**
     * Builds the available-skills section of the system prompt for the given agent, or returns nothing when the skill permission is disabled.
     * @param {Object} agent - Agent descriptor including its `permission` configuration.
     * @returns {string|undefined} The skills prompt text, or undefined when skills are disabled.
     */
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
/** The SystemPrompt layer with its Skill dependency provided. */
export const defaultLayer = layer.pipe(Layer.provide(Skill.defaultLayer));
export * as SystemPrompt from "./system.js";