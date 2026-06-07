import path from "path";
import { Effect, Layer, Record, Result, Schema, Context } from "effect";
import { zod } from "@/util/effect-zod.js";
import { NonNegativeInt } from "@/util/schema.js";
import { Global } from "core/global";
import { AppFileSystem } from "core/filesystem";
export const OAUTH_DUMMY_KEY = "closedcode-oauth-dummy-key";
const file = path.join(Global.Path.data, "auth.json");
const fail = message => cause => new AuthError({
  message,
  cause
});
export class Oauth extends Schema.Class("OAuth")({
  type: Schema.Literal("oauth"),
  refresh: Schema.String,
  access: Schema.String,
  expires: NonNegativeInt,
  accountId: Schema.optional(Schema.String),
  enterpriseUrl: Schema.optional(Schema.String)
}) {}
export class Api extends Schema.Class("ApiAuth")({
  type: Schema.Literal("api"),
  key: Schema.String,
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.String))
}) {}
const _Info = Schema.Union([Oauth, Api]).annotate({
  discriminator: "type",
  identifier: "Auth"
});
export const Info = Object.assign(_Info, {
  zod: zod(_Info)
});
export class AuthError extends Schema.TaggedErrorClass()("AuthError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect)
}) {}
export class Service extends Context.Service()("@closedcode/Auth") {}
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const fsys = yield* AppFileSystem.Service;
  const decode = Schema.decodeUnknownOption(Info);
  const all = Effect.fn("Auth.all")(function* () {
    if (process.env.CLOSEDCODE_AUTH_CONTENT) {
      try {
        return JSON.parse(process.env.CLOSEDCODE_AUTH_CONTENT);
      } catch (err) {}
    }
    const data = yield* fsys.readJson(file).pipe(Effect.orElseSucceed(() => ({})));
    return Record.filterMap(data, value => Result.fromOption(decode(value), () => undefined));
  });
  const get = Effect.fn("Auth.get")(function* (providerID) {
    return (yield* all())[providerID];
  });
  const set = Effect.fn("Auth.set")(function* (key, info) {
    const norm = key.replace(/\/+$/, "");
    const data = yield* all();
    if (norm !== key) delete data[key];
    delete data[norm + "/"];
    yield* fsys.writeJson(file, {
      ...data,
      [norm]: info
    }, 0o600).pipe(Effect.mapError(fail("Failed to write auth data")));
  });
  const remove = Effect.fn("Auth.remove")(function* (key) {
    const norm = key.replace(/\/+$/, "");
    const data = yield* all();
    delete data[key];
    delete data[norm];
    yield* fsys.writeJson(file, data, 0o600).pipe(Effect.mapError(fail("Failed to write auth data")));
  });
  return Service.of({
    get,
    all,
    set,
    remove
  });
}));
export const defaultLayer = layer.pipe(Layer.provide(AppFileSystem.defaultLayer));
export * as Auth from "./index.js";