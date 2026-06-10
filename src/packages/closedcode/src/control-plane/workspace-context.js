import { LocalContext } from "#util/local-context.js";
const context = LocalContext.create("instance");
export const WorkspaceContext = {
  async provide(input) {
    return context.provide({
      workspaceID: input.workspaceID
    }, () => input.fn());
  },
  restore(workspaceID, fn) {
    return context.provide({
      workspaceID
    }, fn);
  },
  get workspaceID() {
    try {
      return context.use().workspaceID;
    } catch {
      return undefined;
    }
  }
};