/** @file Auth service: stores and retrieves per-provider credentials (OAuth or API key) in auth.json. */
import path from "path";
import { Effect, Layer, Record, Result, Schema, Context } from "effect";
import { zod } from "#util/effect-zod.js";
import { NonNegativeInt } from "#util/schema.js";
import { Global } from "core/global";
import { AppFileSystem } from "core/filesystem";
/** Placeholder API key used when a provider authenticates via OAuth rather than a real key. */
export const OAUTH_DUMMY_KEY = "closedcode-oauth-dummy-key";
/** Absolute path to the on-disk credentials file. */
const file = path.join(Global.Path.data, "auth.json");
/**
 * Build a curried AuthError factory bound to a message.
 * @param {string} message - The error message.
 * @returns {Function} A function from cause to AuthError.
 */
const fail = message => cause => new AuthError({
  message,
  cause
});
/** Schema for OAuth credentials: refresh/access tokens, expiry, and optional account/enterprise info. */
export class Oauth extends Schema.Class("OAuth")({
  type: Schema.Literal("oauth"),
  refresh: Schema.String,
  access: Schema.String,
  expires: NonNegativeInt,
  accountId: Schema.optional(Schema.String),
  enterpriseUrl: Schema.optional(Schema.String)
}) {}
/** Schema for API-key credentials: the key plus optional metadata. */
export class Api extends Schema.Class("ApiAuth")({
  type: Schema.Literal("api"),
  key: Schema.String,
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.String))
}) {}
/** Discriminated union (by `type`) of the supported credential shapes. */
const _Info = Schema.Union([Oauth, Api]).annotate({
  discriminator: "type",
  identifier: "Auth"
});
/** Credential schema with an attached zod equivalent for validation interop. */
export const Info = Object.assign(_Info, {
  zod: zod(_Info)
});
/** Tagged error for auth read/write failures. */
export class AuthError extends Schema.TaggedErrorClass()("AuthError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect)
}) {}
/** Effect service tag for the auth service. */
export class Service extends Context.Service()("@closedcode/Auth") {}
/** Effect Layer building the auth service over the application filesystem. */
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const fsys = yield* AppFileSystem.Service;
  const decode = Schema.decodeUnknownOption(Info);
  /**
   * Read all stored credentials, keyed by provider id.
   * Prefers the CLOSEDCODE_AUTH_CONTENT env var (parsed JSON) over the on-disk file.
   * @returns {Effect} An Effect resolving to a record of provider id to decoded credentials.
   */
  const all = Effect.fn("Auth.all")(function* () {
    if (process.env.CLOSEDCODE_AUTH_CONTENT) {
      try {
        return JSON.parse(process.env.CLOSEDCODE_AUTH_CONTENT);
      } catch (err) {}
    }
    const data = yield* fsys.readJson(file).pipe(Effect.orElseSucceed(() => ({})));
    return Record.filterMap(data, value => Result.fromOption(decode(value), () => undefined));
  });
  /**
   * Get the stored credentials for a single provider.
   * @param {string} providerID - The provider id to look up.
   * @returns {Effect} An Effect resolving to the credentials, or undefined when none are stored.
   */
  const get = Effect.fn("Auth.get")(function* (providerID) {
    return (yield* all())[providerID];
  });
  /**
   * Store credentials for a key, normalizing trailing slashes and removing stale variants.
   * @param {string} key - The provider key (trailing slashes are stripped).
   * @param {Object} info - The credentials to persist (Oauth or Api).
   * @returns {Effect} An Effect resolving to void.
   */
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
  /**
   * Remove the stored credentials for a key (both the raw and slash-normalized form).
   * @param {string} key - The provider key to remove.
   * @returns {Effect} An Effect resolving to void.
   */
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
/** Auth service layer wired with its default filesystem dependency. */
export const defaultLayer = layer.pipe(Layer.provide(AppFileSystem.defaultLayer));
export * as Auth from "./index.js";