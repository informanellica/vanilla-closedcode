const tokenTotal = msg => {
  return msg.tokens.input + msg.tokens.output + msg.tokens.reasoning + msg.tokens.cache.read + msg.tokens.cache.write;
};
const lastAssistantWithTokens = messages => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "assistant") continue;
    if (tokenTotal(msg) <= 0) continue;
    return msg;
  }
};
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
export function getSessionContextMetrics(messages = [], providers = []) {
  return build(messages, providers);
}