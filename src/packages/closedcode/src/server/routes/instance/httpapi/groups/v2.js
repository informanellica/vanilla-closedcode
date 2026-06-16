/** @file Aggregates the experimental v2 HttpApi by combining the v2 session and message route groups. */
import { HttpApi, OpenApi } from "effect/unstable/httpapi";
import { MessageGroup } from "./v2/message.js";
import { SessionGroup } from "./v2/session.js";
/** Experimental v2 HttpApi surface, composed of the v2 session group and the v2 message group. */
export const V2Api = HttpApi.make("v2").add(SessionGroup).add(MessageGroup).annotateMerge(OpenApi.annotations({
  title: "closedcode experimental HttpApi",
  version: "0.0.1",
  description: "Experimental HttpApi surface for selected instance routes."
}));