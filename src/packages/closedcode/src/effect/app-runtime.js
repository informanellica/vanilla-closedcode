/** @file Builds the application-wide Effect layer (all closedcode services merged) and exposes AppRuntime, a ManagedRuntime wrapper that auto-attaches instance/workspace context to every run. */
import { Layer, ManagedRuntime } from "effect";
import { attach } from "./run-service.js";
import * as Observability from "core/effect/observability";
import { AppFileSystem } from "core/filesystem";
import { Bus } from "#bus/index.js";
import { Auth } from "#auth/index.js";
import { Account } from "#account/account.js";
import { Config } from "#config/config.js";
import { Git } from "#git/index.js";
import { Ripgrep } from "#file/ripgrep.js";
import { File } from "#file/index.js";
import { FileWatcher } from "#file/watcher.js";
import { Storage } from "#storage/storage.js";
import { Snapshot } from "#snapshot/index.js";
import { Plugin } from "#plugin/index.js";
import { ModelsDev } from "#provider/models.js";
import { Provider } from "#provider/provider.js";
import { ProviderAuth } from "#provider/auth.js";
import { Agent } from "#agent/agent.js";
import { Skill } from "#skill/index.js";
import { Discovery } from "#skill/discovery.js";
import { Question } from "#question/index.js";
import { Permission } from "#permission/index.js";
import { Todo } from "#session/todo.js";
import { Session } from "#session/session.js";
import { SessionStatus } from "#session/status.js";
import { SessionRunState } from "#session/run-state.js";
import { SessionProcessor } from "#session/processor.js";
import { SessionCompaction } from "#session/compaction.js";
import { SessionRevert } from "#session/revert.js";
import { SessionSummary } from "#session/summary.js";
import { SessionPrompt } from "#session/prompt.js";
import { Instruction } from "#session/instruction.js";
import { LLM } from "#session/llm.js";
import { LSP } from "#lsp/lsp.js";
import { MCP } from "#mcp/index.js";
import { McpAuth } from "#mcp/auth.js";
import { Command } from "#command/index.js";
import { Truncate } from "#tool/truncate.js";
import { ToolRegistry } from "#tool/registry.js";
import { Format } from "#format/index.js";
import { InstanceLayer } from "#project/instance-layer.js";
import { Project } from "#project/project.js";
import { Vcs } from "#project/vcs.js";
import { Workspace } from "#control-plane/workspace.js";
import { Worktree } from "#worktree/index.js";
import { Pty } from "#pty/index.js";
import { Installation } from "#installation/index.js";
import { ShareNext } from "#share/share-next.js";
import { SessionShare } from "#share/session.js";
import { SyncEvent } from "#sync/index.js";
import { Npm } from "core/npm";
import { memoMap } from "core/effect/memo-map";
/** The merged Effect layer of all application services, with the instance and observability layers provided. */
export const AppLayer = Layer.mergeAll(Npm.defaultLayer, AppFileSystem.defaultLayer, Bus.defaultLayer, Auth.defaultLayer, Account.defaultLayer, Config.defaultLayer, Git.defaultLayer, Ripgrep.defaultLayer, File.defaultLayer, FileWatcher.defaultLayer, Storage.defaultLayer, Snapshot.defaultLayer, Plugin.defaultLayer, ModelsDev.defaultLayer, Provider.defaultLayer, ProviderAuth.defaultLayer, Agent.defaultLayer, Skill.defaultLayer, Discovery.defaultLayer, Question.defaultLayer, Permission.defaultLayer, Todo.defaultLayer, Session.defaultLayer, SessionStatus.defaultLayer, SessionRunState.defaultLayer, SessionProcessor.defaultLayer, SessionCompaction.defaultLayer, SessionRevert.defaultLayer, SessionSummary.defaultLayer, SessionPrompt.defaultLayer, Instruction.defaultLayer, LLM.defaultLayer, LSP.defaultLayer, MCP.defaultLayer, McpAuth.defaultLayer, Command.defaultLayer, Truncate.defaultLayer, ToolRegistry.defaultLayer, Format.defaultLayer, Project.defaultLayer, Vcs.defaultLayer, Workspace.defaultLayer, Worktree.appLayer, Pty.defaultLayer, Installation.defaultLayer, ShareNext.defaultLayer, SessionShare.defaultLayer, SyncEvent.defaultLayer).pipe(Layer.provideMerge(InstanceLayer.layer), Layer.provideMerge(Observability.layer));
const rt = ManagedRuntime.make(AppLayer, {
  memoMap
});

/** Services provided by AppRuntime — i.e. what an Effect run via AppRuntime.runPromise can yield. */

/**
 * Wrap an effect so it carries the current instance/workspace context.
 * @param {Effect} effect - The effect to attach context to.
 * @returns {Effect} The effect with instance/workspace references provided.
 */
const wrap = effect => attach(effect);
/**
 * Run wrapper around the application ManagedRuntime. Every method auto-attaches
 * the ambient instance/workspace context via `attach` before running.
 */
export const AppRuntime = {
  /**
   * Run an effect synchronously, returning its success value.
   * @param {Effect} effect - The effect to run.
   * @returns {*} The effect's success value.
   */
  runSync(effect) {
    return rt.runSync(wrap(effect));
  },
  /**
   * Run an effect, returning a Promise of its success value.
   * @param {Effect} effect - The effect to run.
   * @param {Object} options - Optional run options (e.g. signal).
   * @returns {Promise} Promise resolving to the success value.
   */
  runPromise(effect, options) {
    return rt.runPromise(wrap(effect), options);
  },
  /**
   * Run an effect, returning a Promise of its Exit (success or failure).
   * @param {Effect} effect - The effect to run.
   * @param {Object} options - Optional run options (e.g. signal).
   * @returns {Promise} Promise resolving to the Exit value.
   */
  runPromiseExit(effect, options) {
    return rt.runPromiseExit(wrap(effect), options);
  },
  /**
   * Fork an effect into a background fiber.
   * @param {Effect} effect - The effect to fork.
   * @returns {*} The running fiber.
   */
  runFork(effect) {
    return rt.runFork(wrap(effect));
  },
  /**
   * Run an effect and deliver its outcome via callback.
   * @param {Effect} effect - The effect to run.
   * @returns {Function} A cancel function for the running effect.
   */
  runCallback(effect) {
    return rt.runCallback(wrap(effect));
  },
  /** Dispose the underlying runtime and release its resources. */
  dispose: () => rt.dispose()
};