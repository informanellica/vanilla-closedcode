/** @file HTTP API handlers for the "project" group: listing projects, reading the current project, git-initializing it, and updating project metadata. */
import * as InstanceState from "#effect/instance-state.js";
import { Project } from "#project/project.js";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { InstanceHttpApi } from "../api.js";
import { markInstanceForReload } from "../lifecycle.js";
/**
 * Registers the handlers for the "project" HTTP API group on the instance API.
 * @type {Object}
 */
export const projectHandlers = HttpApiBuilder.group(InstanceHttpApi, "project", handlers => Effect.gen(function* () {
  const svc = yield* Project.Service;
  /**
   * Lists all known projects.
   * @returns {Effect} Effect yielding the project list.
   */
  const list = Effect.fn("ProjectHttpApi.list")(function* () {
    return yield* svc.list();
  });
  /**
   * Returns the current instance's project.
   * @returns {Effect} Effect yielding the current project.
   */
  const current = Effect.fn("ProjectHttpApi.current")(function* () {
    return (yield* InstanceState.context).project;
  });
  /**
   * Initializes git for the current project's directory; if the project's identity/VCS/worktree changed,
   * marks the instance for reload so it picks up the new project state.
   * @returns {Effect} Effect yielding the (possibly updated) project.
   */
  const initGit = Effect.fn("ProjectHttpApi.initGit")(function* () {
    const ctx = yield* InstanceState.context;
    const next = yield* svc.initGit({
      directory: ctx.directory,
      project: ctx.project
    });
    if (next.id === ctx.project.id && next.vcs === ctx.project.vcs && next.worktree === ctx.project.worktree) return next;
    yield* markInstanceForReload(ctx, {
      directory: ctx.directory,
      worktree: ctx.directory,
      project: next
    });
    return next;
  });
  /**
   * Updates the metadata of the project identified by the path param.
   * @param {Object} ctx - Handler context; `params.projectID` identifies the project and `payload` carries the fields to update.
   * @returns {Effect} Effect yielding the updated project.
   */
  const update = Effect.fn("ProjectHttpApi.update")(function* (ctx) {
    return yield* svc.update({
      ...ctx.payload,
      projectID: ctx.params.projectID
    });
  });
  return handlers.handle("list", list).handle("current", current).handle("initGit", initGit).handle("update", update);
}));