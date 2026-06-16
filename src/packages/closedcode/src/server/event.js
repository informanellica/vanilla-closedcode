/** @file Server lifecycle bus events: defines the Connected and Disposed events published on the global bus. */
import { BusEvent } from "#bus/bus-event.js";
import { Schema } from "effect";
/**
 * Server lifecycle events published on the bus.
 * - Connected: emitted when the server has connected ("server.connected").
 * - Disposed: emitted on global teardown ("global.disposed").
 * @type {{Connected: BusEvent, Disposed: BusEvent}}
 */
export const Event = {
  Connected: BusEvent.define("server.connected", Schema.Struct({})),
  Disposed: BusEvent.define("global.disposed", Schema.Struct({}))
};