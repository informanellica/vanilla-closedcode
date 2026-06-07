import path from "path";
import { pathToFileURL } from "url";
import z from "zod";
import { Effect, Layer, Context, Schema } from "effect";
import { zod } from "@/util/effect-zod.js";
import { withStatics } from "@/util/schema.js";
import { NamedError } from "core/util/error";
import { Bus } from "@/bus/index.js";
import { InstanceState } from "@/effect/instance-state.js";
import { Flag } from "core/flag/flag";
import { Global } from "core/global";
import { Permission } from "@/permission/index.js";
import { AppFileSystem } from "core/filesystem";
import { Config } from "@/config/config.js";
import { ConfigMarkdown } from "@/config/markdown.js";
import { Glob } from "core/util/glob";
import * as Log from "core/util/log";
import { Discovery } from "./discovery.js";
const log = Log.create({
  service: "skill"
});
const AGENTS_EXTERNAL_DIR = ".agents";
const EXTERNAL_SKILL_PATTERN = "skills/**/SKILL.md";
const CLOSEDCODE_SKILL_PATTERN = "{skill,skills}/**/SKILL.md";
const SKILL_PATTERN = "**/SKILL.md";
export const Info = Schema.Struct({
  name: Schema.String,
  description: Schema.String,
  location: Schema.String,
  content: Schema.String
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
export const InvalidError = NamedError.create("SkillInvalidError", z.object({
  path: z.string(),
  message: z.string().optional(),
  issues: z.custom().optional()
}));
export const NameMismatchError = NamedError.create("SkillNameMismatchError", z.object({
  path: z.string(),
  expected: z.string(),
  actual: z.string()
}));
const add = Effect.fnUntraced(function* (state, match, bus) {
  const md = yield* Effect.tryPromise({
    try: () => ConfigMarkdown.parse(match),
    catch: err => err
  }).pipe(Effect.catch(Effect.fnUntraced(function* (err) {
    const message = ConfigMarkdown.FrontmatterError.isInstance(err) ? err.data.message : `Failed to parse skill ${match}`;
    const {
      Session
    } = yield* Effect.promise(() => import("@/session/session.js"));
    yield* bus.publish(Session.Event.Error, {
      error: new NamedError.Unknown({
        message
      }).toObject()
    });
    log.error("failed to load skill", {
      skill: match,
      err
    });
    return undefined;
  })));
  if (!md) return;
  const parsed = z.object({
    name: z.string(),
    description: z.string()
  }).safeParse(md.data);
  if (!parsed.success) return;
  if (state.skills[parsed.data.name]) {
    log.warn("duplicate skill name", {
      name: parsed.data.name,
      existing: state.skills[parsed.data.name].location,
      duplicate: match
    });
  }
  state.dirs.add(path.dirname(match));
  state.skills[parsed.data.name] = {
    name: parsed.data.name,
    description: parsed.data.description,
    location: match,
    content: md.content
  };
});
const scan = Effect.fnUntraced(function* (state, root, pattern, opts) {
  const matches = yield* Effect.tryPromise({
    try: () => Glob.scan(pattern, {
      cwd: root,
      absolute: true,
      include: "file",
      symlink: true,
      dot: opts?.dot
    }),
    catch: error => error
  }).pipe(Effect.catch(error => {
    if (!opts?.scope) return Effect.die(error);
    log.error(`failed to scan ${opts.scope} skills`, {
      dir: root,
      error
    });
    return Effect.succeed([]);
  }));
  for (const match of matches) {
    state.matches.add(match);
    state.dirs.add(path.dirname(match));
  }
});
const discoverSkills = Effect.fnUntraced(function* (config, discovery, fsys, global, directory, worktree) {
  const state = {
    matches: new Set(),
    dirs: new Set()
  };
  const externalDirs = [];
  if (!Flag.CLOSEDCODE_DISABLE_EXTERNAL_SKILLS) {
    externalDirs.push(AGENTS_EXTERNAL_DIR);
    for (const dir of externalDirs) {
      const root = path.join(global.home, dir);
      if (!(yield* fsys.isDir(root))) continue;
      yield* scan(state, root, EXTERNAL_SKILL_PATTERN, {
        dot: true,
        scope: "global"
      });
    }
    const upDirs = yield* fsys.up({
      targets: externalDirs,
      start: directory,
      stop: worktree
    }).pipe(Effect.catch(() => Effect.succeed([])));
    for (const root of upDirs) {
      yield* scan(state, root, EXTERNAL_SKILL_PATTERN, {
        dot: true,
        scope: "project"
      });
    }
  }
  const configDirs = yield* config.directories();
  for (const dir of configDirs) {
    yield* scan(state, dir, CLOSEDCODE_SKILL_PATTERN);
  }
  const cfg = yield* config.get();
  for (const item of cfg.skills?.paths ?? []) {
    const expanded = item.startsWith("~/") ? path.join(global.home, item.slice(2)) : item;
    const dir = path.isAbsolute(expanded) ? expanded : path.join(directory, expanded);
    if (!(yield* fsys.isDir(dir))) {
      log.warn("skill path not found", {
        path: dir
      });
      continue;
    }
    yield* scan(state, dir, SKILL_PATTERN);
  }
  for (const url of cfg.skills?.urls ?? []) {
    const pulledDirs = yield* discovery.pull(url);
    for (const dir of pulledDirs) {
      yield* scan(state, dir, SKILL_PATTERN);
    }
  }
  return {
    matches: Array.from(state.matches),
    dirs: Array.from(state.dirs)
  };
});
const loadSkills = Effect.fnUntraced(function* (state, discovered, bus) {
  yield* Effect.forEach(discovered.matches, match => add(state, match, bus), {
    concurrency: "unbounded",
    discard: true
  });
  log.info("init", {
    count: Object.keys(state.skills).length
  });
});
export class Service extends Context.Service()("@closedcode/Skill") {}
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const discovery = yield* Discovery.Service;
  const config = yield* Config.Service;
  const bus = yield* Bus.Service;
  const fsys = yield* AppFileSystem.Service;
  const global = yield* Global.Service;
  const discovered = yield* InstanceState.make(Effect.fn("Skill.discovery")(function* (ctx) {
    return yield* discoverSkills(config, discovery, fsys, global, ctx.directory, ctx.worktree);
  }));
  const state = yield* InstanceState.make(Effect.fn("Skill.state")(function* () {
    const s = {
      skills: {},
      dirs: new Set()
    };
    yield* loadSkills(s, yield* InstanceState.get(discovered), bus);
    return s;
  }));
  const get = Effect.fn("Skill.get")(function* (name) {
    const s = yield* InstanceState.get(state);
    return s.skills[name];
  });
  const all = Effect.fn("Skill.all")(function* () {
    const s = yield* InstanceState.get(state);
    return Object.values(s.skills);
  });
  const dirs = Effect.fn("Skill.dirs")(function* () {
    return (yield* InstanceState.get(discovered)).dirs;
  });
  const available = Effect.fn("Skill.available")(function* (agent) {
    const s = yield* InstanceState.get(state);
    const list = Object.values(s.skills).toSorted((a, b) => a.name.localeCompare(b.name));
    if (!agent) return list;
    return list.filter(skill => Permission.evaluate("skill", skill.name, agent.permission).action !== "deny");
  });
  return Service.of({
    get,
    all,
    dirs,
    available
  });
}));
export const defaultLayer = layer.pipe(Layer.provide(Discovery.defaultLayer), Layer.provide(Config.defaultLayer), Layer.provide(Bus.layer), Layer.provide(AppFileSystem.defaultLayer), Layer.provide(Global.layer));
export function fmt(list, opts) {
  if (list.length === 0) return "No skills are currently available.";
  if (opts.verbose) {
    return ["<available_skills>", ...list.sort((a, b) => a.name.localeCompare(b.name)).flatMap(skill => ["  <skill>", `    <name>${skill.name}</name>`, `    <description>${skill.description}</description>`, `    <location>${pathToFileURL(skill.location).href}</location>`, "  </skill>"]), "</available_skills>"].join("\n");
  }
  return ["## Available Skills", ...list.toSorted((a, b) => a.name.localeCompare(b.name)).map(skill => `- **${skill.name}**: ${skill.description}`)].join("\n");
}
export * as Skill from "./index.js";