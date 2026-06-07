export { pathKey as directoryKey } from "@/utils/path-key.js";
export const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;
function isAgent(input) {
  if (!input || typeof input !== "object") return false;
  const item = input;
  if (typeof item.name !== "string") return false;
  return item.mode === "subagent" || item.mode === "primary" || item.mode === "all";
}
export function normalizeAgentList(input) {
  if (Array.isArray(input)) return input.filter(isAgent);
  if (isAgent(input)) return [input];
  if (!input || typeof input !== "object") return [];
  return Object.values(input).filter(isAgent);
}
export function normalizeProviderList(input) {
  return {
    ...input,
    all: input.all.map(provider => ({
      ...provider,
      models: Object.fromEntries(Object.entries(provider.models).filter(([, info]) => info.status !== "deprecated"))
    }))
  };
}
export function sanitizeProject(project) {
  if (!project.icon?.url && !project.icon?.override) return project;
  return {
    ...project,
    icon: {
      ...project.icon,
      url: undefined,
      override: undefined
    }
  };
}