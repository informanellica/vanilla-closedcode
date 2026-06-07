export function lazy(fn) {
  let value;
  let loaded = false;
  const result = () => {
    if (loaded) return value;
    value = fn();
    loaded = true;
    return value;
  };
  result.reset = () => {
    loaded = false;
    value = undefined;
  };
  result.loaded = () => loaded;
  return result;
}