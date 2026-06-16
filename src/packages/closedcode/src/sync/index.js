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

/**
 * @file Event-sourcing sync layer: defines versioned sync events, appends them
 * to per-aggregate sequences in the database, runs registered projectors, and
 * supports deterministic replay. Published events are mirrored to the project
 * and global buses.
 */

// Keep `Event["data"]` mutable because projectors mutate the persisted shape
// when writing to the database. Bus payloads (`Properties`) stay readonly —
// subscribers only read.

// Sequelize call-site conventions (ORM migration S3): Database.useAsync /
// transactionAsync hand a handle { models, sequelize, tx }; every model call
// passes { transaction: h.tx }. Projectors now receive that handle (instead of
// the drizzle tx) and may be async — `process` awaits them.
/**
 * Convert a Sequelize model instance into a plain object, or undefined when null.
 * @param {Object} row - The Sequelize model instance (or null).
 * @returns {Object} The plain object, or undefined.
 */
const plain = row => (row == null ? undefined : row.get({ plain: true }));

/** Effect Context service tag for the sync-event service. */
export class Service extends Context.Service()("@closedcode/SyncEvent") {}
/**
 * Layer building the sync-event service, exposing run/replay/replayAll/remove
 * operations over the database event log.
 */
export const layer = Layer.effect(Service)(Effect.gen(function* () {
  /**
   * Re-apply a single persisted event, enforcing strict per-aggregate sequence
   * ordering (the event's seq must be exactly one past the latest stored seq).
   * @param {Object} event - The event {type, seq, aggregateID, data}.
   * @param {Object} options - Optional settings; `publish` mirrors to the bus.
   * @returns {Effect} Effect that completes once the event is replayed.
   */
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
  /**
   * Replay a contiguous run of events for a single aggregate, validating that
   * they all share one aggregate and form an unbroken sequence.
   * @param {Array<Object>} events - The events to replay, in sequence order.
   * @param {Object} options - Optional settings passed through to replay.
   * @returns {Effect} Effect resolving to the aggregate ID (or undefined if empty).
   */
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
  /**
   * Append a new event for a definition: within an IMMEDIATE transaction, read
   * the aggregate's latest sequence, assign the next seq and a fresh ID, and
   * run the projector. Rejects stale event versions.
   * @param {Object} def - The event definition {type, version, aggregate}.
   * @param {Object} data - The event payload; must contain the aggregate key.
   * @param {Object} options - Optional settings; `publish` (default true) mirrors to the bus.
   * @returns {Effect} Effect that completes once the event is appended.
   */
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

    // The original sync layer used an IMMEDIATE transaction here, which is
    // critical: reading the latest seq and writing the next one must hold the
    // write lock so two concurrent appenders can't both read the same seq.
    // transactionAsync DOES accept { behavior: "immediate" }; pass it so SQLite
    // takes the write lock at BEGIN instead of the default DEFERRED.
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
    }, { behavior: "immediate" }));
  });
  /**
   * Delete an aggregate's sequence counter and all of its stored events.
   * @param {string} aggregateID - The aggregate whose event log to remove.
   * @returns {Effect} Effect that completes once the rows are deleted.
   */
  const remove = Effect.fn("SyncEvent.remove")(function* (aggregateID) {
    yield* Effect.promise(() => Database.transactionAsync(async h => {
      await h.models.EventSequence.destroy({ where: { aggregate_id: aggregateID }, transaction: h.tx });
      await h.models.Event.destroy({ where: { aggregate_id: aggregateID }, transaction: h.tx });
    }, { behavior: "immediate" }));
  });
  return Service.of({
    run,
    replay,
    replayAll,
    remove
  });
}));
/** The sync-event default layer. */
export const defaultLayer = layer;
/** Helper to run an effect with the sync-event service provided. */
export const use = serviceUse(Service);
const runtime = makeRuntime(Service, defaultLayer);
/** Registry of event definitions keyed by versioned type string. */
export const registry = new Map();
let projectors;
const versions = new Map();
let frozen = false;
let convertEvent;
/**
 * Reset the sync system: unfreeze it, clear installed projectors, and restore
 * the identity event converter.
 * @returns {void}
 */
