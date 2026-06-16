/** @file HTTP API handlers for the "instance" group: dispose, path info, VCS branch/diff, and listings of commands, agents, skills, LSP servers, and formatters. */
import { Agent } from "#agent/agent.js";
import { Command } from "#command/index.js";
import * as InstanceState from "#effect/instance-state.js";
import { Format } from "#format/index.js";
import { Global } from "core/global";
import { LSP } from "#lsp/lsp.js";
import { Vcs } from "#project/vcs.js";
import { Skill } from "#skill/index.js";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { InstanceHttpApi } from "../api.js";
import { markInstanceForDisposal } from "../lifecycle.js";
/**
 * Registers the handlers for the "instance" HTTP API group on the instance API.
 * @type {Object}
 */
export const instanceHandlers = HttpApiBuilder.group(InstanceHttpApi, "instance", handlers => Effect.gen(function* () {
  const agent = yield* Agent.Service;
  const command = yield* Command.Service;
  const format = yield* Format.Service;
  const lsp = yield* LSP.Service;
  const skill = yield* Skill.Service;
  const vcs = yield* Vcs.Service;
  /**
   * Marks the current instance for disposal.
   * @returns {Effect} Effect yielding `true` on success.
   */
  const dispose = Effect.fn("InstanceHttpApi.dispose")(function* () {
    yield* markInstanceForDisposal(yield* InstanceState.context);
    return true;
  });
  /**
   * Returns the global home/state/config paths plus the current instance's worktree and directory.
   * @returns {Effect} Effect yielding `{home, state, config, worktree, directory}`.
   */
  const getPath = Effect.fn("InstanceHttpApi.path")(function* () {
    const ctx = yield* InstanceState.context;
    return {
      home: Global.Path.home,
      state: Global.Path.state,
      config: Global.Path.config,
      worktree: ctx.worktree,
      directory: ctx.directory
    };
  });
  /**
   * Returns the current and default VCS branch names, fetched concurrently.
   * @returns {Effect} Effect yielding `{branch, default_branch}`.
   */
  const getVcs = Effect.fn("InstanceHttpApi.vcs")(function* () {
    const [branch, default_branch] = yield* Effect.all([vcs.branch(), vcs.defaultBranch()], {
      concurrency: 2
    });
    return {
      branch,
      default_branch
    };
  });
  /**
   * Returns the VCS diff for the requested mode.
   * @param {Object} ctx - Handler context; `query.mode` selects the diff mode.
   * @returns {Effect} Effect yielding the diff.
   */
  const getVcsDiff = Effect.fn("InstanceHttpApi.vcsDiff")(function* (ctx) {
    return yield* vcs.diff(ctx.query.mode);
  });
  /**
   * Lists the available commands.
   * @returns {Effect} Effect yielding the command list.
   */
  const getCommand = Effect.fn("InstanceHttpApi.command")(function* () {
    return yield* command.list();
  });
  /**
   * Lists the available agents.
   * @returns {Effect} Effect yielding the agent list.
   */
  const getAgent = Effect.fn("InstanceHttpApi.agent")(function* () {
    return yield* agent.list();
  });
  /**
   * Lists all available skills.
   * @returns {Effect} Effect yielding the skill list.
   */
  const getSkill = Effect.fn("InstanceHttpApi.skill")(function* () {
    return yield* skill.all();
  });
  /**
   * Returns the status of the running LSP servers.
   * @returns {Effect} Effect yielding the LSP status.
   */
  const getLsp = Effect.fn("InstanceHttpApi.lsp")(function* () {
    return yield* lsp.status();
  });
  /**
   * Returns the status of the configured formatters.
   * @returns {Effect} Effect yielding the formatter status.
   */
  const getFormatter = Effect.fn("InstanceHttpApi.formatter")(function* () {
    return yield* format.status();
  });
  return handlers.handle("dispose", dispose).handle("path", getPath).handle("vcs", getVcs).handle("vcsDiff", getVcsDiff).handle("command", getCommand).handle("agent", getAgent).handle("skill", getSkill).handle("lsp", getLsp).handle("formatter", getFormatter);
}));