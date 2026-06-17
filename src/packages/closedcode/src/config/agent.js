/**
 * Agent/mode config schema and loaders that parse markdown definitions from disk.
 * @module closedcode/config/agent
 */
export * as ConfigAgent from "./agent.js";
import { Exit, Schema, SchemaGetter } from "effect";
import { Bus } from "#bus/index.js";
import { zod } from "#util/effect-zod.js";
import { PositiveInt, withStatics } from "#util/schema.js";
import * as Log from "core/util/log";
import { NamedError } from "core/util/error";
import { Glob } from "core/util/glob";
import { configEntryNameFromPath } from "./entry-name.js";
import * as ConfigMarkdown from "./markdown.js";
import { ConfigModelID } from "./model-id.js";
import { ConfigParse } from "./parse.js";
import { ConfigPermission } from "./permission.js";
const log = Log.create({
  service: "config"
});
/** Schema for an agent color: a six-digit hex code or a named theme color. */
const Color = Schema.Union([Schema.String.check(Schema.isPattern(/^#[0-9a-fA-F]{6}$/)), Schema.Literals(["primary", "secondary", "accent", "success", "warning", "error", "info"])]);
/** Raw agent config schema as authored, allowing arbitrary extra keys (normalized later). */
const AgentSchema = Schema.StructWithRest(Schema.Struct({
  model: Schema.optional(ConfigModelID),
  variant: Schema.optional(Schema.String).annotate({
    description: "Default model variant for this agent (applies only when using the agent's configured model)."
  }),
  temperature: Schema.optional(Schema.Finite),
  top_p: Schema.optional(Schema.Finite),
  prompt: Schema.optional(Schema.String),
  tools: Schema.optional(Schema.Record(Schema.String, Schema.Boolean)).annotate({
    description: "@deprecated Use 'permission' field instead"
  }),
  disable: Schema.optional(Schema.Boolean),
  description: Schema.optional(Schema.String).annotate({
    description: "Description of when to use the agent"
  }),
  mode: Schema.optional(Schema.Literals(["subagent", "primary", "all"])),
  hidden: Schema.optional(Schema.Boolean).annotate({
    description: "Hide this subagent from the @ autocomplete menu (default: false, only applies to mode: subagent)"
  }),
  options: Schema.optional(Schema.Record(Schema.String, Schema.Any)),
  color: Schema.optional(Color).annotate({
    description: "Hex color code (e.g., #FF5733) or theme color (e.g., primary)"
  }),
  steps: Schema.optional(PositiveInt).annotate({
    description: "Maximum number of agentic iterations before forcing text-only response"
  }),
  maxSteps: Schema.optional(PositiveInt).annotate({
    description: "@deprecated Use 'steps' field instead."
  }),
  permission: Schema.optional(ConfigPermission.Info)
}), [Schema.Record(Schema.String, Schema.Any)]);
/** The set of recognized top-level agent config keys; any other key is folded into `options`. */
const KNOWN_KEYS = new Set(["name", "model", "variant", "prompt", "description", "temperature", "top_p", "mode", "hidden", "color", "steps", "maxSteps", "options", "permission", "disable", "tools"]);

// Post-parse normalisation:
//  - Promote any unknown-but-present keys into `options` so they survive the
//    round-trip in a well-known field.
//  - Translate the deprecated `tools: { name: boolean }` map into the new
//    `permission` shape (write-adjacent tools collapse into `permission.edit`).
//  - Coalesce `steps ?? maxSteps` so downstream can ignore the deprecated alias.
/**
 * Normalize a raw agent config: promote unknown keys into `options`, translate the deprecated
 * `tools` boolean map into a `permission` object (write/edit/patch collapse into `permission.edit`),
 * merge any explicit `permission` on top, and coalesce `steps ?? maxSteps`.
 * @param {Object} agent - The raw parsed agent config.
 * @returns {Object} The normalized agent config with `options`, `permission`, and `steps` settled.
 */
const normalize = agent => {
  const options = {
    ...agent.options
  };
  for (const [key, value] of Object.entries(agent)) {
    if (!KNOWN_KEYS.has(key)) options[key] = value;
  }
  const permission = {};
  for (const [tool, enabled] of Object.entries(agent.tools ?? {})) {
    const action = enabled ? "allow" : "deny";
    if (tool === "write" || tool === "edit" || tool === "patch") {
      permission.edit = action;
      continue;
    }
    permission[tool] = action;
  }
  globalThis.Object.assign(permission, agent.permission);
  const steps = agent.steps ?? agent.maxSteps;
  return {
    ...agent,
    options,
    permission,
    ...(steps !== undefined ? {
      steps
    } : {})
  };
};
/** Decoded agent config schema that applies `normalize` on decode and a Zod equivalent via statics. */
export const Info = AgentSchema.pipe(Schema.decodeTo(AgentSchema, {
  decode: SchemaGetter.transform(normalize),
  encode: SchemaGetter.passthrough({
    strict: false
  })
})).annotate({
  identifier: "AgentConfig"
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
/**
 * Load all agent definitions under a directory by scanning `{agent,agents}/**\/*.md`, parsing each
 * markdown file's frontmatter and body, and decoding it into an agent config. Parse failures are
 * logged and published as a session error event and skipped rather than aborting the whole load.
 * @param {string} dir - The base directory to scan for agent markdown files.
 * @returns {Promise<Object>} A map of agent name to its parsed config.
 */
export async function load(dir) {
  const result = {};
  for (const item of await Glob.scan("{agent,agents}/**/*.md", {
    cwd: dir,
    absolute: true,
    dot: true,
    symlink: true
  })) {
    const md = await ConfigMarkdown.parse(item).catch(async err => {
      const message = ConfigMarkdown.FrontmatterError.isInstance(err) ? err.data.message : `Failed to parse agent ${item}`;
      const {
        Session
      } = await import("#session/session.js");
      void Bus.publish(Session.Event.Error, {
        error: new NamedError.Unknown({
          message
        }).toObject()
      });
      log.error("failed to load agent", {
        agent: item,
        err
      });
      return undefined;
    });
    if (!md) continue;
    const patterns = ["/.closedcode/agent/", "/.closedcode/agents/", "/agent/", "/agents/"];
    const name = configEntryNameFromPath(item, patterns);
    const config = {
      name,
      ...md.data,
      prompt: md.content.trim()
    };
    result[config.name] = ConfigParse.effectSchema(Info, config, item);
  }
  return result;
}
/**
 * Load all mode definitions under a directory by scanning `{mode,modes}/*.md`, parsing each
 * markdown file, and decoding it as an agent config forced into `mode: "primary"`. Parse failures
 * are logged and published as a session error event; entries that fail schema decoding are skipped.
 * @param {string} dir - The base directory to scan for mode markdown files.
 * @returns {Promise<Object>} A map of mode name to its parsed config (each with mode set to "primary").
 */
export async function loadMode(dir) {
  const result = {};
  for (const item of await Glob.scan("{mode,modes}/*.md", {
    cwd: dir,
    absolute: true,
    dot: true,
    symlink: true
  })) {
    const md = await ConfigMarkdown.parse(item).catch(async err => {
      const message = ConfigMarkdown.FrontmatterError.isInstance(err) ? err.data.message : `Failed to parse mode ${item}`;
      const {
        Session
      } = await import("#session/session.js");
      void Bus.publish(Session.Event.Error, {
        error: new NamedError.Unknown({
          message
        }).toObject()
      });
      log.error("failed to load mode", {
        mode: item,
        err
      });
      return undefined;
    });
    if (!md) continue;
    const config = {
      name: configEntryNameFromPath(item, []),
      ...md.data,
      prompt: md.content.trim()
    };
    const parsed = Schema.decodeUnknownExit(Info)(config, {
      errors: "all",
      propertyOrder: "original"
    });
    if (Exit.isSuccess(parsed)) {
      result[config.name] = {
        ...parsed.value,
        mode: "primary"
      };
    }
  }
  return result;
}