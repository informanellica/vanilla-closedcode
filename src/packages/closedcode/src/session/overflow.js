/**
 * @file Context-window math for session compaction: computes the usable input
 * budget for a model and whether current token usage overflows it.
 */
import { ProviderTransform } from "#provider/transform.js";
const COMPACTION_BUFFER = 20_000;
/**
 * Compute the usable input-token budget for a model, reserving headroom for the
 * response. Uses the model's explicit input limit minus a reserved buffer when
 * available, otherwise the context window minus max output tokens.
 * @param {Object} input - `{ model, cfg }` with the model's limits and config (compaction.reserved).
 * @returns {number} The usable input-token budget (0 when context is 0).
 */
export function usable(input) {
  const context = input.model.limit.context;
  if (context === 0) return 0;
  const reserved = input.cfg.compaction?.reserved ?? Math.min(COMPACTION_BUFFER, ProviderTransform.maxOutputTokens(input.model));
  return input.model.limit.input ? Math.max(0, input.model.limit.input - reserved) : Math.max(0, context - ProviderTransform.maxOutputTokens(input.model));
}
/**
 * Decide whether current token usage exceeds the model's usable budget and
 * should trigger compaction. Always false when auto-compaction is disabled or
 * the model has no context limit.
 * @param {Object} input - `{ cfg, model, tokens }` where tokens carries total or input/output/cache counts.
 * @returns {boolean} True when used tokens are at or above the usable budget.
 */
export function isOverflow(input) {
  if (input.cfg.compaction?.auto === false) return false;
  if (input.model.limit.context === 0) return false;
  const count = input.tokens.total || input.tokens.input + input.tokens.output + input.tokens.cache.read + input.tokens.cache.write;
  return count >= usable(input);
}