/**
 * @file Provider error normalization. Classifies provider/LLM API errors into a
 * common shape (e.g. context_overflow vs api_error), extracts human-readable
 * messages from heterogeneous response bodies, and detects context-window
 * overflow across many providers via message-pattern matching.
 * @module closedcode/provider/error
 */
import { STATUS_CODES } from "http";
import { iife } from "#util/iife.js";
// Adapted from overflow detection patterns in:
// https://github.com/badlogic/pi-mono/blob/main/packages/ai/src/utils/overflow.ts
const OVERFLOW_PATTERNS = [/prompt is too long/i,
// Anthropic
/input is too long for requested model/i,
// Amazon Bedrock
/exceeds the context window/i,
// OpenAI (Completions + Responses API message text)
/input token count.*exceeds the maximum/i,
// Google (Gemini)
/maximum prompt length is \d+/i,
// xAI (Grok)
/reduce the length of the messages/i,
// Groq
/maximum context length is \d+ tokens/i,
// OpenRouter, DeepSeek, vLLM
/exceeds the limit of \d+/i,
// GitHub Copilot
/exceeds the available context size/i,
// llama.cpp server
/greater than the context length/i,
// LM Studio
/context window exceeds limit/i,
// MiniMax
/exceeded model token limit/i,
// Kimi For Coding, Moonshot
/context[_ ]length[_ ]exceeded/i,
// Generic fallback
/request entity too large/i,
// HTTP 413
/context length is only \d+ tokens/i,
// vLLM
/input length.*exceeds.*context length/i,
// vLLM
/prompt too long; exceeded (?:max )?context length/i,
// Ollama explicit overflow error
/too large for model with \d+ maximum context length/i,
// Mistral
/model_context_window_exceeded/i // z.ai non-standard finish_reason surfaced as error text
];
/**
 * Decide whether an OpenAI-style API error should be retried, treating 404 as
 * retryable because OpenAI sometimes 404s models that are actually available.
 * @param {Object} e - The provider error (`statusCode`, `isRetryable`).
 * @returns {boolean} True when the request should be retried.
 */
function isOpenAiErrorRetryable(e) {
  const status = e.statusCode;
  if (!status) return e.isRetryable;
  // openai sometimes returns 404 for models that are actually available
  return status === 404 || e.isRetryable;
}

/**
 * Detect whether an error message indicates a context-window overflow, matching
 * the provider-specific {@link OVERFLOW_PATTERNS} plus bare 400/413 "(no body)"
 * responses from providers like Cerebras and Mistral.
 * @param {string} message - The error message text to test.
 * @returns {boolean} True when the message looks like a context overflow.
 */
// Providers not reliably handled in this function:
// - z.ai: can accept overflow silently (needs token-count/context-window checks)
function isOverflow(message) {
  if (OVERFLOW_PATTERNS.some(p => p.test(message))) return true;

  // Providers/status patterns handled outside of regex list:
  // - Cerebras: often returns "400 (no body)" / "413 (no body)"
  // - Mistral: often returns "400 (no body)" / "413 (no body)"
  return /^4(00|13)\s*(status code)?\s*\(no body\)/i.test(message);
}
/**
 * Build the best human-readable message for a provider error, falling back from
 * the error message to the response body, JSON error fields, or the HTTP status
 * text, and rewriting HTML gateway/proxy 401/403 pages into actionable guidance.
 * @param {string} providerID - The provider id (reserved for provider-specific handling).
 * @param {Object} e - The provider error (`message`, `responseBody`, `statusCode`).
 * @returns {string} A trimmed, human-readable error message.
 */
