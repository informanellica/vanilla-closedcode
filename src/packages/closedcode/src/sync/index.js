import z from "zod";
import { Database } from "@/storage/db.js";
import { eq } from "drizzle-orm";
import { GlobalBus } from "@/bus/global.js";
import { Bus as ProjectBus } from "@/bus/index.js";
import { BusEvent } from "@/bus/bus-event.js";
import { EventSequenceTable, EventTable } from "./event.sql.js";
import { EventID } from "./schema.js";
import { Flag } from "core/flag/flag";
import { Context, Effect, Layer, Schema as EffectSchema } from "effect";
import { zodObject } from "@/util/effect-zod.js";
import { makeRuntime } from "@/effect/run-service.js";
import { serviceUse } from "@/effect/service-use.js";
import { InstanceState } from "@/effect/instance-state.js";

// Keep `Event["data"]` mutable because projectors mutate the persisted shape
// when writing to the database. Bus payloads (`Properties`) stay readonly —
// subscribers only read.

export class Service extends Context.Service()("@closedcode/SyncEvent") {}
export const layer = Layer.effect(Service)(Effect.gen(function* () {
  const replay = Effect.fn("SyncEvent.replay")(function* (event, options) {
    const def = registry.get(event.type);
    if (!def) {
      throw new Error(`Unknown event type: ${event.type}`);
    }
    const row = Database.use(db => db.select({
      seq: EventSequenceTable.seq
    }).from(EventSequenceTable).where(eq(EventSequenceTable.aggregate_id, event.aggregateID)).get());
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
    process(def, event, {
      publish,
      context
    });
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

    // Note that this is an "immediate" transaction which is critical.
    // We need to make sure we can safely read and write with nothing
    // else changing the data from under us
    Database.transaction(tx => {
      const id = EventID.ascending();
      const row = tx.select({
        seq: EventSequenceTable.seq
      }).from(EventSequenceTable).where(eq(EventSequenceTable.aggregate_id, agg)).get();
      const seq = row?.seq != null ? row.seq + 1 : 0;
      const event = {
        id,
        seq,
        aggregateID: agg,
        data
      };
      process(def, event, {
        publish,
        context
      });
    }, {
      behavior: "immediate"
    });
  });
  const remove = Effect.fn("SyncEvent.remove")(function* (aggregateID) {
    Database.transaction(tx => {
      tx.delete(EventSequenceTable).where(eq(EventSequenceTable.aggregate_id, aggregateID)).run();
      tx.delete(EventTable).where(eq(EventTable.aggregate_id, aggregateID)).run();
    });
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
function process(def, event, options) {
  if (projectors == null) {
    throw new Error("No projectors available. Call `SyncEvent.init` to install projectors");
  }
  const projector = projectors.get(def);
  if (!projector) {
    throw new Error(`Projector not found for event: ${def.type}`);
  }

  // idempotent: need to ignore any events already logged

  Database.transaction(tx => {
    projector(tx, event.data, event);
    if (Flag.CLOSEDCODE_EXPERIMENTAL_WORKSPACES) {
      tx.insert(EventSequenceTable).values({
        aggregate_id: event.aggregateID,
        seq: event.seq
      }).onConflictDoUpdate({
        target: EventSequenceTable.aggregate_id,
        set: {
          seq: event.seq
        }
      }).run();
      tx.insert(EventTable).values({
        id: event.id,
        seq: event.seq,
        aggregate_id: event.aggregateID,
        type: versionedType(def.type, def.version),
        data: event.data
      }).run();
    }
    Database.effect(() => {
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
export function replay(event, options) {
  return runtime.runSync(sync => sync.replay(event, options));
}
export function replayAll(events, options) {
  return runtime.runSync(sync => sync.replayAll(events, options));
}
export function run(def, data, options) {
  return runtime.runSync(sync => sync.run(def, data, options));
}
export function remove(aggregateID) {
  return runtime.runSync(sync => sync.remove(aggregateID));
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