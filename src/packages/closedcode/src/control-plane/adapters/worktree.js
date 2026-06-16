/** @file Built-in workspace adapter that backs a workspace with a git worktree. */
import { Schema } from "effect";
import { WorkspaceInfo } from "../types.js";
const WorktreeConfig = Schema.Struct({
  name: WorkspaceInfo.fields.name,
  branch: Schema.String,
  directory: Schema.String
});
const decodeWorktreeConfig = Schema.decodeUnknownSync(WorktreeConfig);
/**
 * Lazily import the worktree dependencies (app runtime and worktree service)
 * to avoid loading them until an adapter method is actually invoked.
 * @returns {Promise<Object>} An object with `AppRuntime` and `Worktree` modules.
 */
async function loadWorktree() {
  const [{
    AppRuntime
  }, {
    Worktree
  }] = await Promise.all([import("#effect/app-runtime.js"), import("#worktree/index.js")]);
  return {
    AppRuntime,
    Worktree
  };
}
/**
 * Workspace adapter that creates and manages a git worktree as the workspace backing store.
 * Implements the adapter contract: name/description metadata plus configure, create,
 * remove and target lifecycle methods.
 * @type {Object}
 */
export const WorktreeAdapter = {
  name: "Worktree",
  description: "Create a git worktree",
  /**
   * Fill in worktree-specific defaults (name, branch, directory) for a workspace,
   * deriving them from the worktree service.
   * @param {Object} info - The base workspace info to augment.
   * @returns {Promise<Object>} The info merged with generated name, branch and directory.
   */
  async configure(info) {
    const {
      AppRuntime,
      Worktree
    } = await loadWorktree();
    const next = await AppRuntime.runPromise(Worktree.Service.use(svc => svc.makeWorktreeInfo()));
    return {
      ...info,
      name: next.name,
      branch: next.branch,
      directory: next.directory
    };
  },
  /**
   * Create the git worktree described by the workspace info.
   * @param {Object} info - Workspace info; decoded into `{name, branch, directory}`.
   * @returns {Promise<void>} Resolves once the worktree has been created.
   */
  async create(info) {
    const {
      AppRuntime,
      Worktree
    } = await loadWorktree();
    const config = decodeWorktreeConfig(info);
    await AppRuntime.runPromise(Worktree.Service.use(svc => svc.createFromInfo({
      name: config.name,
      directory: config.directory,
      branch: config.branch
    })));
  },
  /**
   * Remove the git worktree backing the workspace.
   * @param {Object} info - Workspace info; decoded to obtain the worktree directory.
   * @returns {Promise<void>} Resolves once the worktree has been removed.
   */
  async remove(info) {
    const {
      AppRuntime,
      Worktree
    } = await loadWorktree();
    const config = decodeWorktreeConfig(info);
    await AppRuntime.runPromise(Worktree.Service.use(svc => svc.remove({
      directory: config.directory
    })));
  },
  /**
   * Describe the execution target for the workspace: a local directory pointing at the worktree.
   * @param {Object} info - Workspace info; decoded to obtain the worktree directory.
   * @returns {Object} A `{type: "local", directory}` target descriptor.
   */
  target(info) {
    const config = decodeWorktreeConfig(info);
    return {
      type: "local",
      directory: config.directory
    };
  }
};