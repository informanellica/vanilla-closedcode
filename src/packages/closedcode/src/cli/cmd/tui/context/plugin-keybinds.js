const txt = value => {
  if (typeof value !== "string") return;
  if (!value.trim()) return;
  return value;
};
export function createPluginKeybind(base, defaults, overrides) {
  const all = Object.freeze(Object.fromEntries(Object.entries(defaults).map(([name, value]) => [name, txt(overrides?.[name]) ?? value])));
  const get = name => all[name] ?? name;
  return {
    get all() {
      return all;
    },
    get,
    match: (name, evt) => base.match(get(name), evt),
    print: name => base.print(get(name))
  };
}