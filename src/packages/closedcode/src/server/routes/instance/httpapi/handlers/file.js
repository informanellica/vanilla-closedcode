/** @file HTTP API handlers for the "file" group: text/file/symbol search, directory listing, file content reads, and VCS file status. */
import * as InstanceState from "#effect/instance-state.js";
import { File } from "#file/index.js";
import { Ripgrep } from "#file/ripgrep.js";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { InstanceHttpApi } from "../api.js";
/**
 * Registers the handlers for the "file" HTTP API group on the instance API.
 * @type {Object}
 */
export const fileHandlers = HttpApiBuilder.group(InstanceHttpApi, "file", handlers => Effect.gen(function* () {
  const svc = yield* File.Service;
  const ripgrep = yield* Ripgrep.Service;
  /**
   * Searches file contents for a pattern via ripgrep, scoped to the instance directory.
   * @param {Object} ctx - Handler context; `query.pattern` is the search pattern.
   * @returns {Effect} Effect yielding the array of matched items (capped at 10).
   */
  const findText = Effect.fn("FileHttpApi.findText")(function* (ctx) {
    return (yield* ripgrep.search({
      cwd: (yield* InstanceState.context).directory,
      pattern: ctx.query.pattern,
      limit: 10
    }).pipe(Effect.orDie)).items;
  });
  /**
   * Fuzzy-searches for files (and optionally directories) by name.
   * @param {Object} ctx - Handler context; `query` carries `query` (search text), optional `limit` (default 10), `dirs` (include directories unless "false"), and `type` filter.
   * @returns {Effect} Effect yielding the list of matching files.
   */
  const findFile = Effect.fn("FileHttpApi.findFile")(function* (ctx) {
    return yield* svc.search({
      query: ctx.query.query,
      limit: ctx.query.limit ?? 10,
      dirs: ctx.query.dirs !== "false",
      type: ctx.query.type
    });
  });
  /**
   * Searches for workspace symbols. Currently a stub that returns no matches.
   * @returns {Effect} Effect yielding an empty array.
   */
  const findSymbol = Effect.fn("FileHttpApi.findSymbol")(function* () {
    return [];
  });
  /**
   * Lists the entries of a directory.
   * @param {Object} ctx - Handler context; `query.path` is the directory to list.
   * @returns {Effect} Effect yielding the directory listing.
   */
  const list = Effect.fn("FileHttpApi.list")(function* (ctx) {
    return yield* svc.list(ctx.query.path);
  });
  /**
   * Reads the content of a file.
   * @param {Object} ctx - Handler context; `query.path` is the file to read.
   * @returns {Effect} Effect yielding the file content.
   */
  const content = Effect.fn("FileHttpApi.content")(function* (ctx) {
    return yield* svc.read(ctx.query.path);
  });
  /**
   * Returns the VCS status of files in the workspace.
   * @returns {Effect} Effect yielding the file status.
   */
  const status = Effect.fn("FileHttpApi.status")(function* () {
    return yield* svc.status();
  });
  return handlers.handle("findText", findText).handle("findFile", findFile).handle("findSymbol", findSymbol).handle("list", list).handle("content", content).handle("status", status);
}));