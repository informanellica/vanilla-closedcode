/** @file Derives display colors for agents, with stable hashing for unknown names. */
const defaults = {
  ask: "var(--icon-agent-ask-base)",
  build: "var(--icon-agent-build-base)",
  docs: "var(--icon-agent-docs-base)",
  plan: "var(--icon-agent-plan-base)"
};
const palette = ["var(--icon-agent-ask-base)", "var(--icon-agent-build-base)", "var(--icon-agent-docs-base)", "var(--icon-agent-plan-base)", "var(--syntax-info)", "var(--syntax-success)", "var(--syntax-warning)", "var(--syntax-property)", "var(--syntax-constant)", "var(--text-diff-add-base)", "var(--text-diff-delete-base)", "var(--icon-warning-base)"];
/**
 * Pick a deterministic palette color for a name by hashing its characters.
 * @param {string} name - The agent name to hash.
 * @returns {string} A CSS color variable expression from the palette.
 */
function tone(name) {
  let hash = 0;
  for (const char of name) hash = hash * 31 + char.charCodeAt(0) >>> 0;
  return palette[hash % palette.length];
}
/**
 * Resolve the color for an agent: an explicit custom color, a built-in default,
 * or a hashed palette color as a fallback.
 * @param {string} name - The agent name.
 * @param {string} custom - An optional explicit color that overrides all others.
 * @returns {string} A CSS color value for the agent.
 */
export function agentColor(name, custom) {
  if (custom) return custom;
  return defaults[name] ?? defaults[name.toLowerCase()] ?? tone(name.toLowerCase());
}
/**
 * Find the color of the agent from the most recent user message that has an agent set.
 * @param {Array} list - The message list, scanned from newest to oldest.
 * @param {Array} agents - The available agents, used to look up a configured custom color.
 * @returns {string} The resolved agent color, or undefined when no matching message exists.
 */
export function messageAgentColor(list, agents) {
  if (!list) return undefined;
  for (let i = list.length - 1; i >= 0; i--) {
    const item = list[i];
    if (item.role !== "user" || !item.agent) continue;
    return agentColor(item.agent, agents.find(agent => agent.name === item.agent)?.color);
  }
}