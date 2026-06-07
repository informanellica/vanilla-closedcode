import { HttpApi, OpenApi } from "effect/unstable/httpapi";
import { MessageGroup } from "./v2/message.js";
import { SessionGroup } from "./v2/session.js";
export const V2Api = HttpApi.make("v2").add(SessionGroup).add(MessageGroup).annotateMerge(OpenApi.annotations({
  title: "closedcode experimental HttpApi",
  version: "0.0.1",
  description: "Experimental HttpApi surface for selected instance routes."
}));