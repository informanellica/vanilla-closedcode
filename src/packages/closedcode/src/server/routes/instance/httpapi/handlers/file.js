import * as InstanceState from "#effect/instance-state.js";
import { File } from "#file/index.js";
import { Ripgrep } from "#file/ripgrep.js";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { InstanceHttpApi } from "../api.js";
export const fileHandlers = HttpApiBuilder.group(InstanceHttpApi, "file", handlers => Effect.gen(function* () {
  const svc = yield* File.Service;
  const ripgrep = yield* Ripgrep.Service;
  const findText = Effect.fn("FileHttpApi.findText")(function* (ctx) {
    return (yield* ripgrep.search({
      cwd: (yield* InstanceState.context).directory,
      pattern: ctx.query.pattern,
      limit: 10
    }).pipe(Effect.orDie)).items;
  });
  const findFile = Effect.fn("FileHttpApi.findFile")(function* (ctx) {
    return yield* svc.search({
      query: ctx.query.query,
      limit: ctx.query.limit ?? 10,
      dirs: ctx.query.dirs !== "false",
      type: ctx.query.type
    });
  });
  const findSymbol = Effect.fn("FileHttpApi.findSymbol")(function* () {
    return [];
  });
  const list = Effect.fn("FileHttpApi.list")(function* (ctx) {
    return yield* svc.list(ctx.query.path);
  });
  const content = Effect.fn("FileHttpApi.content")(function* (ctx) {
    return yield* svc.read(ctx.query.path);
  });
  const status = Effect.fn("FileHttpApi.status")(function* () {
    return yield* svc.status();
  });
  return handlers.handle("findText", findText).handle("findFile", findFile).handle("findSymbol", findSymbol).handle("list", list).handle("content", content).handle("status", status);
}));