/** @file Lightweight Effect Context tag for the instance bootstrap service, importable without pulling in the full bootstrap implementation graph. */
import { Context } from "effect";

/** Effect Context tag identifying the instance bootstrap service. */
export class Service extends Context.Service()("@closedcode/InstanceBootstrap") {}
export * as InstanceBootstrap from "./bootstrap-service.js";