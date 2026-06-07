import { Context } from "effect";
export const InstanceRef = Context.Reference("~closedcode/InstanceRef", {
  defaultValue: () => undefined
});
export const WorkspaceRef = Context.Reference("~closedcode/WorkspaceRef", {
  defaultValue: () => undefined
});