/** @file Skill registry: discovers SKILL.md files across external, config, and remote sources, parses their frontmatter, and exposes lookup/listing plus prompt formatting. */
import path from "path";
import { pathToFileURL } from "url";
import z from "zod";
import { Effect, Layer, Context, Schema } from "effect";
import { zod } from "#util/effect-zod.js";
import { withStatics } from "#util/schema.js";
import { NamedError } from "core/util/error";
import { Bus } from "#bus/index.js";
import { InstanceState } from "#effect/instance-state.js";
import { Flag } from "core/flag/flag";
import { Global } from "core/global";
import { Permission } from "#permission/index.js";
import { AppFileSystem } from "core/filesystem";
import { Config } from "#config/config.js";
import { ConfigMarkdown } from "#config/markdown.js";
import { Glob } from "core/util/glob";
import * as Log from "core/util/log";
import { Discovery } from "./discovery.js";
const log = Log.create({
  service: "skill"
});
/** Directory name (under home / project ancestors) holding externally-managed agent skills. */
const AGENTS_EXTERNAL_DIR = ".agents";
/** Glob for SKILL.md files within an external `.agents` directory. */
const EXTERNAL_SKILL_PATTERN = "skills/**/SKILL.md";
/** Glob for SKILL.md files within closedcode config directories (skill/ or skills/). */
const CLOSEDCODE_SKILL_PATTERN = "{skill,skills}/**/SKILL.md";
/** Glob for SKILL.md files under user-provided skill paths or pulled remote directories. */
const SKILL_PATTERN = "**/SKILL.md";
/** Schema for a loaded skill: its name, description, source location, and body content. */
export const Info = Schema.Struct({
  name: Schema.String,
  description: Schema.String,
  location: Schema.String,
  content: Schema.String
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
/** Error raised when a skill file is structurally invalid (bad frontmatter/schema). */
export const InvalidError = NamedError.create("SkillInvalidError", z.object({
  path: z.string(),
  message: z.string().optional(),
  issues: z.custom().optional()
}));
/** Error raised when a skill's declared name does not match its expected (directory-derived) name. */
export const NameMismatchError = NamedError.create("SkillNameMismatchError", z.object({
  path: z.string(),
  expected: z.string(),
  actual: z.string()
}));
/**
 * Parses one SKILL.md file and, when it has a valid name/description frontmatter, registers it into `state.skills`. Parse failures are logged and surfaced as a session error event; duplicate names log a warning and overwrite.
 * @param {Object} state - Mutable load state with `skills` (name to skill record) and `dirs` (Set of skill directories).
 * @param {string} match - Absolute path to the SKILL.md file.
 * @param {Object} bus - The bus service used to publish parse-error events.
 * @returns {void}
 */
const add = Effect.fnUntraced(function* (state, match, bus) {
  const md = yield* Effect.tryPromise({
    try: () => ConfigMarkdown.parse(match),
    catch: err => err
  }).pipe(Effect.catch(Effect.fnUntraced(function* (err) {
    const message = ConfigMarkdown.FrontmatterError.isInstance(err) ? err.data.message : `Failed to parse skill ${match}`;
    const {
      Session
    } = yield* Effect.promise(() => import("#session/session.js"));
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
/**
 * Globs `pattern` under `root` for SKILL.md files and records the matches and their parent directories into `state`. Scan failures die unless `opts.scope` is set, in which case they are logged and treated as no matches.
 * @param {Object} state - Mutable scan state with `matches` and `dirs` Sets.
 * @param {string} root - Directory to scan from.
 * @param {string} pattern - The glob pattern to match.
 * @param {Object} opts - Options; `opts.dot` includes dotfiles, `opts.scope` names the scope for soft error handling/logging.
 * @returns {void}
 */
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
/**
 * Discovers all candidate SKILL.md files from every source: external `.agents` dirs (home + project ancestors), closedcode config directories, user-configured skill paths, and remote skill URLs (pulled via discovery).
 * @param {Object} config - Config service exposing `directories()` and `get()`.
 * @param {Object} discovery - SkillDiscovery service used to pull remote skill URLs.
 * @param {Object} fsys - Filesystem service (`isDir`, `up`).
 * @param {Object} global - Global service providing `home`.
 * @param {string} directory - The current working directory.
 * @param {string} worktree - The workspace root used as the upward-search boundary.
 * @returns {Promise<Object>} An object `{ matches, dirs }` of discovered SKILL.md paths and their directories.
 */
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
/**
 * Loads (parses and registers) all discovered SKILL.md files into `state`, then logs the resulting skill count.
 * @param {Object} state - Mutable load state with `skills` and `dirs`.
 * @param {Object} discovered - The discovery result with a `matches` array of SKILL.md paths.
 * @param {Object} bus - The bus service forwarded to per-skill parsing.
 * @returns {void}
 */
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
/**
 * Effect Layer providing the Skill service, which lazily discovers and loads skills per instance and exposes get/all/dirs/available accessors.
 */
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
  /**
   * Looks up a loaded skill by name.
   * @param {string} name - The skill name.
   * @returns {Promise<Object>} The skill record, or undefined when not found.
   */
  const get = Effect.fn("Skill.get")(function* (name) {
    const s = yield* InstanceState.get(state);
    return s.skills[name];
  });
  /**
   * Returns all loaded skills.
   * @returns {Promise<Array<Object>>} The list of skill records.
   */
  const all = Effect.fn("Skill.all")(function* () {
    const s = yield* InstanceState.get(state);
    return Object.values(s.skills);
  });
  /**
   * Returns the set of directories that contain discovered skills.
   * @returns {Promise<Set<string>>} The discovered skill directories.
   */
  const dirs = Effect.fn("Skill.dirs")(function* () {
    return (yield* InstanceState.get(discovered)).dirs;
  });
  /**
   * Returns the skills available to an agent, sorted by name. With no agent, returns all; otherwise filters out skills the agent's permissions deny.
   * @param {Object} agent - The agent whose `permission` configuration gates skill access; may be falsy for the unfiltered list.
   * @returns {Promise<Array<Object>>} The available, name-sorted skill records.
   */
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
/** The Skill layer with all its dependencies (Discovery, Config, Bus, filesystem, Global) provided. */
export const defaultLayer = layer.pipe(Layer.provide(Discovery.defaultLayer), Layer.provide(Config.defaultLayer), Layer.provide(Bus.layer), Layer.provide(AppFileSystem.defaultLayer), Layer.provide(Global.layer));
/**
 * Formats a list of skills for inclusion in a prompt: a verbose XML `<available_skills>` block (with file URLs) when `opts.verbose`, otherwise a concise Markdown bullet list. Returns a placeholder string when the list is empty.
 * @param {Array<Object>} list - Skill records to format.
 * @param {Object} opts - Options; `opts.verbose` selects the verbose XML form.
 * @returns {string} The formatted skills text.
 */
export function fmt(list, opts) {
  if (list.length === 0) return "No skills are currently available.";
  if (opts.verbose) {
    return ["<available_skills>", ...list.sort((a, b) => a.name.localeCompare(b.name)).flatMap(skill => ["  <skill>", `    <name>${skill.name}</name>`, `    <description>${skill.description}</description>`, `    <location>${pathToFileURL(skill.location).href}</location>`, "  </skill>"]), "</available_skills>"].join("\n");
  }
  return ["## Available Skills", ...list.toSorted((a, b) => a.name.localeCompare(b.name)).map(skill => `- **${skill.name}**: ${skill.description}`)].join("\n");
}
export * as Skill from "./index.js";