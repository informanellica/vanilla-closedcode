import { EventEmitter } from "events";
import { Identifier } from "#id/id.js";
class GlobalBusEmitter extends EventEmitter {
  emit(eventName, event) {
    if (event.payload && typeof event.payload === "object" && !("id" in event.payload)) {
      event.payload.id = event.payload.syncEvent?.id ?? Identifier.create("evt", "ascending");
    }
    return super.emit(eventName, event);
  }
}
export const GlobalBus = new GlobalBusEmitter();