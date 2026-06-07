import { Context, Duration, Effect, Layer, Schema } from "effect";
import { Flag } from "core/flag/flag";
import { AppFileSystem } from "core/filesystem";
const Cost = Schema.Struct({
  input: Schema.Finite,
  output: Schema.Finite,
  cache_read: Schema.optional(Schema.Finite),
  cache_write: Schema.optional(Schema.Finite),
  context_over_200k: Schema.optional(Schema.Struct({
    input: Schema.Finite,
    output: Schema.Finite,
    cache_read: Schema.optional(Schema.Finite),
    cache_write: Schema.optional(Schema.Finite)
  }))
});
export const Model = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  family: Schema.optional(Schema.String),
  release_date: Schema.String,
  attachment: Schema.Boolean,
  reasoning: Schema.Boolean,
  temperature: Schema.Boolean,
  tool_call: Schema.Boolean,
  interleaved: Schema.optional(Schema.Union([Schema.Literal(true), Schema.Struct({
    field: Schema.Literals(["reasoning_content", "reasoning_details"])
  })])),
  cost: Schema.optional(Cost),
  limit: Schema.Struct({
    context: Schema.Finite,
    input: Schema.optional(Schema.Finite),
    output: Schema.Finite
  }),
  modalities: Schema.optional(Schema.Struct({
    input: Schema.Array(Schema.Literals(["text", "audio", "image", "video", "pdf"])),
    output: Schema.Array(Schema.Literals(["text", "audio", "image", "video", "pdf"]))
  })),
  experimental: Schema.optional(Schema.Struct({
    modes: Schema.optional(Schema.Record(Schema.String, Schema.Struct({
      cost: Schema.optional(Cost),
      provider: Schema.optional(Schema.Struct({
        body: Schema.optional(Schema.Record(Schema.String, Schema.MutableJson)),
        headers: Schema.optional(Schema.Record(Schema.String, Schema.String))
      }))
    })))
  })),
  status: Schema.optional(Schema.Literals(["alpha", "beta", "deprecated"])),
  provider: Schema.optional(Schema.Struct({
    npm: Schema.optional(Schema.String),
    api: Schema.optional(Schema.String)
  }))
});
export const Provider = Schema.Struct({
  api: Schema.optional(Schema.String),
  name: Schema.String,
  env: Schema.Array(Schema.String),
  id: Schema.String,
  npm: Schema.optional(Schema.String),
  models: Schema.Record(Schema.String, Model)
});
export class Service extends Context.Service()("@closedcode/ModelsDev") {}
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const fs = yield* AppFileSystem.Service;
  const loadFromDisk = Flag.CLOSEDCODE_MODELS_PATH ? fs.readJson(Flag.CLOSEDCODE_MODELS_PATH).pipe(Effect.catch(() => Effect.succeed(undefined)), Effect.map(v => v)) : Effect.succeed(undefined);
  const loadSnapshot = Effect.tryPromise({
    // Generated at build time.
    try: () => import("./models-snapshot.js").then(m => m.snapshot),
    catch: () => undefined
  }).pipe(Effect.catch(() => Effect.succeed(undefined)));
  const populate = Effect.gen(function* () {
    const fromDisk = yield* loadFromDisk;
    if (fromDisk) return fromDisk;
    return (yield* loadSnapshot) ?? {};
  }).pipe(Effect.withSpan("ModelsDev.populate"), Effect.orDie);
  const [cachedGet, invalidate] = yield* Effect.cachedInvalidateWithTTL(populate, Duration.infinity);
  return Service.of({
    get: () => cachedGet,
    refresh: () => invalidate
  });
}));
export const defaultLayer = layer.pipe(Layer.provide(AppFileSystem.defaultLayer));
export * as ModelsDev from "./models.js";