/** @file Per-instance AsyncLocalStorage context (current directory/worktree/project) and project-boundary path helpers. */
import { LocalContext } from "#util/local-context.js";
import { AppFileSystem } from "core/filesystem";

/** AsyncLocalStorage-backed context carrying the current instance's directory, worktree, and project. */
export const context = LocalContext.create("instance");

/**
 * Check if a path is within the project boundary.
 * Returns true if path is inside ctx.directory OR ctx.worktree.
 * Paths within the worktree but outside the working directory should not trigger external_directory permission.
 *
 * @param {string} filepath - The path to test for containment.
 * @param {{directory: string, worktree: string}} ctx - Instance context providing the directory and worktree boundaries.
 * @returns {boolean} True if filepath is inside the instance directory or worktree.
 */
export function containsPath(filepath, ctx) {
  if (AppFileSystem.contains(ctx.directory, filepath)) return true;
  // Non-git projects set worktree to "/" which would match ANY absolute path.
  // Skip worktree check in this case to preserve external_directory permissions.
  if (ctx.worktree === "/") return false;
  return AppFileSystem.contains(ctx.worktree, filepath);
}