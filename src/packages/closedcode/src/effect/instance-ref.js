/** @file Effect context references that carry the ambient project instance and workspace ID across fibers (default undefined). */
import { Context } from "effect";
/** Context reference holding the current project Instance (undefined when unset). */
export const InstanceRef = Context.Reference("~closedcode/InstanceRef", {
  defaultValue: () => undefined
});
/** Context reference holding the current workspace ID (undefined when unset). */
export const WorkspaceRef = Context.Reference("~closedcode/WorkspaceRef", {
  defaultValue: () => undefined
});