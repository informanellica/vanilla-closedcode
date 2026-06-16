/** @file Defines the "skill" tool, which loads a named skill's SKILL.md content and a sampled list of its accompanying files into the conversation. */
import { assetText } from "#util/asset.js";
import path from "path";
import { pathToFileURL } from "url";
import { Effect, Schema } from "effect";
import * as Stream from "effect/Stream";
import { Ripgrep } from "../file/ripgrep.js";
import { Skill } from "../skill/index.js";
import * as Tool from "./tool.js";
const DESCRIPTION = assetText("tool/skill.txt");
/** Schema for the skill tool parameters: the name of the skill to load. */
export const Parameters = Schema.Struct({
  name: Schema.String.annotate({
    description: "The name of the skill from available_skills"
  })
});
/**
 * The "skill" tool. Resolves a skill by name, asks for permission to load it,
 * then returns the skill's markdown content plus a sampled list of its files
 * (excluding SKILL.md) so the model can reference them by absolute path.
 * Fails if the named skill is not found, listing the available skills.
 */
export const SkillTool = Tool.define("skill", Effect.gen(function* () {
  const skill = yield* Skill.Service;
  const rg = yield* Ripgrep.Service;
  return {
    description: DESCRIPTION,
    parameters: Parameters,
    execute: (params, ctx) => Effect.gen(function* () {
      const info = yield* skill.get(params.name);
      if (!info) {
        const all = yield* skill.all();
        const available = all.map(item => item.name).join(", ");
        throw new Error(`Skill "${params.name}" not found. Available skills: ${available || "none"}`);
      }
      yield* ctx.ask({
        permission: "skill",
        patterns: [params.name],
        always: [params.name],
        metadata: {}
      });
      const dir = path.dirname(info.location);
      const base = pathToFileURL(dir).href;
      const limit = 10;
      const files = yield* rg.files({
        cwd: dir,
        follow: false,
        hidden: true,
        signal: ctx.abort
      }).pipe(Stream.filter(file => !file.includes("SKILL.md")), Stream.map(file => path.resolve(dir, file)), Stream.take(limit), Stream.runCollect, Effect.map(chunk => [...chunk].map(file => `<file>${file}</file>`).join("\n")));
      return {
        title: `Loaded skill: ${info.name}`,
        output: [`<skill_content name="${info.name}">`, `# Skill: ${info.name}`, "", info.content.trim(), "", `Base directory for this skill: ${base}`, "Relative paths in this skill (e.g., scripts/, reference/) are relative to this base directory.", "Note: file list is sampled.", "", "<skill_files>", files, "</skill_files>", "</skill_content>"].join("\n"),
        metadata: {
          name: info.name,
          dir
        }
      };
    }).pipe(Effect.orDie)
  };
}));