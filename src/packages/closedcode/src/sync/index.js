import z from "zod";
import { Database } from "#storage/db.js";
import { GlobalBus } from "#bus/global.js";
import { Bus as ProjectBus } from "#bus/index.js";
import { BusEvent } from "#bus/bus-event.js";
import { EventID } from "./schema.js";
import { Flag } from "core/flag/flag";
import { Context, Effect, Layer, Schema as EffectSchema } from "effect";
import { zodObject } from "#util/effect-zod.js";
import { makeRuntime } from "#effect/run-service.js";
import { serviceUse } from "#effect/service-use.js";
import { InstanceState } from "#effect/instance-state.js";

// Keep `Event["data"]` mutable because projectors mutate the persisted shape
// when writing to the database. Bus payloads (`Properties`) stay readonly —
// subscribers only read.

// Sequelize call-site conventions (ORM migration S3): Database.useAsync /
// transactionAsync hand a handle { models, sequelize, tx }; every model call
// passes { transaction: h.tx }. Projectors now receive that handle (instead of
// the drizzle tx) and may be async — `process` awaits them.
const plain = row => (row == null ? undefined : row.get({ plain: true }));

export class Service extends Context.Service()("@closedcode/SyncEvent") {}
export const layer = Layer.effect(Service)(Effect.gen(function* () {
  const replay = Effect.fn("SyncEvent.replay")(function* (event, options) {
    const def = registry.get(event.type);
    if (!def) {
      throw new Error(`Unknown event type: ${event.type}`);
    }
    const row = yield* Effect.promise(() => Database.useAsync(async h => plain(await h.models.EventSequence.findOne({
      where: { aggregate_id: event.aggregateID },
      transaction: h.tx
    }))));
    const latest = row?.seq ?? -1;
    if (event.seq <= latest) return;
    const expected = latest + 1;
    if (event.seq !== expected) {
      throw new Error(`Sequence mismatch for aggregate "${event.aggregateID}": expected ${expected}, got ${event.seq}`);
    }
    const publish = !!options?.publish;
    const context = publish ? {
      instance: yield* InstanceState.context,
      workspace: yield* InstanceState.workspaceID
    } : undefined;
    yield* Effect.promise(() => process(def, event, {
      publish,
      context
    }));
  });
  const replayAll = Effect.fn("SyncEvent.replayAll")(function* (events, options) {
    const source = events[0]?.aggregateID;
    if (!source) return undefined;
    if (events.some(item => item.aggregateID !== source)) {
      throw new Error("Replay events must belong to the same session");
    }
    const start = events[0].seq;
    for (const [i, item] of events.entries()) {
      const seq = start + i;
      if (item.seq !== seq) {
        throw new Error(`Replay sequence mismatch at index ${i}: expected ${seq}, got ${item.seq}`);
      }
    }
    for (const item of events) {
      yield* replay(item, options);
    }
    return source;
  });
  const run = Effect.fn("SyncEvent.run")(function* (def, data, options) {
    const agg = data[def.aggregate];
    // This should never happen: we've enforced it via typescript in
    // the definition
    if (agg == null) {
      throw new Error(`SyncEvent.run: "${def.aggregate}" required but not found: ${JSON.stringify(data)}`);
    }
    if (def.version !== versions.get(def.type)) {
      throw new Error(`SyncEvent.run: running old versions of events is not allowed: ${def.type}`);
    }
    const {
      publish = true
    } = options || {};
    const context = publish ? {
      instance: yield* InstanceState.context,
      workspace: yield* InstanceState.workspaceID
    } : undefined;

    // Note that the original sync layer used an "immediate" transaction here
    // which is critical: we need to make sure we can safely read and write
    // with nothing else changing the data from under us. transactionAsync does
    // not expose the behavior option; the sqlite connection pool is capped at
    // a single connection, which serializes writers within this process.
    yield* Effect.promise(() => Database.transactionAsync(async h => {
      const id = EventID.ascending();
      const row = plain(await h.models.EventSequence.findOne({
        where: { aggregate_id: agg },
        transaction: h.tx
      }));
      const seq = row?.seq != null ? row.seq + 1 : 0;
      const event = {
        id,
        seq,
        aggregateID: agg,
        data
      };
      await process(def, event, {
        publish,
        context
      });
    }));
  });
  const remove = Effect.fn("SyncEvent.remove")(function* (aggregateID) {
    yield* Effect.promise(() => Database.transactionAsync(async h => {
      await h.models.EventSequence.destroy({ where: { aggregate_id: aggregateID }, transaction: h.tx });
      await h.models.Event.destroy({ where: { aggregate_id: aggregateID }, transaction: h.tx });
    }));
  });
  return Service.of({
    run,
    replay,
    replayAll,
    remove
  });
}));
export const defaultLayer = layer;
export const use = serviceUse(Service);
const runtime = makeRuntime(Service, defaultLayer);
export const registry = new Map();
let projectors;
const versions = new Map();
let frozen = false;
let convertEvent;
export function reset() {
  frozen = false;
  projectors = undefined;
  convertEvent = (_, data) => data;
}
export function init(input) {
  projectors = new Map(input.projectors);

  // Install all the latest event defs to the bus. We only ever emit
  // latest versions from code, and keep around old versions for
  // replaying. Replaying does not go through the bus, and it
  // simplifies the bus to only use unversioned latest events
  for (let [type, version] of versions.entries()) {
    let def = registry.get(versionedType(type, version));
    BusEvent.define(def.type, def.properties);
  }

  // Freeze the system so it clearly errors if events are defined
  // after `init` which would cause bugs
  frozen = true;
  convertEvent = input.convertEvent ?? ((_, data) => data);
}
export function versionedType(type, version) {
  return version ? `${type}.${version}` : type;
}
export function define(input) {
  if (frozen) {
    throw new Error("Error defining sync event: sync system has been frozen");
  }
  const def = {
    type: input.type,
    version: input.version,
    aggregate: input.aggregate,
    schema: input.schema,
    properties: input.busSchema ?? input.schema
  };
  versions.set(def.type, Math.max(def.version, versions.get(def.type) || 0));
  registry.set(versionedType(def.type, def.version), def);
  return def;
}
export function project(def, func) {
  return [def, func];
}
async function process(def, event, options) {
  if (projectors == null) {
    throw new Error("No projectors available. Call `SyncEvent.init` to install projectors");
  }
  const projector = projectors.get(def);
  if (!projector) {
    throw new Error(`Projector not found for event: ${def.type}`);
  }

  // idempotent: need to ignore any events already logged

  await Database.transactionAsync(async h => {
    await projector(h, event.data, event);
    if (Flag.CLOSEDCODE_EXPERIMENTAL_WORKSPACES) {
      await h.models.EventSequence.upsert({
        aggregate_id: event.aggregateID,
        seq: event.seq
      }, { transaction: h.tx });
      await h.models.Event.create({
        id: event.id,
        seq: event.seq,
        aggregate_id: event.aggregateID,
        type: versionedType(def.type, def.version),
        data: event.data
      }, { transaction: h.tx });
    }
    Database.effectAsync(() => {
      if (options?.publish) {
        if (!options.context?.instance) {
          throw new Error("SyncEvent.process: publish requires instance context");
        }
        const result = convertEvent(def.type, event.data);
        const publish = data => ProjectBus.publish(def, data, {
          id: event.id
        });
        if (result instanceof Promise) {
          void result.then(publish);
        } else {
          void publish(result);
        }
        GlobalBus.emit("event", {
          directory: options.context.instance.directory,
          project: options.context.instance.project.id,
          workspace: options.context.workspace,
          payload: {
            type: "sync",
            syncEvent: {
              type: versionedType(def.type, def.version),
              ...event
            }
          }
        });
      }
    });
  });
}
// The service effects now cross async boundaries (Sequelize layer), so the
// module-level wrappers return Promises (runSync would die on the first
// suspension). Callers were synchronous before — sync→async signature change.
export function replay(event, options) {
  return runtime.runPromise(sync => sync.replay(event, options));
}
export function replayAll(events, options) {
  return runtime.runPromise(sync => sync.replayAll(events, options));
}
export function run(def, data, options) {
  return runtime.runPromise(sync => sync.run(def, data, options));
}
export function remove(aggregateID) {
  return runtime.runPromise(sync => sync.remove(aggregateID));
}
export function payloads() {
  return registry.entries().map(([type, def]) => {
    return z.object({
      type: z.literal("sync"),
      name: z.literal(type),
      id: z.string(),
      seq: z.number(),
      aggregateID: z.literal(def.aggregate),
      data: zodObject(def.schema)
    }).meta({
      ref: `SyncEvent.${def.type}`
    });
  }).toArray();
}
export function effectPayloads() {
  return registry.entries().map(([type, def]) => EffectSchema.Struct({
    type: EffectSchema.Literal("sync"),
    name: EffectSchema.Literal(type),
    id: EffectSchema.String,
    seq: EffectSchema.Finite,
    aggregateID: EffectSchema.Literal(def.aggregate),
    data: def.schema
  }).annotate({
    identifier: `SyncEvent.${type}`
  })).toArray();
}
export * as SyncEvent from "./index.js";