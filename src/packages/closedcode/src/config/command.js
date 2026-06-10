export * as ConfigCommand from "./command.js";
import * as Log from "core/util/log";
import { Schema } from "effect";
import { NamedError } from "core/util/error";
import { Glob } from "core/util/glob";
import { Bus } from "#bus/index.js";
import { zod } from "#util/effect-zod.js";
import { withStatics } from "#util/schema.js";
import { configEntryNameFromPath } from "./entry-name.js";
import { InvalidError } from "./error.js";
import * as ConfigMarkdown from "./markdown.js";
import { ConfigModelID } from "./model-id.js";
const log = Log.create({
  service: "config"
});
export const Info = Schema.Struct({
  template: Schema.String,
  description: Schema.optional(Schema.String),
  agent: Schema.optional(Schema.String),
  model: Schema.optional(ConfigModelID),
  subtask: Schema.optional(Schema.Boolean)
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
export async function load(dir) {
  const result = {};
  for (const item of await Glob.scan("{command,commands}/**/*.md", {
    cwd: dir,
    absolute: true,
    dot: true,
    symlink: true
  })) {
    const md = await ConfigMarkdown.parse(item).catch(async err => {
      const message = ConfigMarkdown.FrontmatterError.isInstance(err) ? err.data.message : `Failed to parse command ${item}`;
      const {
        Session
      } = await import("#session/session.js");
      void Bus.publish(Session.Event.Error, {
        error: new NamedError.Unknown({
          message
        }).toObject()
      });
      log.error("failed to load command", {
        command: item,
        err
      });
      return undefined;
    });
    if (!md) continue;
    const patterns = ["/.closedcode/command/", "/.closedcode/commands/", "/.opencode/command/", "/.opencode/commands/", "/command/", "/commands/"];
    const name = configEntryNameFromPath(item, patterns);
    const config = {
      name,
      ...md.data,
      template: md.content.trim()
    };
    const parsed = Info.zod.safeParse(config);
    if (parsed.success) {
      result[config.name] = parsed.data;
      continue;
    }
    throw new InvalidError({
      path: item,
      issues: parsed.error.issues
    }, {
      cause: parsed.error
    });
  }
  return result;
}