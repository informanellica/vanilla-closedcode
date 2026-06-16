/**
 * @file Provider request-transform helpers. Adapts messages and request options
 * to a model's declared capabilities (filtering unsupported attachments, deriving
 * temperature/reasoning variants, capping output tokens) before a request is sent.
 * @module closedcode/provider/transform
 */
import { Flag } from "core/flag/flag";
/**
 * Map a MIME type to the modality category used by model capability checks.
 * @param {string} mime - The media type (e.g. "image/png", "application/pdf").
 * @returns {string} "image" | "audio" | "video" | "pdf", or undefined if unrecognized.
 */
function mimeToModality(mime) {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  if (mime === "application/pdf") return "pdf";
  return undefined;
}
/** Hard cap on output tokens (overridable via CLOSEDCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX). */
export const OUTPUT_TOKEN_MAX = Flag.CLOSEDCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX || 32_000;
/**
 * Filter message file parts down to modalities the model can actually accept,
 * dropping attachments whose MIME type maps to an unsupported (or unknown) modality.
 * @param {Array} msgs - The chat messages.
 * @param {Object} model - The resolved model (its `capabilities.input` is consulted).
 * @param {*} _options - Unused; reserved for future per-request options.
 * @returns {Array} The messages with unsupported file parts removed.
 */
export function message(msgs, model, _options) {
  return msgs.map(msg => {
    if (!Array.isArray(msg.content)) return msg;
    return {
      ...msg,
      content: msg.content.filter(part => {
        if (part.type !== "file") return true;
        const modality = mimeToModality(part.mediaType);
        if (!modality) return false;
        return model.capabilities.input[modality];
      })
    };
  });
}
/**
 * Resolve the temperature to send for a model: 0 when supported, undefined otherwise.
 * @param {Object} model - The resolved model (its `capabilities.temperature` is consulted).
 * @returns {number} 0 if temperature is supported; otherwise undefined.
 */
export function temperature(model) {
  if (!model.capabilities.temperature) return undefined;
  return 0;
}
/**
 * Resolve the top-p value to send for a model (currently always unset).
 * @param {Object} _model - The resolved model (unused).
 * @returns {*} undefined.
 */
export function topP(_model) {
  return undefined;
}
/**
 * Resolve the top-k value to send for a model (currently always unset).
 * @param {Object} _model - The resolved model (unused).
 * @returns {*} undefined.
 */
export function topK(_model) {
  return undefined;
}
/**
 * Build the set of reasoning-effort variants ("low"/"medium"/"high") for a model
 * that supports reasoning; returns an empty object when reasoning is unsupported.
 * @param {Object} model - The resolved model (its `capabilities.reasoning` is consulted).
 * @returns {Object} A map of variant name to options, or `{}`.
 */
export function variants(model) {
  if (!model.capabilities.reasoning) return {};
  // Variant options get merged into the chat.params options bag, which is
  // then wrapped by providerOptions() as `{ openaiCompatible: <options> }`.
  // @ai-sdk/openai-compatible's getArgs picks `reasoningEffort` out of that
  // namespace and emits `reasoning_effort` in the request body, so emit the
  // camelCase key at the top level here.
  return {
    low: { reasoningEffort: "low" },
    medium: { reasoningEffort: "medium" },
    high: { reasoningEffort: "high" },
  };
}
/**
 * Build the request options bag, spreading the caller's provider options and
 * nesting them under the `providerOptions` namespace via {@link providerOptions}.
 * @param {Object} input - `{model, providerOptions}` — the model and any caller-supplied provider options.
 * @returns {Object} The combined options object.
 */
export function options(input) {
  return {
    ...(input.providerOptions ?? {}),
    providerOptions: providerOptions(input.model, input.providerOptions ?? {})
  };
}
/**
 * Build the default options for the small/auxiliary model (empty provider options).
 * @param {Object} model - The resolved model.
 * @returns {Object} The options object from {@link options}.
 */
export function smallOptions(model) {
  return options({
    model,
    sessionID: "",
    providerOptions: {}
  });
}
/**
 * Wrap provider options under the `openaiCompatible` namespace expected by the
 * @ai-sdk/openai-compatible provider.
 * @param {Object} _model - The resolved model (unused).
 * @param {Object} options - The provider options to namespace.
 * @returns {Object} `{openaiCompatible: options}`.
 */
export function providerOptions(_model, options) {
  return {
    openaiCompatible: options
  };
}
/**
 * Compute the max output tokens for a request: the model's output limit clamped
 * to {@link OUTPUT_TOKEN_MAX} (falling back to that cap when no limit is set).
 * @param {Object} model - The resolved model (its `limit.output` is consulted).
 * @returns {number} The capped max output token count.
 */
export function maxOutputTokens(model) {
  return Math.min(model.limit.output || OUTPUT_TOKEN_MAX, OUTPUT_TOKEN_MAX);
}
/**
 * Transform an output JSON schema for a model (currently a pass-through).
 * @param {Object} _model - The resolved model (unused).
 * @param {Object} schema - The schema to transform.
 * @returns {Object} The schema, unchanged.
 */
export function schema(_model, schema) {
  return schema;
}
/** Aggregated namespace of the provider-transform helpers. */
export const ProviderTransform = {
  OUTPUT_TOKEN_MAX,
  maxOutputTokens,
  message,
  options,
  providerOptions,
  schema,
  smallOptions,
  temperature,
  topK,
  topP,
  variants
};