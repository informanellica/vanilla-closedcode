import { LocalContext } from "@/util/local-context.js";
import { AppFileSystem } from "core/filesystem";
export const context = LocalContext.create("instance");

/**
 * Check if a path is within the project boundary.
 * Returns true if path is inside ctx.directory OR ctx.worktree.
 * Paths within the worktree but outside the working directory should not trigger external_directory permission.
 */
export function containsPath(filepath, ctx) {
  if (AppFileSystem.contains(ctx.directory, filepath)) return true;
  // Non-git projects set worktree to "/" which would match ANY absolute path.
  // Skip worktree check in this case to preserve external_directory permissions.
  if (ctx.worktree === "/") return false;
  return AppFileSystem.contains(ctx.worktree, filepath);
}