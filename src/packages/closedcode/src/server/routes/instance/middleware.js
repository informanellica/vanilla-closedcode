import { WithInstance } from "@/project/with-instance.js";
import { AppFileSystem } from "core/filesystem";
import { WorkspaceContext } from "@/control-plane/workspace-context.js";
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