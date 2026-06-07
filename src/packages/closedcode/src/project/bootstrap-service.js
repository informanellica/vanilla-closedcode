import { Context } from "effect";
export class Service extends Context.Service()("@closedcode/InstanceBootstrap") {}
export * as InstanceBootstrap from "./bootstrap-service.js";