function message(providerID, e) {
  return iife(() => {
    const msg = e.message;
    if (msg === "") {
      if (e.responseBody) return e.responseBody;
      if (e.statusCode) {
        const err = STATUS_CODES[e.statusCode];
        if (err) return err;
      }
      return "Unknown error";
    }
    if (!e.responseBody || e.statusCode && msg !== STATUS_CODES[e.statusCode]) {
      return msg;
    }
    try {
      const body = JSON.parse(e.responseBody);
      // try to extract common error message fields
      const errMsg = body.message || body.error || body.error?.message;
      if (errMsg && typeof errMsg === "string") {
        return `${msg}: ${errMsg}`;
      }
    } catch {}

    // If responseBody is HTML (e.g. from a gateway or proxy error page),
    // provide a human-readable message instead of dumping raw markup
    if (/^\s*<!doctype|^\s*<html/i.test(e.responseBody)) {
      if (e.statusCode === 401) {
        return "Unauthorized: request was blocked by a gateway or proxy. Your authentication token may be missing or expired — try running `closedcode auth login <your provider URL>` to re-authenticate.";
      }
      if (e.statusCode === 403) {
        return "Forbidden: request was blocked by a gateway or proxy. You may not have permission to access this resource — check your account and provider settings.";
      }
      return msg;
    }
    return `${msg}: ${e.responseBody}`;
  }).trim();
}
/**
 * Coerce a value to a plain object: parse a JSON string, pass through objects,
 * and return undefined for anything that is not (or does not parse to) an object.
 * @param {*} input - A JSON string or value to coerce.
 * @returns {Object} The parsed object, or undefined.
 */
function json(input) {
  if (typeof input === "string") {
    try {
      const result = JSON.parse(input);
      if (result && typeof result === "object") return result;
      return undefined;
    } catch {
      return undefined;
    }
  }
  if (typeof input === "object" && input !== null) {
    return input;
  }
  return undefined;
}
/**
 * Parse an error object delivered inside a streaming response into a normalized
 * error, mapping known error codes (context_length_exceeded, insufficient_quota,
 * usage_not_included, invalid_prompt, server_error) to their type and retryability.
 * @param {*} input - The raw stream error payload (object or JSON string).
 * @returns {Object} A normalized error `{type, message, ...}`, or undefined when not an error.
 */
export function parseStreamError(input) {
  const raw = json(input);
  const body = typeof raw?.message === "string" ? json(raw.message) ?? raw : raw;
  if (!body) return;
  const responseBody = JSON.stringify(body);
  if (body.type !== "error") return;
  switch (body?.error?.code) {
    case "context_length_exceeded":
      return {
        type: "context_overflow",
        message: "Input exceeds context window of this model",
        responseBody
      };
    case "insufficient_quota":
      return {
        type: "api_error",
        message: "Quota exceeded. Check your plan and billing details.",
        isRetryable: false,
        responseBody
      };
    case "usage_not_included":
      return {
        type: "api_error",
        message: "To use Codex with your ChatGPT plan, upgrade to Plus: https://chatgpt.com/explore/plus.",
        isRetryable: false,
        responseBody
      };
    case "invalid_prompt":
      return {
        type: "api_error",
        message: typeof body?.error?.message === "string" ? body?.error?.message : "Invalid prompt.",
        isRetryable: false,
        responseBody
      };
    case "server_error":
      return {
        type: "api_error",
        message: typeof body?.error?.message === "string" ? body?.error?.message : "Server error.",
        isRetryable: true,
        responseBody
      };
  }
}
/**
 * Normalize a non-streaming API call error into a common shape, classifying it as
 * "context_overflow" (via {@link isOverflow}, a 413, or an explicit
 * context_length_exceeded code) or otherwise "api_error" with status/retry info.
 * @param {Object} input - `{providerID: string, error: Object}` — the provider id and the raw API error.
 * @returns {Object} A normalized error descriptor.
 */
export function parseAPICallError(input) {
  const m = message(input.providerID, input.error);
  const body = json(input.error.responseBody);
  if (isOverflow(m) || input.error.statusCode === 413 || body?.error?.code === "context_length_exceeded") {
    return {
      type: "context_overflow",
      message: m,
      responseBody: input.error.responseBody
    };
  }
  const metadata = input.error.url ? {
    url: input.error.url
  } : undefined;
  return {
    type: "api_error",
    message: m,
    statusCode: input.error.statusCode,
    isRetryable: input.providerID.startsWith("openai") ? isOpenAiErrorRetryable(input.error) : input.error.isRetryable,
    responseHeaders: input.error.responseHeaders,
    responseBody: input.error.responseBody,
    metadata
  };
}
export * as ProviderError from "./error.js";