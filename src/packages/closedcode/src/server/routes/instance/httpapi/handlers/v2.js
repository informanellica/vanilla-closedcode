import { SessionV2 } from "#v2/session.js";
import { Layer } from "effect";
import { messageHandlers } from "./v2/message.js";
import { sessionHandlers } from "./v2/session.js";
export const v2Handlers = Layer.mergeAll(sessionHandlers, messageHandlers).pipe(Layer.provide(SessionV2.defaultLayer));