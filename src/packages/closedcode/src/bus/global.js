/** @file Process-wide singleton EventEmitter that relays bus events across instances, assigning each payload a stable id. */
import { EventEmitter } from "events";
import { Identifier } from "#id/id.js";
/**
 * EventEmitter that ensures every emitted event's payload has an `id` before dispatching.
 * If the payload lacks an `id`, it reuses an originating sync event's id or generates a new ascending one.
 */
class GlobalBusEmitter extends EventEmitter {
  /**
   * Emit an event, backfilling `event.payload.id` when missing.
   * @param {string} eventName - Name of the event channel to emit on.
   * @param {Object} event - Event object whose `payload` may be mutated to receive an `id`.
   * @returns {boolean} True if the event had listeners, otherwise false.
   */
  emit(eventName, event) {
    if (event.payload && typeof event.payload === "object" && !("id" in event.payload)) {
      event.payload.id = event.payload.syncEvent?.id ?? Identifier.create("evt", "ascending");
    }
    return super.emit(eventName, event);
  }
}
/** Shared process-wide bus emitter used to relay events across instances. */
export const GlobalBus = new GlobalBusEmitter();