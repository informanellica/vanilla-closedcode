/** @file Aggregates the v2 HTTP API handler groups (session + message) into a single Layer backed by the SessionV2 service. */
import { SessionV2 } from "#v2/session.js";
import { Layer } from "effect";
import { messageHandlers } from "./v2/message.js";
import { sessionHandlers } from "./v2/session.js";
/**
 * Combined v2 handlers layer: merges the v2 session and message handler groups and provides the SessionV2 default layer.
 * @type {Object}
 */
export const v2Handlers = Layer.mergeAll(sessionHandlers, messageHandlers).pipe(Layer.provide(SessionV2.defaultLayer));