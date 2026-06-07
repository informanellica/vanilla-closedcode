import { Flag } from "core/flag/flag";
function mimeToModality(mime) {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  if (mime === "application/pdf") return "pdf";
  return undefined;
}
export const OUTPUT_TOKEN_MAX = Flag.CLOSEDCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX || 32_000;
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
export function temperature(model) {
  if (!model.capabilities.temperature) return undefined;
  return 0;
}
export function topP(_model) {
  return undefined;
}
export function topK(_model) {
  return undefined;
}
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
export function options(input) {
  return {
    ...(input.providerOptions ?? {}),
    providerOptions: providerOptions(input.model, input.providerOptions ?? {})
  };
}
export function smallOptions(model) {
  return options({
    model,
    sessionID: "",
    providerOptions: {}
  });
}
export function providerOptions(_model, options) {
  return {
    openaiCompatible: options
  };
}
export function maxOutputTokens(model) {
  return Math.min(model.limit.output || OUTPUT_TOKEN_MAX, OUTPUT_TOKEN_MAX);
}
export function schema(_model, schema) {
  return schema;
}
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