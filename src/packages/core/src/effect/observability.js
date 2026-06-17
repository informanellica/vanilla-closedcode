/** @file Observability wiring: when an OTLP endpoint is configured, exports logs and traces via OpenTelemetry; otherwise falls back to the plain Effect logger layer. */
import { Effect, Layer, Logger } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { OtlpLogger, OtlpSerialization } from "effect/unstable/observability";
import * as EffectLogger from "./logger.js";
import { Flag } from "../flag/flag.js";
import { InstallationChannel, InstallationVersion } from "../installation/version.js";
import { ensureProcessMetadata } from "../util/closedcode-process.js";
const base = Flag.OTEL_EXPORTER_OTLP_ENDPOINT;
/** Whether OTLP observability export is enabled (true when an OTLP endpoint is configured). */
export const enabled = !!base;
const processID = crypto.randomUUID();
const headers = Flag.OTEL_EXPORTER_OTLP_HEADERS ? Flag.OTEL_EXPORTER_OTLP_HEADERS.split(",").reduce((acc, x) => {
  const [key, ...value] = x.split("=");
  acc[key] = value.join("=");
  return acc;
}, {}) : undefined;
/**
 * Build the OpenTelemetry resource descriptor for this process, combining
 * service identity, installation channel/version, process metadata, and any
 * attributes parsed from the OTEL_RESOURCE_ATTRIBUTES environment variable.
 * @returns {Object} A resource object with `serviceName`, `serviceVersion`, and `attributes`.
 */
export function resource() {
  const processMetadata = ensureProcessMetadata("main");
  const attributes = (() => {
    const value = process.env.OTEL_RESOURCE_ATTRIBUTES;
    if (!value) return {};
    try {
      return Object.fromEntries(value.split(",").map(entry => {
        const index = entry.indexOf("=");
        if (index < 1) throw new Error("Invalid OTEL_RESOURCE_ATTRIBUTES entry");
        return [decodeURIComponent(entry.slice(0, index)), decodeURIComponent(entry.slice(index + 1))];
      }));
    } catch {
      return {};
    }
  })();
  return {
    serviceName: "closedcode",
    serviceVersion: InstallationVersion,
    attributes: {
      ...attributes,
      "deployment.environment.name": InstallationChannel,
      "closedcode.client": Flag.CLOSEDCODE_CLIENT,
      "closedcode.process_role": processMetadata.processRole,
      "closedcode.run_id": processMetadata.runID,
      "service.instance.id": processID
    }
  };
}
/**
 * Build the Effect Layer that logs via both the app logger and an OTLP log
 * exporter pointed at the configured endpoint.
 * @returns {Object} An Effect Layer providing the combined logger.
 */
function logs() {
  return Logger.layer([EffectLogger.logger, OtlpLogger.make({
    url: `${base}/v1/logs`,
    resource: resource(),
    headers
  })], {
    mergeWithExisting: false
  }).pipe(Layer.provide(OtlpSerialization.layerJson), Layer.provide(FetchHttpClient.layer));
}
/**
 * Lazily import the OpenTelemetry tracing dependencies, register an
 * AsyncLocalStorage context manager (so non-Effect spans nest correctly), and
 * build the Effect tracing Layer with a batched OTLP trace exporter.
 * @returns {Promise<Object>} A promise resolving to the Effect tracing Layer.
 */
const traces = async () => {
  const NodeSdk = await import("@effect/opentelemetry/NodeSdk");
  const OTLP = await import("@opentelemetry/exporter-trace-otlp-http");
  const SdkBase = await import("@opentelemetry/sdk-trace-base");

  // @effect/opentelemetry creates a NodeTracerProvider but never calls
  // register(), so the global @opentelemetry/api context manager stays
  // as the no-op default. Non-Effect code (like the AI SDK) that calls
  // tracer.startActiveSpan() relies on context.active() to find the
  // parent span - without a real context manager every span starts a
  // new trace. Registering AsyncLocalStorageContextManager fixes this.
  const {
    AsyncLocalStorageContextManager
  } = await import("@opentelemetry/context-async-hooks");
  const {
    context
  } = await import("@opentelemetry/api");
  const mgr = new AsyncLocalStorageContextManager();
  mgr.enable();
  context.setGlobalContextManager(mgr);
  return NodeSdk.layer(() => ({
    resource: resource(),
    spanProcessor: new SdkBase.BatchSpanProcessor(new OTLP.OTLPTraceExporter({
      url: `${base}/v1/traces`,
      headers
    }))
  }));
};
/**
 * The observability Layer: the plain logger Layer when no OTLP endpoint is set,
 * otherwise a merged Layer providing both OTLP tracing and OTLP logging.
 */
export const layer = !base ? EffectLogger.layer : Layer.unwrap(Effect.gen(function* () {
  const trace = yield* Effect.promise(traces);
  return Layer.mergeAll(trace, logs());
}));
/** Public observability handle bundling {@link enabled} and {@link layer}. */
export const Observability = {
  enabled,
  layer
};