/** @file Ambient workspace context: tracks the current workspaceID via async-local storage. */
import { LocalContext } from "#util/local-context.js";
const context = LocalContext.create("instance");
/**
 * Ambient holder for the current workspace id, backed by async-local context.
 * Use `provide`/`restore` to run code with a workspace id in scope and read it via `workspaceID`.
 * @type {Object}
 */
export const WorkspaceContext = {
  /**
   * Run an async function with the given workspace id established in the ambient context.
   * @param {Object} input - Invocation parameters.
   * @param {string} input.workspaceID - The workspace id to make current for the duration of the call.
   * @param {Function} input.fn - The function to invoke within the context.
   * @returns {Promise<*>} The resolved value of `input.fn`.
   */
  async provide(input) {
    return context.provide({
      workspaceID: input.workspaceID
    }, () => input.fn());
  },
  /**
   * Run a function with a previously captured workspace id re-established in the ambient context.
   * @param {string} workspaceID - The workspace id to restore for the duration of the call.
   * @param {Function} fn - The function to invoke within the restored context.
   * @returns {*} The return value of `fn`.
   */
  restore(workspaceID, fn) {
    return context.provide({
      workspaceID
    }, fn);
  },
  /**
   * The workspace id currently in scope, or undefined when no context is active.
   * @returns {string} The current workspace id, or undefined if none is set.
   */
  get workspaceID() {
    try {
      return context.use().workspaceID;
    } catch {
      return undefined;
    }
  }
};