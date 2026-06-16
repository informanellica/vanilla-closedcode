/** @file Derives context usage metrics (token totals, cost, context window usage) from a session's messages. */
/**
 * Sum every token bucket (input, output, reasoning, cache read/write) for a message.
 * @param {Object} msg - A session message carrying a tokens breakdown.
 * @returns {number} Total token count across all buckets.
 */
const tokenTotal = msg => {
  return msg.tokens.input + msg.tokens.output + msg.tokens.reasoning + msg.tokens.cache.read + msg.tokens.cache.write;
};
/**
 * Find the most recent assistant message that actually consumed tokens.
 * @param {Array} messages - Session messages in chronological order.
 * @returns {Object} The last token-bearing assistant message, or undefined if none.
 */
const lastAssistantWithTokens = messages => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "assistant") continue;
    if (tokenTotal(msg) <= 0) continue;
    return msg;
  }
};
/**
 * Compute total session cost and the context snapshot for the latest token-bearing
 * assistant message (provider/model labels, per-bucket token counts, context limit,
 * and usage percentage).
 * @param {Array} messages - Session messages to aggregate.
 * @param {Array} providers - Available providers, each with id and a models map, used to resolve labels and limits.
 * @returns {Object} Object with totalCost and an optional context record describing the latest assistant turn.
 */
const build = (messages = [], providers = []) => {
  const totalCost = messages.reduce((sum, msg) => sum + (msg.role === "assistant" ? msg.cost : 0), 0);
  const message = lastAssistantWithTokens(messages);
  if (!message) return {
    totalCost,
    context: undefined
  };
  const provider = providers.find(item => item.id === message.providerID);
  const model = provider?.models[message.modelID];
  const limit = model?.limit.context;
  const total = tokenTotal(message);
  return {
    totalCost,
    context: {
      message,
      provider,
      model,
      providerLabel: provider?.name ?? message.providerID,
      modelLabel: model?.name ?? message.modelID,
      limit,
      input: message.tokens.input,
      output: message.tokens.output,
      reasoning: message.tokens.reasoning,
      cacheRead: message.tokens.cache.read,
      cacheWrite: message.tokens.cache.write,
      total,
      usage: limit ? Math.round(total / limit * 100) : null
    }
  };
};
/**
 * Public entry point: derive context usage metrics for a session.
 * @param {Array} messages - Session messages to aggregate.
 * @param {Array} providers - Available providers used to resolve labels and context limits.
 * @returns {Object} Object with totalCost and an optional context snapshot (see build).
 */
export function getSessionContextMetrics(messages = [], providers = []) {
  return build(messages, providers);
}