const value = {
  platform: "web",
  openLink() {},
  restart: async () => {},
  back() {},
  forward() {},
  notify: async () => {},
  fetch: globalThis.fetch.bind(globalThis),
  parseMarkdown: async markdown => markdown
};
export function usePlatform() {
  return value;
}