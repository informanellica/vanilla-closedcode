/** @file Event-type registry for the bus: defines event shapes and produces Zod / Effect schema payloads from them. */
import z from "zod";
import { Schema } from "effect";
import { zodObject } from "#util/effect-zod.js";
const registry = new Map();
/**
 * Register an event type with its property schema and remember it in the registry.
 * @param {string} type - Unique event type identifier (e.g. "server.instance.disposed").
 * @param {*} properties - Effect Schema describing the event's `properties` shape.
 * @returns {{type: string, properties: *}} The registered event definition.
 */
export function define(type, properties) {
  const result = {
    type,
    properties
  };
  registry.set(type, result);
  return result;
}
/**
 * Build Zod object schemas for every registered event, each annotated with an `Event.<type>` ref.
 * @returns {Array<Object>} Array of Zod object schemas, one per registered event type.
 */
export function payloads() {
  return registry.entries().map(([type, def]) => {
    return z.object({
      id: z.string(),
      type: z.literal(type),
      properties: zodObject(def.properties)
    }).meta({
      ref: `Event.${def.type}`
    });
  }).toArray();
}
/**
 * Build Effect `Schema.Struct` schemas for every registered event, each annotated with an `Event.<type>` identifier.
 * @returns {Array<Object>} Array of Effect Schema structs, one per registered event type.
 */
export function effectPayloads() {
  return registry.entries().map(([type, def]) => Schema.Struct({
    id: Schema.String,
    type: Schema.Literal(type),
    properties: def.properties
  }).annotate({
    identifier: `Event.${type}`
  })).toArray();
}
export * as BusEvent from "./bus-event.js";