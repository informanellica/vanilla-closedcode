import z from "zod";
import { Schema } from "effect";
import { zodObject } from "#util/effect-zod.js";
const registry = new Map();
export function define(type, properties) {
  const result = {
    type,
    properties
  };
  registry.set(type, result);
  return result;
}
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