export function reset() {
  frozen = false;
  projectors = undefined;
  convertEvent = (_, data) => data;
}
/**
 * Install projectors and the bus event definitions for the latest version of
 * each event, then freeze the system so no further events can be defined.
 * @param {Object} input - {projectors, convertEvent}.
 * @returns {void}
 */
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
/**
 * Build the registry key for an event type at a given version (the bare type
 * when version is falsy).
 * @param {string} type - The event type.
 * @param {number} version - The event version.
 * @returns {string} The versioned type string.
 */
export function versionedType(type, version) {
  return version ? `${type}.${version}` : type;
}
/**
 * Define and register a sync event. Tracks the highest known version per type
 * and rejects definitions after the system has been frozen.
 * @param {Object} input - {type, version, aggregate, schema, busSchema}.
 * @returns {Object} The created event definition.
 */
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
/**
 * Pair an event definition with its projector function for installation via init.
 * @param {Object} def - The event definition.
 * @param {Function} func - The projector function.
 * @returns {Array} A [def, func] tuple.
 */
export function project(def, func) {
  return [def, func];
}
/**
 * Apply an event: run its projector inside the (ambient) transaction,
 * optionally persist it to the event log, and queue a commit-deferred publish
 * to the project and global buses.
 * @param {Object} def - The event definition.
 * @param {Object} event - The event {id, seq, aggregateID, data}.
 * @param {Object} options - {publish, context}.
 * @returns {Promise<void>} Promise that resolves once the event is processed.
 */
async function process(def, event, options) {
  if (projectors == null) {
    throw new Error("No projectors available. Call `SyncEvent.init` to install projectors");
  }
  const projector = projectors.get(def);
  if (!projector) {
    throw new Error(`Projector not found for event: ${def.type}`);
  }

  // idempotent: need to ignore any events already logged

  // process() is only ever called from inside the IMMEDIATE append transaction
  // above (via `await process(...)`), so transactionAsync sees an ambient
  // transaction and reuses its handle — this nested call inherits the write
  // lock and a behavior option here would be ignored.
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
/**
 * Run-and-await a single event replay through the service runtime.
 * @param {Object} event - The event to replay.
 * @param {Object} options - Optional replay settings.
 * @returns {Promise<void>} Promise that resolves once replayed.
 */
export function replay(event, options) {
  return runtime.runPromise(sync => sync.replay(event, options));
}
/**
 * Run-and-await replay of a contiguous run of events through the service runtime.
 * @param {Array<Object>} events - The events to replay.
 * @param {Object} options - Optional replay settings.
 * @returns {Promise<*>} Promise resolving to the aggregate ID (or undefined).
 */
export function replayAll(events, options) {
  return runtime.runPromise(sync => sync.replayAll(events, options));
}
/**
 * Run-and-await appending a new event through the service runtime.
 * @param {Object} def - The event definition.
 * @param {Object} data - The event payload.
 * @param {Object} options - Optional settings (e.g. publish).
 * @returns {Promise<void>} Promise that resolves once appended.
 */
export function run(def, data, options) {
  return runtime.runPromise(sync => sync.run(def, data, options));
}
/**
 * Run-and-await removal of an aggregate's event log through the service runtime.
 * @param {string} aggregateID - The aggregate to remove.
 * @returns {Promise<void>} Promise that resolves once removed.
 */
export function remove(aggregateID) {
  return runtime.runPromise(sync => sync.remove(aggregateID));
}
/**
 * Build the Zod schemas for every registered event's bus payload.
 * @returns {Array<Object>} An array of Zod object schemas.
 */
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
/**
 * Build the Effect Schema structs for every registered event's bus payload.
 * @returns {Array<Object>} An array of Effect Schema structs.
 */
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