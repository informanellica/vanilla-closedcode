export function defer(fn) {
  return {
    [Symbol.dispose]() {
      void fn();
    },
    [Symbol.asyncDispose]() {
      return Promise.resolve(fn());
    }
  };
}