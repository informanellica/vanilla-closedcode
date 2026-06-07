export function selectionFromLines(selection) {
  if (!selection) return undefined;
  return {
    startLine: selection.start,
    startChar: 0,
    endLine: selection.end,
    endChar: 0
  };
}
const pool = ["src/session/timeline.tsx", "src/session/composer.tsx", "src/components/prompt-input.tsx", "src/components/session-todo-dock.tsx", "README.md"];
export function useFile() {
  return {
    tab(path) {
      return `file:${path}`;
    },
    pathFromTab(tab) {
      if (!tab.startsWith("file:")) return "";
      return tab.slice(5);
    },
    load: async () => undefined,
    async searchFilesAndDirectories(query) {
      const text = query.trim().toLowerCase();
      if (!text) return pool;
      return pool.filter(path => path.toLowerCase().includes(text));
    }
  };
}