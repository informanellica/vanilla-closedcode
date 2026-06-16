/** @file Hono-style middleware that resolves the working directory and workspace for instance-scoped routes. */
import { WithInstance } from "#project/with-instance.js";
import { AppFileSystem } from "core/filesystem";
import { WorkspaceContext } from "#control-plane/workspace-context.js";
/**
 * Build middleware that establishes the workspace and instance context for a request.
 * Resolves the target directory from the `directory` query param or `x-closedcode-directory`/`x-opencode-directory`
 * headers (falling back to the process cwd), then runs the next handler inside that workspace and instance scope.
 * @param {string} workspaceID - The workspace identifier to bind for the request.
 * @returns {Function} An async middleware `(c, next)` that provides workspace and instance context.
 */
export function InstanceMiddleware(workspaceID) {
  return async (c, next) => {
    const raw = c.req.query("directory") || c.req.header("x-closedcode-directory") || c.req.header("x-opencode-directory") || process.cwd();
    const directory = AppFileSystem.resolve((() => {
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    })());
    return WorkspaceContext.provide({
      workspaceID,
      async fn() {
        return WithInstance.provide({
          directory,
          async fn() {
            return next();
          }
        });
      }
    });
  };
}