/** @file Estimates how a session's context window is divided among system/user/assistant/tool/other content, producing per-category token counts, widths, and percentages. */
/**
 * Estimate token count from a character count (roughly 4 characters per token).
 * @param {number} chars - The character count.
 * @returns {number} The estimated token count.
 */
const estimateTokens = chars => Math.ceil(chars / 4);
/**
 * Compute a category's share of the context window as a raw percentage.
 * @param {number} tokens - The category's token count.
 * @param {number} input - The total input/context token budget.
 * @returns {number} The percentage of the budget used.
 */
const toPercent = (tokens, input) => tokens / input * 100;
/**
 * Compute a category's percentage share rounded to one decimal place (for display).
 * @param {number} tokens - The category's token count.
 * @param {number} input - The total input/context token budget.
 * @returns {number} The percentage rounded to one decimal.
 */
const toPercentLabel = (tokens, input) => Math.round(toPercent(tokens, input) * 10) / 10;
/**
 * Count the characters contributed by a single user-message part (text, file source, or agent source).
 * @param {Object} part - A user-message part.
 * @returns {number} The character count for the part.
 */
const charsFromUserPart = part => {
  if (part.type === "text") return part.text.length;
  if (part.type === "file") return part.source?.text.value.length ?? 0;
  if (part.type === "agent") return part.source?.value.length ?? 0;
  return 0;
};
/**
 * Count the characters contributed by an assistant-message part, split into assistant text vs. tool I/O.
 * Tool parts include their serialized input plus their raw/output/error payload depending on status.
 * @param {Object} part - An assistant-message part (text, reasoning, or tool).
 * @returns {Object} An object {assistant, tool} of character counts.
 */
const charsFromAssistantPart = part => {
  if (part.type === "text") return {
    assistant: part.text.length,
    tool: 0
  };
  if (part.type === "reasoning") return {
    assistant: part.text.length,
    tool: 0
  };
  if (part.type !== "tool") return {
    assistant: 0,
    tool: 0
  };
  const input = Object.keys(part.state.input).length * 16;
  if (part.state.status === "pending") return {
    assistant: 0,
    tool: input + part.state.raw.length
  };
  if (part.state.status === "completed") return {
    assistant: 0,
    tool: input + part.state.output.length
  };
  if (part.state.status === "error") return {
    assistant: 0,
    tool: input + part.state.error.length
  };
  return {
    assistant: 0,
    tool: input
  };
};
/**
 * Build the breakdown rows from per-category token counts, dropping empty categories and computing each
 * one's width and display percentage relative to the budget.
 * @param {Object} tokens - Per-category token counts: {system, user, assistant, tool, other}.
 * @param {number} input - The total input/context token budget.
 * @returns {Array} Breakdown entries {key, tokens, width, percent} for non-empty categories.
 */
const build = (tokens, input) => {
  return [{
    key: "system",
    tokens: tokens.system
  }, {
    key: "user",
    tokens: tokens.user
  }, {
    key: "assistant",
    tokens: tokens.assistant
  }, {
    key: "tool",
    tokens: tokens.tool
  }, {
    key: "other",
    tokens: tokens.other
  }].filter(x => x.tokens > 0).map(x => ({
    key: x.key,
    tokens: x.tokens,
    width: toPercent(x.tokens, input),
    percent: toPercentLabel(x.tokens, input)
  }));
};
/**
 * Estimate how the session's context window is allocated across system prompt, user, assistant, tool, and
 * leftover ("other") content, scaling the estimate down proportionally when it exceeds the input budget.
 * @param {Object} args - Inputs: {input, messages, parts, systemPrompt}, where `input` is the token budget, `messages` lists messages, `parts` maps message id to its parts, and `systemPrompt` is the system prompt text.
 * @returns {Array} Breakdown entries {key, tokens, width, percent}; empty when there is no input budget.
 */
export function estimateSessionContextBreakdown(args) {
  if (!args.input) return [];
  const counts = args.messages.reduce((acc, msg) => {
    const parts = args.parts[msg.id] ?? [];
    if (msg.role === "user") {
      const user = parts.reduce((sum, part) => sum + charsFromUserPart(part), 0);
      return {
        ...acc,
        user: acc.user + user
      };
    }
    if (msg.role !== "assistant") return acc;
    const assistant = parts.reduce((sum, part) => {
      const next = charsFromAssistantPart(part);
      return {
        assistant: sum.assistant + next.assistant,
        tool: sum.tool + next.tool
      };
    }, {
      assistant: 0,
      tool: 0
    });
    return {
      ...acc,
      assistant: acc.assistant + assistant.assistant,
      tool: acc.tool + assistant.tool
    };
  }, {
    system: args.systemPrompt?.length ?? 0,
    user: 0,
    assistant: 0,
    tool: 0
  });
  const tokens = {
    system: estimateTokens(counts.system),
    user: estimateTokens(counts.user),
    assistant: estimateTokens(counts.assistant),
    tool: estimateTokens(counts.tool)
  };
  const estimated = tokens.system + tokens.user + tokens.assistant + tokens.tool;
  if (estimated <= args.input) {
    return build({
      ...tokens,
      other: args.input - estimated
    }, args.input);
  }
  const scale = args.input / estimated;
  const scaled = {
    system: Math.floor(tokens.system * scale),
    user: Math.floor(tokens.user * scale),
    assistant: Math.floor(tokens.assistant * scale),
    tool: Math.floor(tokens.tool * scale)
  };
  const total = scaled.system + scaled.user + scaled.assistant + scaled.tool;
  return build({
    ...scaled,
    other: Math.max(0, args.input - total)
  }, args.input);
}