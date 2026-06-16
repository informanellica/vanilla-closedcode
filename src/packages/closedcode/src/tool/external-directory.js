/** @file Guard that prompts the user for permission when a tool targets a path outside the project/worktree directory. */
import path from "path";
import { Effect } from "effect";
import * as EffectLogger from "core/effect/logger";
import { InstanceState } from "#effect/instance-state.js";
import { containsPath } from "../project/instance-context.js";
import { AppFileSystem } from "core/filesystem";
/**
 * Effect that asserts a target path lies within the current instance directory, and otherwise
 * raises an "external_directory" permission prompt for the target's containing directory.
 * Resolves to nothing (the side effect is the permission check); does not modify the path.
 * @param {Object} ctx - Tool execution context exposing the `ask` permission helper.
 * @param {string} target - The absolute path the tool intends to access (may be undefined to skip).
 * @param {Object} options - Optional behavior flags: `bypass` to skip the check, and `kind` ("file" or "directory") to control which directory is permission-checked.
 * @returns {Effect} An Effect that completes once the path is allowed or permission has been granted.
 */
export const assertExternalDirectoryEffect = Effect.fn("Tool.assertExternalDirectory")(function* (ctx, target, options) {
  if (!target) return;
  if (options?.bypass) return;
  const ins = yield* InstanceState.context;
  const full = process.platform === "win32" ? AppFileSystem.normalizePath(target) : target;
  if (containsPath(full, ins)) return;
  const kind = options?.kind ?? "file";
  const dir = kind === "directory" ? full : path.dirname(full);
  const glob = process.platform === "win32" ? AppFileSystem.normalizePathPattern(path.join(dir, "*")) : path.join(dir, "*").replaceAll("\\", "/");
  yield* ctx.ask({
    permission: "external_directory",
    patterns: [glob],
    always: [glob],
    metadata: {
      filepath: full,
      parentDir: dir
    }
  });
});
/**
 * Promise-returning wrapper around {@link assertExternalDirectoryEffect} for callers outside the
 * Effect runtime; runs the guard with the logger layer provided.
 * @param {Object} ctx - Tool execution context exposing the `ask` permission helper.
 * @param {string} target - The absolute path the tool intends to access.
 * @param {Object} options - Optional behavior flags (`bypass`, `kind`) passed through to the underlying Effect.
 * @returns {Promise<void>} Resolves once the path is allowed or permission has been granted.
 */
export async function assertExternalDirectory(ctx, target, options) {
  return Effect.runPromise(assertExternalDirectoryEffect(ctx, target, options).pipe(Effect.provide(EffectLogger.layer)));
}