export function lazy(fn) {
  let value;
  let loaded = false;
  return () => {
    if (loaded) return value;
    loaded = true;
    value = fn();
    return value;
  };
}